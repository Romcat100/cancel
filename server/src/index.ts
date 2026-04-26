import express, { type Response } from "express";
import http from "node:http";
import path from "node:path";
import { fileURLToPath } from "node:url";
import fs from "node:fs";
import os from "node:os";
import { Server as SocketServer } from "socket.io";
import { getDb } from "./db.js";
import {
  attachSocketHandlers,
  apiCreateRoom,
  apiJoinRoom,
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
});
