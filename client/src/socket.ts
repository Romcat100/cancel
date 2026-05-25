import { io, type Socket } from "socket.io-client";
import type { RoomStateForPlayer } from "../../shared/types.js";
import { SOCKET_EVENTS, type PlayerPingedEvent } from "../../shared/protocol.js";

let socket: Socket | null = null;
const pingListeners = new Set<(ev: PlayerPingedEvent) => void>();

export interface SocketHandlers {
  onRoomState: (state: RoomStateForPlayer) => void;
  onRoomAbandoned?: () => void;
}

export function connectSocket(roomCode: string, claimToken: string, handlers: SocketHandlers) {
  if (socket) {
    socket.disconnect();
    socket = null;
  }
  socket = io({ transports: ["websocket"], autoConnect: true });
  socket.on("connect", () => {
    socket!.emit("auth", { roomCode, claimToken }, (res: unknown) => {
      const r = res as { ok: boolean; state?: RoomStateForPlayer; error?: string };
      if (r.ok && r.state) handlers.onRoomState(r.state);
    });
  });
  socket.on(SOCKET_EVENTS.ROOM_STATE, (s: RoomStateForPlayer) => handlers.onRoomState(s));
  socket.on(SOCKET_EVENTS.ROOM_ABANDONED, () => handlers.onRoomAbandoned?.());
  socket.on(SOCKET_EVENTS.PING_PLAYER, (ev: PlayerPingedEvent) => {
    for (const l of pingListeners) l(ev);
  });
}

export function disconnectSocket() {
  if (socket) {
    socket.disconnect();
    socket = null;
  }
}

export function emitPing(targetPlayerId: string) {
  socket?.emit(SOCKET_EVENTS.PING_PLAYER, { targetPlayerId });
}

export function onPing(listener: (ev: PlayerPingedEvent) => void): () => void {
  pingListeners.add(listener);
  return () => void pingListeners.delete(listener);
}
