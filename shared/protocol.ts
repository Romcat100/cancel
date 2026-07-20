import type { NumberMode, PowerUpId, PowerUpMode, RoomStateForPlayer, RoundPowerId } from "./types";
import type { CampaignProgress, FlairId } from "./campaign";

export interface JoinRoomReq {
  roomCode: string;
  name: string;
  claimToken?: string;
  // Optional anonymous profile token: lets the server stamp the joiner's
  // equipped flair onto their seat. Never echoed back in any projection.
  profileToken?: string;
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
  powerUpMode?: PowerUpMode;
  selectedPowerUps?: PowerUpId[];
  selectedRoundPowers?: RoundPowerId[];
  showHands?: boolean;
  numberMode?: NumberMode;
  customNumbers?: number[];
  // Single-player: create the room flagged solo and pre-seat this many AI opponents.
  solo?: boolean;
  bots?: number;
  // Campaign: create a solo room whose whole config is derived server-side from
  // this level (client-sent config fields are ignored) and auto-start it.
  // Requires profileToken; the level must be unlocked for that profile.
  campaignLevelId?: string;
  profileToken?: string;
}

export interface SetBotCountReq {
  roomCode: string;
  claimToken: string;
  count: number;
}

export interface SetRoomConfigReq {
  roomCode: string;
  claimToken: string;
  rounds?: number;
  powerUpMode?: PowerUpMode;
  selectedPowerUps?: PowerUpId[];
  selectedRoundPowers?: RoundPowerId[];
  showHands?: boolean;
  numberMode?: NumberMode;
  customNumbers?: number[];
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
  // Conductor round power: the round winner's pick for the next round's power,
  // sent with their ack. Validated by the engine against the drawn options.
  chosenPower?: RoundPowerId;
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

export interface PlayAgainReq {
  roomCode: string;
  claimToken: string;
}

export interface AbandonRoomReq {
  roomCode: string;
  claimToken: string;
}

export interface StepDownHostReq {
  roomCode: string;
  claimToken: string;
}

export interface ClaimHostReq {
  roomCode: string;
  claimToken: string;
}

export interface SkipWaitingReq {
  roomCode: string;
  claimToken: string;
}

// The client-visible slice of a profile (campaign progress + cosmetics).
export interface ProfileView extends CampaignProgress {
  unlockedFlairs: FlairId[];
  equippedFlair: FlairId | null;
}

export interface ProfileRes {
  ok: true;
  profile: ProfileView;
}

export interface EquipFlairReq {
  profileToken: string;
  // null unequips.
  flair: FlairId | null;
}

export interface ErrorRes {
  ok: false;
  error: string;
}

export interface HealthRes {
  ok: boolean;
  // Short id of the build the server is currently serving. Absent only on very old servers.
  buildId?: string;
}

export interface SocketAuthRes {
  ok: boolean;
  state?: RoomStateForPlayer;
  buildId?: string;
  error?: string;
}

export type ApiResponse<T> = T | ErrorRes;

export const SOCKET_EVENTS = {
  ROOM_STATE: "room_state",
  TURN_REVEAL: "turn_reveal",
  ROUND_END: "round_end",
  GAME_END: "game_end",
  ROOM_ABANDONED: "room_abandoned",
  PING_PLAYER: "ping_player",
  ERROR: "server_error",
} as const;

export interface PingPlayerReq {
  targetPlayerId: string;
}

export interface PlayerPingedEvent {
  fromPlayerId: string;
  toPlayerId: string;
}

export interface SocketAuthQuery {
  roomCode: string;
  claimToken: string;
}
