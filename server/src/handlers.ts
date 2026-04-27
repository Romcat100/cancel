import type { Server, Socket } from "socket.io";
import {
  ackRoundEnd,
  addPlayer,
  createRoom,
  forceAdvanceRound,
  removePlayer,
  setRoomConfig,
  startGame,
  submitTurn,
  unsubmitTurn,
  type RoomDoc,
} from "./game/engine.js";
import { archiveRoom, findPlayerByClaim, generateRoomCode, loadRoom, newClaimToken, newPlayerId, recordPlayer, saveRoom } from "./rooms.js";
import { projectStateForPlayer } from "./projection.js";
import { SOCKET_EVENTS } from "../../shared/protocol.js";
import type {
  AbandonRoomReq,
  CreateRoomReq,
  JoinRoomReq,
  SetRoomConfigReq,
  StartGameReq,
  SubmitTurnReq,
  UnsubmitTurnReq,
  AckRoundEndReq,
  KickPlayerReq,
} from "../../shared/protocol.js";

const onlineByRoom = new Map<string, Map<string, Set<string>>>(); // roomCode -> playerId -> Set<socketId>

function trackOnline(roomCode: string, playerId: string, socketId: string) {
  let r = onlineByRoom.get(roomCode);
  if (!r) {
    r = new Map();
    onlineByRoom.set(roomCode, r);
  }
  let s = r.get(playerId);
  if (!s) {
    s = new Set();
    r.set(playerId, s);
  }
  s.add(socketId);
}

function untrackOnline(roomCode: string, playerId: string, socketId: string) {
  const r = onlineByRoom.get(roomCode);
  if (!r) return;
  const s = r.get(playerId);
  if (!s) return;
  s.delete(socketId);
  if (s.size === 0) r.delete(playerId);
  if (r.size === 0) onlineByRoom.delete(roomCode);
}

function onlineSet(roomCode: string): Set<string> {
  const r = onlineByRoom.get(roomCode);
  return new Set(r ? r.keys() : []);
}

export function broadcastRoom(io: Server, room: RoomDoc) {
  const online = onlineSet(room.code);
  // For each connected socket in the room, send their personal projection
  const namespace = io.sockets;
  const sids = namespace.adapter.rooms.get(`room:${room.code}`);
  if (!sids) return;
  for (const sid of sids) {
    const sock = namespace.sockets.get(sid);
    if (!sock) continue;
    const playerId = (sock.data as { playerId?: string }).playerId;
    if (!playerId) continue;
    try {
      const state = projectStateForPlayer(room, playerId, online);
      sock.emit(SOCKET_EVENTS.ROOM_STATE, state);
    } catch {
      // player not in room
    }
  }
}

export function attachSocketHandlers(io: Server) {
  io.on("connection", (socket: Socket) => {
    socket.on("auth", (req: { roomCode: string; claimToken: string }, ack?: (r: unknown) => void) => {
      try {
        const player = findPlayerByClaim(req.claimToken);
        if (!player || player.roomCode !== req.roomCode) {
          throw new Error("invalid claim");
        }
        socket.data = { roomCode: req.roomCode, playerId: player.id };
        socket.join(`room:${req.roomCode}`);
        trackOnline(req.roomCode, player.id, socket.id);
        const room = loadRoom(req.roomCode);
        if (!room) throw new Error("room gone");
        ack?.({ ok: true, state: projectStateForPlayer(room, player.id, onlineSet(req.roomCode)) });
        broadcastRoom(io, room);
      } catch (e) {
        ack?.({ ok: false, error: (e as Error).message });
      }
    });

    socket.on("disconnect", () => {
      const data = socket.data as { roomCode?: string; playerId?: string };
      if (data?.roomCode && data?.playerId) {
        untrackOnline(data.roomCode, data.playerId, socket.id);
        const room = loadRoom(data.roomCode);
        if (room) broadcastRoom(io, room);
      }
    });
  });
}

export interface ApiCtx {
  io: Server;
}

function authPlayer(roomCode: string, claimToken: string) {
  const player = findPlayerByClaim(claimToken);
  if (!player || player.roomCode !== roomCode) throw new Error("invalid claim");
  return player;
}

export function apiCreateRoom(req: CreateRoomReq, ctx: ApiCtx) {
  const code = generateRoomCode();
  const hostId = newPlayerId();
  const claimToken = newClaimToken();
  const rounds = req.rounds ?? 3;
  const turnDeadlineMs = req.turnDeadlineMs ?? null;
  const powerUps = req.powerUps ?? true;
  const room = createRoom({ code, hostId, hostName: req.name.trim(), rounds, turnDeadlineMs, powerUps });
  saveRoom(room);
  recordPlayer({ id: hostId, roomCode: code, name: req.name.trim(), seat: 0, claimToken });
  return {
    ok: true as const,
    roomCode: code,
    claimToken,
    playerId: hostId,
    state: projectStateForPlayer(room, hostId, new Set()),
  };
}

