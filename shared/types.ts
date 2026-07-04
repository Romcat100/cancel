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
  | "flip"
  | "drain"
  | "jinx"
  | "wild"
  | "swap_hands"
  | "switch_cards"
  | "sacrifice"
  | "random_ray"
  | "nothingburger";

export type PowerUpMode = "off" | "random" | "selected";

export type NumberMode = "default" | "custom";

// Powers excluded from the dealt pool in 2-player games (too oppressive 1v1).
// Shared so the engine and the lobby selection UI agree on what to filter.
export const TWO_PLAYER_EXCLUDED_POWERS: PowerUpId[] = ["peek", "sabotage"];

export interface PowerUpDef {
  id: PowerUpId;
  name: string;
  description: string;
  needsTarget: boolean;
  // When true, the picker may target themselves with this power.
  // Defaults to false (engine rejects self-target for all other needsTarget powers).
  allowSelfTarget?: boolean;
}

export interface Player {
  id: string;
  name: string;
  seat: number;
  online: boolean;
  totalScore: number;
  hand: number[];
  isBot: boolean;
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
  resolvedPowerUp?: PowerUpId;
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
  swapUsed?: { swapperId: string; targetId: string };
  switchUsed?: { switcherId: string; targetId: string; switcherOriginal: number; targetOriginal: number };
  rayUsed?: { rayUserId: string; targetId: string; rolledNumber: number; originalNumber: number };
}

export interface RoundState {
  index: number;
  poolFull: PowerUpId[];
  poolRemaining: PowerUpId[];
  pickerRotation: string[];
  reveals: RevealedTurn[];
  roundScores: { [playerId: string]: number };
  endAcksBy: string[];
  // The one power applying to everyone this round (public). Absent when the round
  // power mode is off, or on rounds persisted before the round-power feature.
  roundPower?: RoundPowerId;
}

export interface RoundHistoryEntry {
  index: number;
  scores: { [playerId: string]: number };
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
  roundHistory: RoundHistoryEntry[];
  currentTurnIndex: number;
  currentPickerId?: string;
  currentSubmissions: PublicSubmission[];
  lastReveal?: RevealedTurn;
  winnerId?: string;
  config: {
    rounds: number;
    turnDeadlineMs: number | null;
    powerUpMode: PowerUpMode;
    selectedPowerUps: PowerUpId[];
    selectedRoundPowers: RoundPowerId[];
    showHands: boolean;
    numberMode: NumberMode;
    customNumbers: number[];
    solo: boolean;
  };
}

export interface RoomStateForPlayer {
  publicState: PublicState;
  privateState: PrivateState;
  selfPlayerId: string;
  // Monotonic per-room version (bumped in saveRoom); the client drops projections
  // with an older rev to ignore out-of-order HTTP/socket updates.
  rev: number;
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
      "(Just you) Ties don't affect you this turn. But you can still be cancelled by a 0.",
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
      "(Everyone) Every player's face value drops by 2 (so a 2 becomes a 0 and now cancels everyone, a 5 becomes a 3, a 0 becomes a −2 and no longer cancels).",
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
  flip: {
    id: "flip",
    name: "Flip",
    description: "(Everyone) Every card's face value is mirrored across the range. For example, a 0 becomes the high card and the high card becomes a 0.",
    needsTarget: false,
  },
  drain: {
    id: "drain",
    name: "Drain",
    description: "(Opponents) Choose another player. Your card's face value goes up by 1 and theirs goes down by 1 for this turn.",
    needsTarget: true,
  },
  jinx: {
    id: "jinx",
    name: "Jinx",
    description:
      "(Just you) Tying pays off instead of wiping you out. Each opponent who plays your number adds +2 to your score, on top of your card's value. If nobody ties, your card just scores as normal.",
    needsTarget: false,
  },
  wild: {
    id: "wild",
    name: "Wild",
    description:
      "(Just you) Roll the dice! This becomes a randomly chosen power, drawn from the full set.",
    needsTarget: false,
  },
  swap_hands: {
    id: "swap_hands",
    name: "Swap hands",
    description:
      "(Opponents) Choose another player. After this turn's cards are played, swap your remaining hand with theirs for the rest of the round.",
    needsTarget: true,
  },
  switch_cards: {
    id: "switch_cards",
    name: "Switch cards",
    description:
      "(Opponents) Choose another player. This turn, you play the number they chose and they play yours.",
    needsTarget: true,
  },
  sacrifice: {
    id: "sacrifice",
    name: "Sacrifice",
    description:
      "(Opponents) Your card scores 0 and every other player loses your card's value from their score this turn, but only if your card scores. If a 0 cancels you or your card ties out, the sacrifice fizzles.",
    needsTarget: false,
  },
  random_ray: {
    id: "random_ray",
    name: "Random ray",
    description:
      "(Anyone) Choose a target, including yourself. Their card is replaced by a random number from the game's full pool for this turn.",
    needsTarget: true,
    allowSelfTarget: true,
  },
  nothingburger: {
    id: "nothingburger",
    name: "Nothing Burger",
    description:
      "(Just you) It's a nothingburger. No effect whatsoever. Your card scores exactly as if you'd played no power-up at all.",
    needsTarget: false,
  },
};

export const POWER_UP_IDS = Object.keys(POWER_UPS) as PowerUpId[];

// --- Round powers ---
// One power is rolled per ROUND and applies to every player on every turn of that
// round, publicly visible all round. This replaces the per-turn picker system above
// (which stays in the codebase, dormant). Deliberately a separate id space from
// PowerUpId — note "equalize" exists in both unions; never index POWER_UPS or the
// client's POWER_VISUAL with a RoundPowerId.

export type RoundPowerId =
  | "pure_tone"
  | "harmony"
  | "amplify"
  | "static"
  | "infrared"
  | "equalize";

export interface RoundPowerDef {
  id: RoundPowerId;
  name: string;
  // Must start with a scope prefix tag like the per-turn powers; round powers are
  // always "(Everyone)". The client's parseScopedDescription depends on it.
  description: string;
}

export const ROUND_POWERS: Record<RoundPowerId, RoundPowerDef> = {
  pure_tone: {
    id: "pure_tone",
    name: "Pure Tone",
    description:
      "(Everyone) A clean signal. No power this round, every card scores by the normal rules.",
  },
  harmony: {
    id: "harmony",
    name: "Harmony",
    description:
      "(Everyone) Tied cards resonate instead of cancelling. Every card that ties this round scores 2 points, including matching zeros.",
  },
  amplify: {
    id: "amplify",
    name: "Amplify",
    description:
      "(Everyone) The signal is boosted. Every point scored this round is doubled, gains and losses alike.",
  },
  static: {
    id: "static",
    name: "Static",
    description:
      "(Everyone) Zeros are lost in the noise. A 0 is inert this round and cancels nothing.",
  },
  infrared: {
    id: "infrared",
    name: "Infrared",
    description:
      "(Everyone) The whole spectrum shifts down. Every card plays 2 lower than its face value, so a 2 becomes a 0 and cancels, and a 0 becomes a -2.",
  },
  equalize: {
    id: "equalize",
    name: "Equalize",
    description:
      "(Everyone) Signals level out. Each turn, players who score above zero all get the average of those positive scores.",
  },
};

export const ROUND_POWER_IDS = Object.keys(ROUND_POWERS) as RoundPowerId[];
