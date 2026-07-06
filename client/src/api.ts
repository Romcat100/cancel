import type { CreateRoomRes, JoinRoomRes } from "../../shared/protocol.js";
import type { Difficulty, NumberMode, PowerUpId, PowerUpMode, RoomStateForPlayer, RoundPowerId } from "../../shared/types.js";

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
  createRoom(name: string, opts?: { solo?: boolean; bots?: number }) {
    return call<CreateRoomRes>("POST", "/api/rooms", { name, ...opts });
  },
  joinRoom(roomCode: string, name: string, claimToken?: string) {
    return call<JoinRoomRes>("POST", `/api/rooms/${roomCode}/join`, { name, claimToken });
  },
  startGame(roomCode: string, claimToken: string) {
    return call<{ ok: true; state: RoomStateForPlayer }>("POST", `/api/rooms/${roomCode}/start`, { claimToken });
  },
  setConfig(
    roomCode: string,
    claimToken: string,
    patch: {
      rounds?: number;
      powerUpMode?: PowerUpMode;
      selectedPowerUps?: PowerUpId[];
      selectedRoundPowers?: RoundPowerId[];
      showHands?: boolean;
      numberMode?: NumberMode;
      customNumbers?: number[];
      difficulty?: Difficulty;
    },
  ) {
    return call<{ ok: true; state: RoomStateForPlayer }>("POST", `/api/rooms/${roomCode}/config`, {
      claimToken,
      ...patch,
    });
  },
  setBotCount(roomCode: string, claimToken: string, count: number) {
    return call<{ ok: true; state: RoomStateForPlayer }>("POST", `/api/rooms/${roomCode}/bots`, {
      claimToken,
      count,
    });
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
    payload: { number: number; powerUp?: PowerUpId; powerUpTarget?: string; sabotageNumber?: number },
  ) {
    return call<{ ok: true; state: RoomStateForPlayer }>("POST", `/api/rooms/${roomCode}/submit`, {
      claimToken,
      ...payload,
    });
  },
  unsubmitTurn(roomCode: string, claimToken: string) {
    return call<{ ok: true; state: RoomStateForPlayer }>("POST", `/api/rooms/${roomCode}/unsubmit`, { claimToken });
  },
  fetchState(roomCode: string, claimToken: string) {
    return call<{ ok: true; state: RoomStateForPlayer }>(
      "GET",
      `/api/rooms/${roomCode}/state?claimToken=${encodeURIComponent(claimToken)}`,
    );
  },
  playAgain(roomCode: string, claimToken: string) {
    return call<{ ok: true; state: RoomStateForPlayer }>("POST", `/api/rooms/${roomCode}/play-again`, { claimToken });
  },
  abandonRoom(roomCode: string, claimToken: string) {
    return call<{ ok: true }>("POST", `/api/rooms/${roomCode}/abandon`, { claimToken });
  },
  stepDownHost(roomCode: string, claimToken: string) {
    return call<{ ok: true; state: RoomStateForPlayer }>("POST", `/api/rooms/${roomCode}/step-down-host`, { claimToken });
  },
  claimHost(roomCode: string, claimToken: string) {
    return call<{ ok: true; state: RoomStateForPlayer }>("POST", `/api/rooms/${roomCode}/claim-host`, { claimToken });
  },
  skipWaiting(roomCode: string, claimToken: string) {
    return call<{ ok: true; state: RoomStateForPlayer }>("POST", `/api/rooms/${roomCode}/skip-waiting`, { claimToken });
  },
};