export function apiJoinRoom(req: JoinRoomReq, ctx: ApiCtx) {
  let room = loadRoom(req.roomCode);
  if (!room) throw new Error("room not found");

  if (req.claimToken) {
    const existing = findPlayerByClaim(req.claimToken);
    if (existing && existing.roomCode === req.roomCode) {
      const inGame = room.players.some((p) => p.id === existing.id);
      if (inGame) {
        return {
          ok: true as const,
          claimToken: req.claimToken,
          playerId: existing.id,
          state: projectStateForPlayer(room, existing.id, onlineSet(req.roomCode)),
        };
      }
    }
  }

  if (room.phase !== "lobby") throw new Error("game already started — cannot join");
  const playerId = newPlayerId();
  const claimToken = newClaimToken();
  const seat = room.players.length;
  room = addPlayer(room, playerId, req.name.trim());
  saveRoom(room);
  recordPlayer({ id: playerId, roomCode: req.roomCode, name: req.name.trim(), seat, claimToken });
  ctx.io && setImmediate(() => broadcastRoom(ctx.io, room));
  return {
    ok: true as const,
    claimToken,
    playerId,
    state: projectStateForPlayer(room, playerId, onlineSet(req.roomCode)),
  };
}

export function apiSetRoomConfig(req: SetRoomConfigReq, ctx: ApiCtx) {
  const player = authPlayer(req.roomCode, req.claimToken);
  let room = loadRoom(req.roomCode);
  if (!room) throw new Error("room not found");
  if (player.id !== room.hostId) throw new Error("only host can change settings");
  room = setRoomConfig(room, { powerUps: req.powerUps });
  saveRoom(room);
  setImmediate(() => broadcastRoom(ctx.io, room));
  return { ok: true as const, state: projectStateForPlayer(room, player.id, onlineSet(req.roomCode)) };
}

export function apiStartGame(req: StartGameReq, ctx: ApiCtx) {
  const player = authPlayer(req.roomCode, req.claimToken);
  let room = loadRoom(req.roomCode);
  if (!room) throw new Error("room not found");
  if (player.id !== room.hostId) throw new Error("only host can start");
  room = startGame(room);
  saveRoom(room);
  setImmediate(() => broadcastRoom(ctx.io, room));
  return { ok: true as const, state: projectStateForPlayer(room, player.id, onlineSet(req.roomCode)) };
}

export function apiAckRoundEnd(req: AckRoundEndReq, ctx: ApiCtx) {
  const player = authPlayer(req.roomCode, req.claimToken);
  let room = loadRoom(req.roomCode);
  if (!room) throw new Error("room not found");
  room = ackRoundEnd(room, player.id);
  saveRoom(room);
  setImmediate(() => broadcastRoom(ctx.io, room));
  return { ok: true as const, state: projectStateForPlayer(room, player.id, onlineSet(req.roomCode)) };
}

export function apiForceAdvance(req: AckRoundEndReq, ctx: ApiCtx) {
  const player = authPlayer(req.roomCode, req.claimToken);
  let room = loadRoom(req.roomCode);
  if (!room) throw new Error("room not found");
  room = forceAdvanceRound(room, player.id);
  saveRoom(room);
  setImmediate(() => broadcastRoom(ctx.io, room));
  return { ok: true as const, state: projectStateForPlayer(room, player.id, onlineSet(req.roomCode)) };
}

export function apiSubmitTurn(req: SubmitTurnReq, ctx: ApiCtx) {
  const player = authPlayer(req.roomCode, req.claimToken);
  let room = loadRoom(req.roomCode);
  if (!room) throw new Error("room not found");
  room = submitTurn(room, {
    playerId: player.id,
    number: req.number,
    powerUp: req.powerUp,
    powerUpTarget: req.powerUpTarget,
    sabotageNumber: req.sabotageNumber,
  });
  saveRoom(room);
  setImmediate(() => broadcastRoom(ctx.io, room));
  return { ok: true as const, state: projectStateForPlayer(room, player.id, onlineSet(req.roomCode)) };
}

export function apiUnsubmitTurn(req: UnsubmitTurnReq, ctx: ApiCtx) {
  const player = authPlayer(req.roomCode, req.claimToken);
  let room = loadRoom(req.roomCode);
  if (!room) throw new Error("room not found");
  room = unsubmitTurn(room, player.id);
  saveRoom(room);
  setImmediate(() => broadcastRoom(ctx.io, room));
  return { ok: true as const, state: projectStateForPlayer(room, player.id, onlineSet(req.roomCode)) };
}

export function apiKickPlayer(req: KickPlayerReq, ctx: ApiCtx) {
  const player = authPlayer(req.roomCode, req.claimToken);
  let room = loadRoom(req.roomCode);
  if (!room) throw new Error("room not found");
  if (player.id !== room.hostId) throw new Error("only host can kick");
  room = removePlayer(room, req.targetPlayerId);
  saveRoom(room);
  setImmediate(() => broadcastRoom(ctx.io, room));
  return { ok: true as const, state: projectStateForPlayer(room, player.id, onlineSet(req.roomCode)) };
}

export function apiAbandonRoom(req: AbandonRoomReq, ctx: ApiCtx) {
  const player = authPlayer(req.roomCode, req.claimToken);
  const room = loadRoom(req.roomCode);
  if (!room) throw new Error("room not found");
  if (player.id !== room.hostId) throw new Error("only host can abandon");
  archiveRoom(req.roomCode, "archived");
  setImmediate(() => {
    ctx.io.to(`room:${req.roomCode}`).emit(SOCKET_EVENTS.ROOM_ABANDONED, { roomCode: req.roomCode });
  });
  return { ok: true as const };
}

export function apiFetchState(roomCode: string, claimToken: string) {
  const player = authPlayer(roomCode, claimToken);
  const room = loadRoom(roomCode);
  if (!room) throw new Error("room not found");
  return { ok: true as const, state: projectStateForPlayer(room, player.id, onlineSet(roomCode)) };
}
