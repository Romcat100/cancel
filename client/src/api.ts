import type { CreateRoomRes, JoinRoomRes } from "../../shared/protocol.js";
import type { PowerUpId, RoomStateForPlayer } from "../../shared/types.js";

async function call<T>(method: string, path: string, body?: unknown): Promise<T> {
  const res = await fetch(path, {
    method,
    headers: { "content-type": "application/json" },
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = await res.json();
  if (!data.ok) throw new Error(data.error ?? "request failed");
  return data as T;
}

export const api = {
  createRoom(name: string) {
    return call<CreateRoomRes>("POST", "/api/rooms", { name });
  },
  joinRoom(roomCode: string, name: string, claimToken?: string) {
    return call<JoinRoomRes>("POST", `/api/rooms/${roomCode}/join`, { name, claimToken });
  },
  startGame(roomCode: string, claimToken: string) {
    return call<{ ok: true; state: RoomStateForPlayer }>("POST", `/api/rooms/${roomCode}/start`, { claimToken });
  },
  ackRoundEnd(roomCode: string, claimToken: string) {
    return call<{ ok: true; state: RoomStateForPlayer }>("POST", `/api/rooms/${roomCode}/ack-round-end`, { claimToken });
  },
  forceAdvance(roomCode: string, claimToken: string) {
    return call<{ ok: true; state: RoomStateForPlayer }>("POST", `/api/rooms/${roomCode}/force-advance`, { claimToken });
  },
  submitTurn(
    roomCode: string,
    claimToken: string,
    payload: { number: number; powerUp?: PowerUpId; powerUpTarget?: string },
  ) {
    return call<{ ok: true; state: RoomStateForPlayer }>("POST", `/api/rooms/${roomCode}/submit`, {
      claimToken,
      ...payload,
    });
  },
  fetchState(roomCode: string, claimToken: string) {
    return call<{ ok: true; state: RoomStateForPlayer }>(
      "GET",
      `/api/rooms/${roomCode}/state?claimToken=${encodeURIComponent(claimToken)}`,
    );
  },
  abandonRoom(roomCode: string, claimToken: string) {
    return call<{ ok: true }>("POST", `/api/rooms/${roomCode}/abandon`, { claimToken });
  },
};
