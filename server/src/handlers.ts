import type { Server, Socket } from "socket.io";
import {
  ackRoundEnd,
  addPlayer,
  createRoom,
  forceAdvanceRound,
  removePlayer,
  resetToLobby,
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
  PlayAgainReq,
  PingPlayerReq,
} from "../../shared/protocol.js";

const PING_COOLDOWN_MS = 3000;
const pingLastAt = new Map<string, number>();

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
          throw new Error("Invalid claim");
        }
        socket.data = { roomCode: req.roomCode, playerId: player.id };
        socket.join(`room:${req.roomCode}`);
        trackOnline(req.roomCode, player.id, socket.id);
        const room = loadRoom(req.roomCode);
        if (!room) throw new Error("Room gone");
        ack?.({ ok: true, state: projectStateForPlayer(room, player.id, onlineSet(req.roomCode)) });
        broadcastRoom(io, room);
      } catch (e) {
        ack?.({ ok: false, error: (e as Error).message });
      }
    });

    socket.on(SOCKET_EVENTS.PING_PLAYER, (req: PingPlayerReq) => {
      try {
        const data = socket.data as { roomCode?: string; playerId?: string };
        if (!data?.roomCode || !data?.playerId) return;
        const targetId = req?.targetPlayerId;
        if (!targetId || targetId === data.playerId) return;

        const room = loadRoom(data.roomCode);
        if (!room) return;
        // Pings only during active play. Lobby/game_end are quiet.
        if (room.phase === "lobby" || room.phase === "game_end") return;
        if (!room.players.some((p) => p.id === targetId)) return;

        const key = `${data.roomCode}:${data.playerId}:${targetId}`;
        const now = Date.now();
        const last = pingLastAt.get(key);
        if (last !== undefined && now - last < PING_COOLDOWN_MS) return;
        pingLastAt.set(key, now);
        // Self-expire so the Map doesn't grow unboundedly over many rooms.
        setTimeout(() => pingLastAt.delete(key), PING_COOLDOWN_MS).unref?.();

        io.to(`room:${data.roomCode}`).emit(SOCKET_EVENTS.PING_PLAYER, {
          fromPlayerId: data.playerId,
          toPlayerId: targetId,
        });
      } catch {
        // best-effort; pings are ephemeral
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
  if (!player || player.roomCode !== roomCode) throw new Error("Invalid claim");
  return player;
}

export function apiCreateRoom(req: CreateRoomReq, ctx: ApiCtx) {
  const code = generateRoomCode();
  const hostId = newPlayerId();
  const claimToken = newClaimToken();
  const rounds = req.rounds ?? 3;
  const turnDeadlineMs = req.turnDeadlineMs ?? null;
  const powerUpMode = req.powerUpMode ?? "random";
  const selectedPowerUps = req.selectedPowerUps ?? [];
  const showHands = req.showHands ?? true;
  const numberMode = req.numberMode ?? "default";
  const customNumbers = req.customNumbers ?? [];
  const room = createRoom({
    code,
    hostId,
    hostName: req.name.trim(),
    rounds,
    turnDeadlineMs,
    powerUpMode,
    selectedPowerUps,
    showHands,
    numberMode,
    customNumbers,
  });
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
  if (!room) throw new Error("Room not found");

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

  if (room.phase !== "lobby") throw new Error("Game already started — cannot join");
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
  if (!room) throw new Error("Room not found");
  if (player.id !== room.hostId) throw new Error("Only host can change settings");
  room = setRoomConfig(room, {
    rounds: req.rounds,
    powerUpMode: req.powerUpMode,
    selectedPowerUps: req.selectedPowerUps,
    showHands: req.showHands,
    numberMode: req.numberMode,
    customNumbers: req.customNumbers,
  });
  saveRoom(room);
  setImmediate(() => broadcastRoom(ctx.io, room));
  return { ok: true as const, state: projectStateForPlayer(room, player.id, onlineSet(req.roomCode)) };
}

export function apiStartGame(req: StartGameReq, ctx: ApiCtx) {
  const player = authPlayer(req.roomCode, req.claimToken);
  let room = loadRoom(req.roomCode);
  if (!room) throw new Error("Room not found");
  if (player.id !== room.hostId) throw new Error("Only host can start");
  room = startGame(room);
  saveRoom(room);
  setImmediate(() => broadcastRoom(ctx.io, room));
  return { ok: true as const, state: projectStateForPlayer(room, player.id, onlineSet(req.roomCode)) };
}

export function apiAckRoundEnd(req: AckRoundEndReq, ctx: ApiCtx) {
  const player = authPlayer(req.roomCode, req.claimToken);
  let room = loadRoom(req.roomCode);
  if (!room) throw new Error("Room not found");
  room = ackRoundEnd(room, player.id);
  saveRoom(room);
  setImmediate(() => broadcastRoom(ctx.io, room));
  return { ok: true as const, state: projectStateForPlayer(room, player.id, onlineSet(req.roomCode)) };
}

export function apiForceAdvance(req: AckRoundEndReq, ctx: ApiCtx) {
  const player = authPlayer(req.roomCode, req.claimToken);
  let room = loadRoom(req.roomCode);
  if (!room) throw new Error("Room not found");
  room = forceAdvanceRound(room, player.id);
  saveRoom(room);
  setImmediate(() => broadcastRoom(ctx.io, room));
  return { ok: true as const, state: projectStateForPlayer(room, player.id, onlineSet(req.roomCode)) };
}

export function apiSubmitTurn(req: SubmitTurnReq, ctx: ApiCtx) {
  const player = authPlayer(req.roomCode, req.claimToken);
  let room = loadRoom(req.roomCode);
  if (!room) throw new Error("Room not found");
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
  if (!room) throw new Error("Room not found");
  room = unsubmitTurn(room, player.id);
  saveRoom(room);
  setImmediate(() => broadcastRoom(ctx.io, room));
  return { ok: true as const, state: projectStateForPlayer(room, player.id, onlineSet(req.roomCode)) };
}

export function apiKickPlayer(req: KickPlayerReq, ctx: ApiCtx) {
  const player = authPlayer(req.roomCode, req.claimToken);
  let room = loadRoom(req.roomCode);
  if (!room) throw new Error("Room not found");
  if (player.id !== room.hostId) throw new Error("Only host can kick");
  room = removePlayer(room, req.targetPlayerId);
  saveRoom(room);
  setImmediate(() => broadcastRoom(ctx.io, room));
  return { ok: true as const, state: projectStateForPlayer(room, player.id, onlineSet(req.roomCode)) };
}

export function apiPlayAgain(req: PlayAgainReq, ctx: ApiCtx) {
  const player = authPlayer(req.roomCode, req.claimToken);
  let room = loadRoom(req.roomCode);
  if (!room) throw new Error("Room not found");
  if (player.id !== room.hostId) throw new Error("Only host can start a new game");
  room = resetToLobby(room);
  saveRoom(room);
  setImmediate(() => broadcastRoom(ctx.io, room));
  return { ok: true as const, state: projectStateForPlayer(room, player.id, onlineSet(req.roomCode)) };
}

export function apiAbandonRoom(req: AbandonRoomReq, ctx: ApiCtx) {
  const player = authPlayer(req.roomCode, req.claimToken);
  const room = loadRoom(req.roomCode);
  if (!room) throw new Error("Room not found");
  if (player.id !== room.hostId) throw new Error("Only host can abandon");
  archiveRoom(req.roomCode, "archived");
  setImmediate(() => {
    ctx.io.to(`room:${req.roomCode}`).emit(SOCKET_EVENTS.ROOM_ABANDONED, { roomCode: req.roomCode });
  });
  return { ok: true as const };
}

export function apiFetchState(roomCode: string, claimToken: string) {
  const player = authPlayer(roomCode, claimToken);
  const room = loadRoom(roomCode);
  if (!room) throw new Error("Room not found");
  return { ok: true as const, state: projectStateForPlayer(room, player.id, onlineSet(roomCode)) };
}
