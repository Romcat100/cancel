export type PowerUpId =
  | "double"
  | "tie_die"
  | "negate_zero"
  | "plus_two"
  | "free_three"
  | "make_negative"
  | "minus_two"
  | "peek"
  | "mute"
  | "slide"
  | "equalize"
  | "sabotage"
  | "reverse"
  | "drain"
  | "nothingburger";

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
    powerUps: boolean;
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
    description: "(Everyone) All scored points this turn are multiplied x2.",
    needsTarget: false,
  },
  tie_die: {
    id: "tie_die",
    name: "Tie Die",
    description:
      "(Just you) Your card still scores even if tied with another player. Your 0 still cancels everyone even if another player also plays 0.",
    needsTarget: false,
  },
  negate_zero: {
    id: "negate_zero",
    name: "Negate Zero",
    description: "(Everyone) All 0 cards are inert this turn, so they have no cancel effect.",
    needsTarget: false,
  },
  plus_two: {
    id: "plus_two",
    name: "Plus Two",
    description: "(Just you) Your card's face value is bumped up by 2 (so a 0 becomes a 2 and no longer cancels, a 3 becomes a 5). Tie checks use the bumped value.",
    needsTarget: false,
  },
  free_three: {
    id: "free_three",
    name: "Free Three",
    description: "(Just you) Adds a virtual 3 to your play. If nobody plays a 3, you score +3. If anyone (including you) plays a 3, that 3 cancels with the virtual 3 and the bonus is lost.",
    needsTarget: false,
  },
  make_negative: {
    id: "make_negative",
    name: "Make Negative",
    description: "(Everyone) All scored points this turn are flipped negative.",
    needsTarget: false,
  },
  minus_two: {
    id: "minus_two",
    name: "Minus Two",
    description:
      "(Everyone) Every player's face value drops by 2 (so a 2 becomes a 0 and now cancels everyone, a 5 becomes a 3, a 0 becomes a −2 and no longer cancels). Tie checks, scoring, and the cancel effect all use the lowered value.",
    needsTarget: false,
  },
  peek: {
    id: "peek",
    name: "Peek",
    description: "(Just you) After everyone submits, you secretly see one chosen opponent's number and re-pick yours while everyone waits.",
    needsTarget: true,
  },
  mute: {
    id: "mute",
    name: "Mute",
    description: "(Opponents) Chosen opponent's card loses all value and effect this turn.",
    needsTarget: true,
  },
  slide: {
    id: "slide",
    name: "Slide",
    description: "(Everyone) Everyone's score this turn slides one. Your score goes to the next player, and you receive the previous player's score.",
    needsTarget: false,
  },
  equalize: {
    id: "equalize",
    name: "Equalize",
    description: "(Everyone) Every player who scored above zero this turn gets the average of those positive scores. High earners come down, low earners come up.",
    needsTarget: false,
  },
  sabotage: {
    id: "sabotage",
    name: "Sabotage",
    description: "(Opponents) Choose another player AND pick the number they'll play this turn (from their remaining hand). Whatever they thought they were submitting is overridden.",
    needsTarget: true,
  },
  reverse: {
    id: "reverse",
    name: "Reverse",
    description: "(Everyone) All face values flip within the card range, so a 0 becomes the highest card and the highest card becomes 0. Tie checks, scoring, and the cancel effect all use the flipped values.",
    needsTarget: false,
  },
  drain: {
    id: "drain",
    name: "Drain",
    description: "(Opponents) Choose another player. You gain 1 point and they lose 1 point this turn.",
    needsTarget: true,
  },
  nothingburger: {
    id: "nothingburger",
    name: "Nothingburger",
    description:
      "(Just you) It's a nothingburger. No effect whatsoever. Your card scores exactly as if you'd played no power-up at all.",
    needsTarget: false,
  },
};

export const POWER_UP_IDS = Object.keys(POWER_UPS) as PowerUpId[];
