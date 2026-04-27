import type { PowerUpId, RoomStateForPlayer } from "./types";

export interface JoinRoomReq {
  roomCode: string;
  name: string;
  claimToken?: string;
}

export interface JoinRoomRes {
  ok: true;
  claimToken: string;
  playerId: string;
  state: RoomStateForPlayer;
}

export interface CreateRoomReq {
  name: string;
  rounds?: number;
  turnDeadlineMs?: number | null;
  powerUps?: boolean;
}

export interface SetRoomConfigReq {
  roomCode: string;
  claimToken: string;
  powerUps?: boolean;
}

export interface CreateRoomRes {
  ok: true;
  roomCode: string;
  claimToken: string;
  playerId: string;
  state: RoomStateForPlayer;
}

export interface StartGameReq {
  roomCode: string;
  claimToken: string;
}

export interface AckRoundEndReq {
  roomCode: string;
  claimToken: string;
}

export interface SubmitTurnReq {
  roomCode: string;
  claimToken: string;
  number: number;
  powerUp?: PowerUpId;
  powerUpTarget?: string;
  sabotageNumber?: number;
}

export interface UnsubmitTurnReq {
  roomCode: string;
  claimToken: string;
}

export interface KickPlayerReq {
  roomCode: string;
  claimToken: string;
  targetPlayerId: string;
}

export interface AbandonRoomReq {
  roomCode: string;
  claimToken: string;
}

export interface ErrorRes {
  ok: false;
  error: string;
}

export type ApiResponse<T> = T | ErrorRes;

export const SOCKET_EVENTS = {
  ROOM_STATE: "room_state",
  TURN_REVEAL: "turn_reveal",
  ROUND_END: "round_end",
  GAME_END: "game_end",
  ROOM_ABANDONED: "room_abandoned",
  ERROR: "server_error",
} as const;

export interface SocketAuthQuery {
  roomCode: string;
  claimToken: string;
}
