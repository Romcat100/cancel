import express, { type Response } from "express";
import http from "node:http";
import path from "node:path";
import { fileURLToPath } from "node:url";
import fs from "node:fs";
import os from "node:os";
import { Server as SocketServer } from "socket.io";
import { getDb } from "./db.js";
import { countActiveGames, gcAbandoned } from "./rooms.js";
import {
  attachSocketHandlers,
  apiCreateRoom,
  apiJoinRoom,
  apiSetRoomConfig,
  apiStartGame,
  apiSubmitTurn,
  apiUnsubmitTurn,
  apiAckRoundEnd,
  apiForceAdvance,
  apiKickPlayer,
  apiAbandonRoom,
  apiFetchState,
} from "./handlers.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const PORT = parseInt(process.env.PORT ?? "3001", 10);

getDb();

const app = express();
app.use(express.json());

const server = http.createServer(app);
const io = new SocketServer(server, {
  cors: { origin: true, credentials: true },
});
attachSocketHandlers(io);

const ctx = { io };

function safe<T>(res: Response, fn: () => T) {
  try {
    res.json(fn());
  } catch (e) {
    res.status(400).json({ ok: false, error: (e as Error).message });
  }
}

app.get("/api/health", (_req, res) => res.json({ ok: true }));

app.post("/api/rooms", (req, res) => safe(res, () => apiCreateRoom(req.body, ctx)));
app.post("/api/rooms/:code/join", (req, res) =>
  safe(res, () => apiJoinRoom({ ...req.body, roomCode: req.params.code }, ctx)),
);
app.post("/api/rooms/:code/start", (req, res) =>
  safe(res, () => apiStartGame({ ...req.body, roomCode: req.params.code }, ctx)),
);
app.post("/api/rooms/:code/config", (req, res) =>
  safe(res, () => apiSetRoomConfig({ ...req.body, roomCode: req.params.code }, ctx)),
);
app.post("/api/rooms/:code/ack-round-end", (req, res) =>
  safe(res, () => apiAckRoundEnd({ ...req.body, roomCode: req.params.code }, ctx)),
);
app.post("/api/rooms/:code/force-advance", (req, res) =>
  safe(res, () => apiForceAdvance({ ...req.body, roomCode: req.params.code }, ctx)),
);
app.post("/api/rooms/:code/submit", (req, res) =>
  safe(res, () => apiSubmitTurn({ ...req.body, roomCode: req.params.code }, ctx)),
);
app.post("/api/rooms/:code/unsubmit", (req, res) =>
  safe(res, () => apiUnsubmitTurn({ ...req.body, roomCode: req.params.code }, ctx)),
);
app.post("/api/rooms/:code/kick", (req, res) =>
  safe(res, () => apiKickPlayer({ ...req.body, roomCode: req.params.code }, ctx)),
);
app.post("/api/rooms/:code/abandon", (req, res) =>
  safe(res, () => apiAbandonRoom({ ...req.body, roomCode: req.params.code }, ctx)),
);
app.get("/api/rooms/:code/state", (req, res) =>
  safe(res, () => apiFetchState(req.params.code, String(req.query.claimToken))),
);

const clientDist = path.resolve(__dirname, "../../client/dist");
if (fs.existsSync(clientDist)) {
  app.use(express.static(clientDist));
  app.get(/^(?!\/api|\/socket\.io).*/, (_req, res) => res.sendFile(path.join(clientDist, "index.html")));
}

function lanUrl() {
  const ifaces = os.networkInterfaces();
  for (const list of Object.values(ifaces)) {
    if (!list) continue;
    for (const iface of list) {
      if (iface.family === "IPv4" && !iface.internal) return `http://${iface.address}:${PORT}`;
    }
  }
  return null;
}

server.listen(PORT, () => {
  console.log(`Cancel server listening on http://localhost:${PORT}`);
  const lan = lanUrl();
  if (lan) console.log(`LAN access: ${lan}`);
  startKeepAlive();
  startRoomGc();
});

// Render's free tier spins down after ~15 min of no inbound traffic. While async
// games are still in progress, ping our own public URL on a slow interval so the
// instance stays warm and players don't hit a 50s cold start when they return.
// No-op locally (RENDER_EXTERNAL_URL is only set on Render).
function startKeepAlive() {
  const externalUrl = (process.env.RENDER_EXTERNAL_URL ?? process.env.PUBLIC_URL)?.replace(/\/$/, "");
  if (!externalUrl) return;
  const intervalMs = parseInt(process.env.KEEPALIVE_INTERVAL_MS ?? String(10 * 60 * 1000), 10);
  console.log(`Keep-alive enabled: ${externalUrl}/api/health every ${Math.round(intervalMs / 60000)}m while games are active`);
  setInterval(async () => {
    try {
      if (countActiveGames() === 0) return;
      const r = await fetch(`${externalUrl}/api/health`);
      console.log(`[keepalive] ${r.status}`);
    } catch (e) {
      console.warn(`[keepalive] failed: ${(e as Error).message}`);
    }
  }, intervalMs).unref();
}

function startRoomGc() {
  const maxAgeMs = parseInt(process.env.ROOM_GC_MAX_AGE_MS ?? String(90 * 24 * 60 * 60 * 1000), 10);
  const intervalMs = parseInt(process.env.ROOM_GC_INTERVAL_MS ?? String(24 * 60 * 60 * 1000), 10);
  const sweep = () => {
    try {
      const archived = gcAbandoned(maxAgeMs);
      if (archived > 0) console.log(`[room-gc] archived ${archived} stale rooms`);
    } catch (e) {
      console.warn(`[room-gc] failed: ${(e as Error).message}`);
    }
  };
  sweep();
  setInterval(sweep, intervalMs).unref();
}
