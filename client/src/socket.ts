import { io, type Socket } from "socket.io-client";
import type { RoomStateForPlayer } from "../../shared/types.js";
import { SOCKET_EVENTS } from "../../shared/protocol.js";

let socket: Socket | null = null;

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
}

export function disconnectSocket() {
  if (socket) {
    socket.disconnect();
    socket = null;
  }
}
