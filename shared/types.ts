export type PowerUpId =
  | "double"
  | "shield"
  | "negate_zero"
  | "plus_two"
  | "free_three"
  | "negate"
  | "steal_two"
  | "peek"
  | "mute"
  | "trade"
  | "equalize"
  | "sabotage";

export interface PowerUpDef {
  id: PowerUpId;
  name: string;
  description: string;
  needsTarget: boolean;
}

export interface Player {
  id: string;
  name: string;
  seat: number;
  online: boolean;
  totalScore: number;
  hand: number[];
}

export type RoomPhase =
  | "lobby"
  | "turn_submitting"
  | "turn_peek_review"
  | "round_end"
  | "game_end";

export interface PublicSubmission {
  playerId: string;
  submitted: boolean;
}

export interface RevealedSubmission {
  playerId: string;
  number: number;
  powerUp?: PowerUpId;
  powerUpTarget?: string;
  sabotageNumber?: number;
}

export interface ScoreLine {
  playerId: string;
  base: number;
  delta: number;
  notes: string[];
}

export interface RevealedTurn {
  turnIndex: number;
  roundIndex: number;
  submissions: RevealedSubmission[];
  scoring: ScoreLine[];
  pickerId: string;
  peekUsed?: { peekerId: string; targetId: string; revealedNumber: number; originalNumber: number };
  sabotageUsed?: { sabotagerId: string; targetId: string; forcedNumber: number; originalNumber: number };
}

export interface RoundState {
  index: number;
  poolFull: PowerUpId[];
  poolRemaining: PowerUpId[];
  pickerRotation: string[];
  reveals: RevealedTurn[];
  roundScores: { [playerId: string]: number };
  endAcksBy: string[];
}

export interface PrivateState {
  hand: number[];
  hasSubmittedThisTurn: boolean;
  isPicker: boolean;
  peekReveal?: { targetPlayerId: string; revealedNumber: number; originalNumber: number };
  blockedByOthers?: boolean;
}

export interface PublicState {
  roomCode: string;
  phase: RoomPhase;
  players: Player[];
  hostId: string;
  round?: RoundState;
  currentTurnIndex: number;
  currentPickerId?: string;
  currentSubmissions: PublicSubmission[];
  lastReveal?: RevealedTurn;
  winnerId?: string;
  config: {
    rounds: number;
    turnDeadlineMs: number | null;
  };
}

export interface RoomStateForPlayer {
  publicState: PublicState;
  privateState: PrivateState;
  selfPlayerId: string;
}

export const POWER_UPS: Record<PowerUpId, PowerUpDef> = {
  double: {
    id: "double",
    name: "Double",
    description: "(Universal) All scored points this turn are multiplied x2.",
    needsTarget: false,
  },
  shield: {
    id: "shield",
    name: "Shield",
    description: "Your card scores even if tied with another player.",
    needsTarget: false,
  },
  negate_zero: {
    id: "negate_zero",
    name: "Negate Zero",
    description: "(Universal) All 0 cards are inert this turn — no cancel effect.",
    needsTarget: false,
  },
  plus_two: {
    id: "plus_two",
    name: "Plus Two",
    description: "Your card's face value is bumped up by 2 (so a 0 becomes a 2 and no longer cancels; a 3 becomes a 5). Tie checks use the bumped value.",
    needsTarget: false,
  },
  free_three: {
    id: "free_three",
    name: "Free Three",
    description: "Adds a virtual 3 to your play. If no other player played a 3, you score +3. If anyone else played a 3, both 3s cancel out and the bonus is lost.",
    needsTarget: false,
  },
  negate: {
    id: "negate",
    name: "Make Negative",
    description: "(Universal) All scored points this turn are flipped negative.",
    needsTarget: false,
  },
  steal_two: {
    id: "steal_two",
    name: "Steal Two",
    description: "(Universal) Every opponent who scores >0 loses 2.",
    needsTarget: false,
  },
  peek: {
    id: "peek",
    name: "Peek",
    description: "After everyone submits, you secretly see one chosen opponent's number and re-pick yours while everyone waits.",
    needsTarget: true,
  },
  mute: {
    id: "mute",
    name: "Mute",
    description: "Chosen opponent's card is treated as 0 (no value, no cancel).",
    needsTarget: true,
  },
  trade: {
    id: "trade",
    name: "Switch",
    description: "(Universal) Everyone's score this turn slides one seat — your score goes to the next player; you receive the previous player's score.",
    needsTarget: false,
  },
  equalize: {
    id: "equalize",
    name: "Equalize",
    description: "(Universal) Every player who scored above zero this turn gets the average of those positive scores. High earners come down; low earners come up.",
    needsTarget: false,
  },
  sabotage: {
    id: "sabotage",
    name: "Sabotage",
    description: "Choose another player AND pick the number they'll play this turn (from their remaining hand). Whatever they thought they were submitting is overridden.",
    needsTarget: true,
  },
};

export const POWER_UP_IDS = Object.keys(POWER_UPS) as PowerUpId[];
