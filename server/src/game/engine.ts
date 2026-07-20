import {
  POWER_UP_IDS,
  POWER_UPS,
  ROUND_POWER_IDS,
  TWO_PLAYER_EXCLUDED_POWERS,
  type NumberMode,
  type PowerUpId,
  type PowerUpMode,
  type RoundPowerId,
  type SeriesState,
} from "../../../shared/types.js";
import type { CampaignResult, FlairId } from "../../../shared/campaign.js";
import { scoreTurn } from "./scoring.js";
import { BOT_NAMES } from "./bot-names.js";
import { chooseNumber } from "./heuristics.js";

export type RoomPhaseDoc =
  | "lobby"
  | "turn_submitting"
  | "turn_peek_review"
  | "turn_neighbor_review"
  | "round_end"
  | "game_end";

export interface PlayerDoc {
  id: string;
  name: string;
  seat: number;
  totalScore: number;
  // AI player. Bots have no claim token / players row; they're driven by the bot
  // engine (see bots.ts) and never hold the host role.
  isBot?: boolean;
  // Campaign-unlocked cosmetics, snapshotted from the player's profile when
  // they took their seat (stamped by the handlers, never by the engine). Bots
  // never have flair. `flair` = wave slot, `nameFlair` = name slot.
  flair?: FlairId;
  nameFlair?: FlairId;
}

export interface SubmissionDoc {
  playerId: string;
  number: number;
  powerUp?: PowerUpId;
  powerUpTarget?: string;
  sabotageNumber?: number;
  resolvedPowerUp?: PowerUpId;
}

export interface RevealDoc {
  turnIndex: number;
  pickerId: string;
  submissions: SubmissionDoc[];
  scoreLines: { playerId: string; delta: number; notes: string[] }[];
  peekUsed?: { peekerId: string; targetId: string; revealedNumber: number; originalNumber: number };
  sabotageUsed?: { sabotagerId: string; targetId: string; forcedNumber: number; originalNumber: number };
  swapUsed?: { swapperId: string; targetId: string };
  switchUsed?: { switcherId: string; targetId: string; switcherOriginal: number; targetOriginal: number };
  rayUsed?: { rayUserId: string; targetId: string; rolledNumber: number; originalNumber: number };
  crosstalkUsed?: { playerId: string; initialNumber: number; finalNumber: number }[];
  // Fadeout round power: who faded out on this turn, and (on the turn the race
  // ends) the sole survivor who banked the bonus.
  fadeoutFaded?: string[];
  fadeoutSurvivorId?: string;
  revealedAt: number;
}

export interface RoundDoc {
  index: number;
  // Per-turn power pool: dormant. startRound always deals [] now; kept so legacy
  // mid-round saves (and the tests that force pools) stay playable.
  poolFull: PowerUpId[];
  poolRemaining: PowerUpId[];
  rotation: string[];
  reveals: RevealDoc[];
  hands: { [playerId: string]: number[] };
  endAcksBy: string[];
  perPlayerRoundScore: { [playerId: string]: number };
  // The one power applying to everyone this round. Absent when powerUpMode is off,
  // or on rounds persisted before the round-power feature.
  roundPower?: RoundPowerId;
  // Conductor round power: stamped onto the ending round by resolveTurn when at
  // least one option could be drawn. The winner is the round's top scorer, or one
  // of the tied top scorers drawn by lot. The winner's ack then carries their pick
  // into conductorChoice; ackRoundEnd/forceAdvanceRound hand it to startRound as
  // the next round's forced power. All optional — absent on empty option pools and
  // every pre-feature save.
  conductorWinnerId?: string;
  conductorOptions?: RoundPowerId[];
  conductorChoice?: RoundPowerId;
  // Who chose this round's power (the previous round's conductor winner).
  roundPowerChosenBy?: string;
  // True when this round's power was ROLLED even though the previous round was a
  // conductor round (a tie, an absent winner, or an empty option draw): the client
  // plays a "random draw" reveal on the round-power preview instead of a credit.
  roundPowerDrawnAtRandom?: boolean;
  // Fadeout round power: players eliminated so far this round, in fade order.
  // They keep playing (and interfering) but score nothing. Optional so legacy
  // saves need no loadRoom default.
  fadedIds?: string[];
}

export interface PeekReviewDoc {
  peekerId: string;
  targetId: string;
  revealedNumber: number;
  originalNumber: number;
}

// The "glimpse and re-pick" round powers (Refraction, Broadcast) pause the turn in
// `turn_neighbor_review` after everyone's initial submission: each player sees one
// other player's initial pick (their `targets` entry) and re-submits. Refraction
// targets a random other player; Broadcast stores no targets (everyone sees the whole
// board via the projection). `initialPicks` holds each player's pre-review pick until
// the turn resolves. (The "neighbor" naming is a legacy of the retired Crosstalk
// power, which glimpsed the next seat.)
export interface NeighborReviewDoc {
  initialPicks: { [playerId: string]: number };
  targets: { [playerId: string]: string };
}

export interface RoomDoc {
  code: string;
  hostId: string;
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
  phase: RoomPhaseDoc;
  players: PlayerDoc[];
  rounds: RoundDoc[];
  // Seat whose player picks first in round 0, rolled randomly at startGame. Each
  // later round shifts the starting picker one more seat (see buildRotation).
  firstPickerSeat: number;
  currentRoundIndex: number;
  currentTurnIndex: number;
  pendingSubmissions: { [playerId: string]: SubmissionDoc };
  peekReview?: PeekReviewDoc;
  neighborReview?: NeighborReviewDoc;
  winnerId?: string;
  // Cross-rematch series tally, banked in endGame. Deliberately NOT wiped by
  // resetToLobby — surviving "Play again" is the whole feature.
  series: SeriesState;
  // Campaign rooms only. Stamped by apiCreateRoom (never by the engine — the
  // engine carries it through mutations via the `...room` spread); the handlers
  // evaluate the objective and fill `result` when the game ends. `profileToken`
  // is a credential: projected NEVER, only levelId + result are public.
  campaign?: { levelId: string; profileToken: string; result?: CampaignResult };
  createdAt: number;
  updatedAt: number;
  // Version stamped by saveRoom (not the engine); carried through mutations by the `...room` spread.
  rev: number;
}

const HOST_SEAT = 0;
const MAX_PLAYERS = 8;

export function createRoom(opts: {
  code: string;
  hostId: string;
  hostName: string;
  rounds: number;
  turnDeadlineMs: number | null;
  powerUpMode?: PowerUpMode;
  selectedPowerUps?: PowerUpId[];
  selectedRoundPowers?: RoundPowerId[];
  showHands?: boolean;
  numberMode?: NumberMode;
  customNumbers?: number[];
  solo?: boolean;
}): RoomDoc {
  const now = Date.now();
  return {
    code: opts.code,
    hostId: opts.hostId,
    config: {
      rounds: opts.rounds,
      turnDeadlineMs: opts.turnDeadlineMs,
      powerUpMode: opts.powerUpMode ?? "random",
      selectedPowerUps: opts.selectedPowerUps ?? [],
      selectedRoundPowers: opts.selectedRoundPowers ?? [],
      showHands: opts.showHands ?? true,
      numberMode: opts.numberMode ?? "default",
      customNumbers: opts.customNumbers ?? [],
      solo: opts.solo ?? false,
    },
    phase: "lobby",
    players: [{ id: opts.hostId, name: opts.hostName, seat: HOST_SEAT, totalScore: 0 }],
    rounds: [],
    firstPickerSeat: 0,
    currentRoundIndex: -1,
    currentTurnIndex: -1,
    pendingSubmissions: {},
    series: { gamesPlayed: 0, perPlayer: {} },
    createdAt: now,
    updatedAt: now,
    rev: 0,
  };
}

export function addPlayer(room: RoomDoc, playerId: string, name: string): RoomDoc {
  if (room.phase !== "lobby") throw new Error("Game already started");
  if (room.players.length >= MAX_PLAYERS) throw new Error("Room is full");
  if (room.players.some((p) => p.id === playerId)) return room;
  if (room.players.some((p) => p.name.trim().toLowerCase() === name.trim().toLowerCase())) {
    throw new Error("Name taken");
  }
  return {
    ...room,
    players: [...room.players, { id: playerId, name, seat: room.players.length, totalScore: 0 }],
    updatedAt: Date.now(),
  };
}

function newBotId(): string {
  return `bot-${Math.random().toString(36).slice(2, 10)}${Math.random().toString(36).slice(2, 6)}`;
}

// Add or remove AI players so the room ends up with exactly `count` bots (clamped so the
// total never exceeds MAX_PLAYERS). Lobby-only. Humans keep their relative order and sit
// first; bots fill the seats after them and are reindexed. New bots draw an unused name
// from BOT_NAMES (falling back to "Bot N" if the pool is exhausted); shrinking drops the
// most recently added bots.
export function setBotCount(room: RoomDoc, count: number): RoomDoc {
  if (room.phase !== "lobby") throw new Error("Can only change AI players in the lobby");
  const humans = room.players.filter((p) => !p.isBot);
  const bots = room.players.filter((p) => p.isBot);
  const maxBots = MAX_PLAYERS - humans.length;
  const want = Math.max(0, Math.min(maxBots, Math.round(count)));

  let nextBots: PlayerDoc[];
  if (want <= bots.length) {
    nextBots = bots.slice(0, want);
  } else {
    const used = new Set(room.players.map((p) => p.name.trim().toLowerCase()));
    const pool = shuffle(BOT_NAMES.filter((n) => !used.has(n.toLowerCase())));
    const additions: PlayerDoc[] = [];
    for (let i = 0; i < want - bots.length; i++) {
      const name = pool[i] ?? `Bot ${bots.length + i + 1}`;
      additions.push({ id: newBotId(), name, seat: 0, totalScore: 0, isBot: true });
    }
    nextBots = [...bots, ...additions];
  }

  const players = [...humans, ...nextBots].map((p, i) => ({ ...p, seat: i }));
  return { ...room, players, updatedAt: Date.now() };
}

function shuffle<T>(arr: T[], rng: () => number = Math.random): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

// Powers that are too oppressive in a 1v1 — we exclude them from the dealt pool whenever
// a game has 2 players. Sabotage gives perfect lock-in on the opponent's only card; Peek
// gives free information with nothing to disambiguate. Sourced from shared so the lobby
// selection UI filters the same set.
const TWO_PLAYER_EXCLUDED: ReadonlySet<PowerUpId> = new Set(TWO_PLAYER_EXCLUDED_POWERS);

// The eligible ids after applying the 2-player exclusion. Used both for dealing and for
// validating that a "selected" pool isn't effectively empty before the game starts.
function effectiveAllowed(allowed: PowerUpId[], playerCount: number): PowerUpId[] {
  return playerCount <= 2 ? allowed.filter((id) => !TWO_PLAYER_EXCLUDED.has(id)) : [...allowed];
}

// Wild rolls a random power from the full set, but excludes powers that need a target
// (the picker submits wild with no target, so we can't resolve to those) and itself.
const WILD_ROLL_POOL: PowerUpId[] = POWER_UP_IDS.filter(
  (id) => id !== "wild" && !POWER_UPS[id].needsTarget,
);

function rollWildPower(rng: () => number = Math.random): PowerUpId {
  return WILD_ROLL_POOL[Math.floor(rng() * WILD_ROLL_POOL.length)];
}

// Round powers that fall flat in a 1v1, skipped by the random roll when a game has
// 2 players. Harmony removes the tie penalty entirely (both players just double);
// Refraction's "random other player" is always your one opponent, and you both glimpse
// each other. Dead Air is score-inert with 2 players: both playing 0 already scores
// everyone 0 under the base rules, so the power never changes an outcome. A host who
// explicitly picks them in "selected" mode still gets them.
const TWO_PLAYER_EXCLUDED_ROUND_POWERS: ReadonlySet<RoundPowerId> = new Set([
  "harmony",
  "refraction",
  "dead_air",
  // Fadeout's race is over on turn 1 with 2 players (one fade decides it), leaving
  // the rest of the round a dead mop-up.
  "fadeout",
]);

// Fadeout: the last signal standing banks this much per outlasted rival
// (+6 in a 4-player game, +8 with 5).
const FADEOUT_BONUS_PER_OUTLASTED = 2;

// The eligible round powers for a given round: "off" yields nothing; "random" draws
// from the full roster (minus the 2-player exclusions); "selected" draws from the
// host's curated list. A legacy save in selected mode with no curated round powers
// rolls nothing (plain rounds) rather than surprising players with the full roster.
// Powers rolled in earlier rounds of this game are always skipped, so a game never
// repeats a power; if that exhausts the roster (more rounds than eligible powers),
// the pool falls back to the full roster rather than leaving the round power-less.
// Conductor chooses the NEXT round's power, so it is dead weight on a game's final
// round: it's filtered from the roster BEFORE the fresh/fallback split (so even the
// exhausted-roster fallback can't resurface it there). Shared by the roll and the
// conductor options draw so their eligibility rules can never drift apart.
function roundPowerPool(
  config: RoomDoc["config"],
  playerCount: number,
  usedPowers: RoundPowerId[],
  roundIndex: number,
): RoundPowerId[] {
  if (config.powerUpMode === "off") return [];
  let roster =
    config.powerUpMode === "selected"
      ? config.selectedRoundPowers
      : playerCount <= 2
        ? ROUND_POWER_IDS.filter((id) => !TWO_PLAYER_EXCLUDED_ROUND_POWERS.has(id))
        : ROUND_POWER_IDS;
  if (roundIndex + 1 >= config.rounds) roster = roster.filter((id) => id !== "conductor");
  if (roster.length === 0) return [];
  const fresh = roster.filter((id) => !usedPowers.includes(id));
  return fresh.length > 0 ? fresh : roster;
}

// One power per round, applying to everyone, drawn uniformly from roundPowerPool.
function rollRoundPower(
  config: RoomDoc["config"],
  playerCount: number,
  usedPowers: RoundPowerId[],
  roundIndex: number,
  rng: () => number = Math.random,
): RoundPowerId | undefined {
  const pool = roundPowerPool(config, playerCount, usedPowers, roundIndex);
  if (pool.length === 0) return undefined;
  return pool[Math.floor(rng() * pool.length)];
}

// Powers rolled in earlier rounds of this game, skipped by the next roll. A rematch
// resets this for free: resetToLobby wipes room.rounds.
function usedRoundPowers(rounds: RoundDoc[]): RoundPowerId[] {
  return rounds.flatMap((rd) => (rd.roundPower ? [rd.roundPower] : []));
}

// `allowed` narrows the eligible powers (the host's "selected" allow-list). When omitted,
// the full set is used (the "random" mode). Repeats to fill when the pool is larger than
// the eligible set, so a small selection still produces one power per turn.
function dealPool(
  handSize: number,
  playerCount: number,
  allowed?: PowerUpId[],
  rng = Math.random,
): PowerUpId[] {
  const ids: PowerUpId[] = effectiveAllowed(allowed ?? [...POWER_UP_IDS], playerCount);
  if (ids.length === 0) return [];
  if (handSize <= ids.length) return shuffle(ids, rng).slice(0, handSize);
  const out: PowerUpId[] = [];
  while (out.length < handSize) {
    out.push(...shuffle(ids, rng).slice(0, Math.min(ids.length, handSize - out.length)));
  }
  return out;
}

function dealHand(handSize: number, customNumbers?: number[]): number[] {
  if (customNumbers && customNumbers.length) return [0, ...customNumbers].sort((a, b) => a - b);
  return Array.from({ length: handSize }, (_, i) => i);
}

// The full sorted set of number cards in play for this game. Custom games use
// [0, ...host's picks]; default games use the contiguous 0..handSize-1. Scoring needs
// this for Flip (which mirrors a card to its positional opposite within the set).
function gameNumbers(room: RoomDoc): number[] {
  const handSize = room.players.length + 2;
  return dealHand(handSize, room.config.numberMode === "custom" ? room.config.customNumbers : undefined);
}

function buildRotation(
  players: PlayerDoc[],
  handSize: number,
  roundIndex: number,
  firstPickerSeat: number,
): string[] {
  const sorted = [...players].sort((a, b) => a.seat - b.seat);
  const offset = (roundIndex + firstPickerSeat) % sorted.length;
  const order = [...sorted.slice(offset), ...sorted.slice(0, offset)];
  const rot: string[] = [];
  for (let i = 0; i < handSize; i++) rot.push(order[i % order.length].id);
  return rot;
}

export function startGame(room: RoomDoc, rng: () => number = Math.random): RoomDoc {
  if (room.phase !== "lobby") throw new Error("Not in lobby");
  if (room.players.length < 2) throw new Error("Need at least 2 players");
  if (room.config.powerUpMode === "selected" && room.config.selectedRoundPowers.length === 0) {
    throw new Error("Pick at least one round power, or switch powers off");
  }
  if (
    room.config.numberMode === "custom" &&
    room.config.customNumbers.length !== room.players.length + 1
  ) {
    throw new Error(`Pick exactly ${room.players.length + 1} numbers for ${room.players.length} players`);
  }
  // Roll the first picker randomly instead of always seating the host first.
  const firstPickerSeat = Math.floor(rng() * room.players.length);
  return startRound({ ...room, firstPickerSeat }, 0, rng);
}

export function setRoomConfig(
  room: RoomDoc,
  patch: {
    rounds?: number;
    powerUpMode?: PowerUpMode;
    selectedPowerUps?: PowerUpId[];
    selectedRoundPowers?: RoundPowerId[];
    showHands?: boolean;
    numberMode?: NumberMode;
    customNumbers?: number[];
  },
): RoomDoc {
  if (room.phase !== "lobby") throw new Error("Config locked once game starts");
  return {
    ...room,
    config: {
      ...room.config,
      rounds:
        patch.rounds !== undefined
          ? Math.max(1, Math.min(5, Math.round(patch.rounds)))
          : room.config.rounds,
      powerUpMode: patch.powerUpMode ?? room.config.powerUpMode,
      selectedPowerUps: patch.selectedPowerUps ?? room.config.selectedPowerUps,
      selectedRoundPowers: patch.selectedRoundPowers ?? room.config.selectedRoundPowers,
      showHands: patch.showHands ?? room.config.showHands,
      numberMode: patch.numberMode ?? room.config.numberMode,
      customNumbers: patch.customNumbers ?? room.config.customNumbers,
    },
    updatedAt: Date.now(),
  };
}

function startRound(
  room: RoomDoc,
  roundIndex: number,
  rng: () => number = Math.random,
  // Conductor: the previous round's winner picked this round's power, so skip the
  // roll and credit them on the new round.
  forced?: { power: RoundPowerId; chosenBy: string },
): RoomDoc {
  const handSize = room.players.length + 2;
  // Per-turn pools are dormant: never dealt anymore (dealPool is retained for the
  // dormant per-turn system). Each round instead rolls one power for everyone.
  const poolFull: PowerUpId[] = [];
  const roundPower =
    forced?.power ??
    rollRoundPower(room.config, room.players.length, usedRoundPowers(room.rounds), roundIndex, rng);
  // A conductor round was supposed to hand this pick to its winner; if we rolled
  // anyway (absent winner skipped by forceAdvance, or an empty option draw), flag
  // it so the client can stage the roll as a visible random draw.
  const afterConductor =
    !forced && roundPower != null && room.rounds[roundIndex - 1]?.roundPower === "conductor";
  const round: RoundDoc = {
    index: roundIndex,
    poolFull,
    roundPower,
    roundPowerChosenBy: forced?.chosenBy,
    roundPowerDrawnAtRandom: afterConductor || undefined,
    poolRemaining: [],
    rotation: buildRotation(room.players, handSize, roundIndex, room.firstPickerSeat ?? 0),
    reveals: [],
    hands: Object.fromEntries(
      room.players.map((p) => [
        p.id,
        dealHand(handSize, room.config.numberMode === "custom" ? room.config.customNumbers : undefined),
      ]),
    ),
    endAcksBy: [],
    perPlayerRoundScore: Object.fromEntries(room.players.map((p) => [p.id, 0])),
  };
  round.poolRemaining = [...round.poolFull];
  return {
    ...room,
    phase: "turn_submitting",
    rounds: [...room.rounds, round],
    currentRoundIndex: roundIndex,
    currentTurnIndex: 0,
    pendingSubmissions: {},
    peekReview: undefined,
    neighborReview: undefined,
    updatedAt: Date.now(),
  };
}

export interface SubmitInput {
  playerId: string;
  number: number;
  powerUp?: PowerUpId;
  powerUpTarget?: string;
  sabotageNumber?: number;
}

export function submitTurn(room: RoomDoc, input: SubmitInput): RoomDoc {
  if (room.phase === "turn_peek_review") return submitPeekReview(room, input);
  if (room.phase === "turn_neighbor_review") return submitNeighborReview(room, input);
  if (room.phase !== "turn_submitting") throw new Error("Not accepting submissions");

  const round = room.rounds[room.currentRoundIndex];
  const turnIndex = room.currentTurnIndex;
  const pickerId = round.rotation[turnIndex];

  const player = room.players.find((p) => p.id === input.playerId);
  if (!player) throw new Error("Not in room");

  const hand = round.hands[input.playerId];
  if (!hand.includes(input.number)) throw new Error("Number not in hand");

  if (room.pendingSubmissions[input.playerId]) throw new Error("Already submitted");

  if (input.powerUp) {
    if (input.playerId !== pickerId) throw new Error("Only picker plays power-up");
    if (!round.poolRemaining.includes(input.powerUp)) throw new Error("Power-up not in pool");
    if (room.players.length <= 2 && TWO_PLAYER_EXCLUDED.has(input.powerUp)) {
      throw new Error(`${input.powerUp} is disabled in 2-player games`);
    }
  } else if (input.playerId === pickerId && round.poolRemaining.length > 0) {
    throw new Error("Picker must pick a power-up while pool is non-empty");
  }
  if (input.powerUp && POWER_UPS[input.powerUp].needsTarget) {
    if (!input.powerUpTarget) throw new Error("Target required");
    if (input.powerUpTarget === input.playerId && !POWER_UPS[input.powerUp].allowSelfTarget) {
      throw new Error("Cannot target self");
    }
    if (!room.players.some((p) => p.id === input.powerUpTarget)) throw new Error("Unknown target");
  }
  if (input.powerUp === "sabotage") {
    if (input.sabotageNumber == null) throw new Error("Sabotage number required");
    const targetHand = round.hands[input.powerUpTarget!];
    if (!targetHand.includes(input.sabotageNumber)) throw new Error("Sabotage number not in target's hand");
  }

  const submission: SubmissionDoc = {
    playerId: input.playerId,
    number: input.number,
    powerUp: input.powerUp,
    powerUpTarget: input.powerUpTarget,
    sabotageNumber: input.powerUp === "sabotage" ? input.sabotageNumber : undefined,
    resolvedPowerUp: input.powerUp === "wild" ? rollWildPower() : undefined,
  };

  let next: RoomDoc = {
    ...room,
    pendingSubmissions: { ...room.pendingSubmissions, [input.playerId]: submission },
    updatedAt: Date.now(),
  };

  if (Object.keys(next.pendingSubmissions).length === room.players.length) {
    const peek = Object.values(next.pendingSubmissions).find((s) => s.powerUp === "peek");
    if (peek && peek.powerUpTarget) {
      const target = next.pendingSubmissions[peek.powerUpTarget];
      if (target) {
        const peekerSub = next.pendingSubmissions[peek.playerId];
        const remaining = { ...next.pendingSubmissions };
        delete remaining[peek.playerId];
        return {
          ...next,
          phase: "turn_peek_review",
          pendingSubmissions: remaining,
          peekReview: {
            peekerId: peek.playerId,
            targetId: peek.powerUpTarget,
            revealedNumber: target.number,
            originalNumber: peekerSub.number,
          },
          updatedAt: Date.now(),
        };
      }
    }
    // Refraction / Broadcast (round powers): pause the turn so everyone glimpses
    // another player's initial pick (or, for Broadcast, the whole board) and gets
    // one chance to re-pick before it resolves.
    const flowPower = round.roundPower;
    if (
      (flowPower === "refraction" || flowPower === "broadcast") &&
      room.players.length >= 2
    ) {
      const initialPicks = Object.fromEntries(
        Object.values(next.pendingSubmissions).map((s) => [s.playerId, s.number]),
      );
      // Broadcast shows every pick to everyone, so it needs no per-player target
      // assignment — the projection reads initialPicks wholesale instead.
      const targets = flowPower === "broadcast" ? {} : assignPeekTargets(next);
      return {
        ...next,
        phase: "turn_neighbor_review",
        neighborReview: { initialPicks, targets },
        pendingSubmissions: {},
        updatedAt: Date.now(),
      };
    }
    next = resolveTurn(next);
  }
  return next;
}

// Who each player glimpses during a Refraction re-pick: a random OTHER player (never
// yourself). Sorted seat order keeps it robust even if seat numbers ever had gaps.
// Uses Math.random like the Wild roll — tests mock it for determinism.
function assignPeekTargets(
  room: RoomDoc,
  rng: () => number = Math.random,
): { [playerId: string]: string } {
  const sorted = [...room.players].sort((a, b) => a.seat - b.seat);
  const targets: { [playerId: string]: string } = {};
  for (let i = 0; i < sorted.length; i++) {
    const others = sorted.filter((_, j) => j !== i);
    targets[sorted[i].id] = others[Math.floor(rng() * others.length)].id;
  }
  return targets;
}

// Glimpse re-pick (Refraction/Broadcast): number-only, from the player's (still full)
// hand. When everyone has re-submitted, resolve the turn with the final picks.
function submitNeighborReview(room: RoomDoc, input: SubmitInput): RoomDoc {
  if (!room.neighborReview) throw new Error("No neighbor review pending");
  if (input.powerUp) throw new Error("No power-up during neighbor review");
  const round = room.rounds[room.currentRoundIndex];
  if (!room.players.some((p) => p.id === input.playerId)) throw new Error("Not in room");
  if (!round.hands[input.playerId].includes(input.number)) throw new Error("Number not in hand");
  if (room.pendingSubmissions[input.playerId]) throw new Error("Already submitted");

  const submission: SubmissionDoc = { playerId: input.playerId, number: input.number };
  const next: RoomDoc = {
    ...room,
    pendingSubmissions: { ...room.pendingSubmissions, [input.playerId]: submission },
    updatedAt: Date.now(),
  };
  if (Object.keys(next.pendingSubmissions).length === room.players.length) {
    return resolveTurn(next);
  }
  return next;
}

function submitPeekReview(room: RoomDoc, input: SubmitInput): RoomDoc {
  if (!room.peekReview) throw new Error("No peek review pending");
  if (input.playerId !== room.peekReview.peekerId) throw new Error("Only the peeker may submit during peek review");
  if (input.powerUp) throw new Error("Power-up already played this turn");
  const round = room.rounds[room.currentRoundIndex];
  if (!round.hands[input.playerId].includes(input.number)) throw new Error("Number not in hand");

  const submission: SubmissionDoc = {
    playerId: input.playerId,
    number: input.number,
    powerUp: "peek",
    powerUpTarget: room.peekReview.targetId,
  };

  const next: RoomDoc = {
    ...room,
    pendingSubmissions: { ...room.pendingSubmissions, [input.playerId]: submission },
    phase: "turn_submitting",
    updatedAt: Date.now(),
  };

  return resolveTurn(next);
}

function resolveTurn(room: RoomDoc): RoomDoc {
  const round = room.rounds[room.currentRoundIndex];
  const turnIndex = room.currentTurnIndex;
  const pickerId = round.rotation[turnIndex];

  // Sabotage override affects BOTH scoring and hand removal: the target plays the
  // forced card (so it's scored as such, and discarded from their hand instead of
  // their original pick).
  const sabotageSub = Object.values(room.pendingSubmissions).find((s) => s.powerUp === "sabotage");
  let sabotageUsed: RevealDoc["sabotageUsed"];
  const sabotageOverrides: { [playerId: string]: number } = {};
  if (sabotageSub && sabotageSub.powerUpTarget && sabotageSub.sabotageNumber != null) {
    const original = room.pendingSubmissions[sabotageSub.powerUpTarget];
    if (original) {
      sabotageOverrides[sabotageSub.powerUpTarget] = sabotageSub.sabotageNumber;
      sabotageUsed = {
        sabotagerId: sabotageSub.playerId,
        targetId: sabotageSub.powerUpTarget,
        forcedNumber: sabotageSub.sabotageNumber,
        originalNumber: original.number,
      };
    }
  }

  // Score-only overrides: layered on top of sabotage but NOT used for hand removal.
  // Each player still discards their own original card from their hand. Switch cards
  // and Random ray both write here.
  const scoreOverrides: { [playerId: string]: number } = {};

  // Switch Cards: the two players score each other's picked number.
  const switchSub = Object.values(room.pendingSubmissions).find(
    (s) => (s.resolvedPowerUp ?? s.powerUp) === "switch_cards",
  );
  let switchUsed: RevealDoc["switchUsed"];
  if (switchSub && switchSub.powerUpTarget && room.pendingSubmissions[switchSub.powerUpTarget]) {
    const a = switchSub.playerId;
    const b = switchSub.powerUpTarget;
    const aNum = sabotageOverrides[a] ?? room.pendingSubmissions[a].number;
    const bNum = sabotageOverrides[b] ?? room.pendingSubmissions[b].number;
    scoreOverrides[a] = bNum;
    scoreOverrides[b] = aNum;
    switchUsed = {
      switcherId: a,
      targetId: b,
      switcherOriginal: room.pendingSubmissions[a].number,
      targetOriginal: room.pendingSubmissions[b].number,
    };
  }

  // Random Ray: target's score becomes a random number from the game's full pool.
  // The roll uses Math.random() (mockable in tests, same as rollWildPower). Target's
  // original card still leaves their hand — the rolled number is purely a score override.
  const raySub = Object.values(room.pendingSubmissions).find(
    (s) => (s.resolvedPowerUp ?? s.powerUp) === "random_ray",
  );
  let rayUsed: RevealDoc["rayUsed"];
  if (raySub && raySub.powerUpTarget && room.pendingSubmissions[raySub.powerUpTarget]) {
    const targetId = raySub.powerUpTarget;
    const pool = gameNumbers(room);
    const rolledNumber = pool[Math.floor(Math.random() * pool.length)];
    scoreOverrides[targetId] = rolledNumber;
    rayUsed = {
      rayUserId: raySub.playerId,
      targetId,
      rolledNumber,
      originalNumber: room.pendingSubmissions[targetId].number,
    };
  }

  const playsBySeat = [...room.players].sort((a, b) => a.seat - b.seat);
  // What gets recorded in the reveal: keeps the picker's submitted power (e.g. "wild")
  // and the resolved roll so the UI can show "wild → plus_two".
  const revealSubmissions = playsBySeat.map((p) => {
    const s = room.pendingSubmissions[p.id];
    const number = scoreOverrides[p.id] ?? sabotageOverrides[p.id] ?? s.number;
    return {
      playerId: p.id,
      number,
      powerUp: s.powerUp,
      powerUpTarget: s.powerUpTarget,
      sabotageNumber: s.sabotageNumber,
      resolvedPowerUp: s.resolvedPowerUp,
    };
  });
  // What the scoring engine actually scores: a wild submission swaps in the rolled power.
  const plays = revealSubmissions.map((s) => ({
    playerId: s.playerId,
    number: s.number,
    powerUp: s.resolvedPowerUp ?? s.powerUp,
    powerUpTarget: s.powerUpTarget,
    sabotageNumber: s.sabotageNumber,
  }));

  const result = scoreTurn(
    plays,
    gameNumbers(room),
    round.roundPower,
    round.roundPower === "fadeout" ? round.fadedIds : undefined,
  );

  // Fadeout (round power): after scoring, the weakest living signal fades — every
  // still-alive player at the turn's minimum delta is eliminated for the rest of
  // the round (scoreTurn zeroes their future lines; their cards still tie/cancel).
  // A turn with no clear weakest (all alive deltas equal: a full tie, or a board
  // wiped by a lone 0) fades nobody, so the 0 doubles as a stall button. The turn
  // the race reaches a sole survivor, the bonus lands on their score line before
  // totals/round scores are derived from it below.
  let fadeoutFaded: string[] | undefined;
  let fadeoutSurvivorId: string | undefined;
  let newFadedIds = round.fadedIds;
  if (round.roundPower === "fadeout") {
    const already = round.fadedIds ?? [];
    const aliveLines = result.lines.filter((l) => !already.includes(l.playerId));
    const min = Math.min(...aliveLines.map((l) => l.delta));
    if (aliveLines.length > 1 && aliveLines.some((l) => l.delta !== min)) {
      fadeoutFaded = aliveLines.filter((l) => l.delta === min).map((l) => l.playerId);
      newFadedIds = [...already, ...fadeoutFaded];
      const survivors = aliveLines.filter((l) => l.delta !== min);
      if (survivors.length === 1) {
        const bonus = FADEOUT_BONUS_PER_OUTLASTED * (room.players.length - 1);
        survivors[0].delta += bonus;
        survivors[0].notes.push(`Fadeout: last signal standing, +${bonus}`);
        fadeoutSurvivorId = survivors[0].playerId;
      }
    }
  }

  let peekUsed: RevealDoc["peekUsed"];
  if (room.peekReview) {
    peekUsed = {
      peekerId: room.peekReview.peekerId,
      targetId: room.peekReview.targetId,
      revealedNumber: room.peekReview.revealedNumber,
      originalNumber: room.peekReview.originalNumber,
    };
  }

  const updatedPlayers = room.players.map((p) => {
    const line = result.lines.find((l) => l.playerId === p.id);
    return line ? { ...p, totalScore: p.totalScore + line.delta } : p;
  });
  const updatedRoundScores = { ...round.perPlayerRoundScore };
  for (const l of result.lines) {
    updatedRoundScores[l.playerId] = (updatedRoundScores[l.playerId] ?? 0) + l.delta;
  }

  // Pool removal uses the *submitted* power slot (so playing "wild" removes wild from
  // the pool, not the rolled power — which may not even be in the pool).
  const playedPower = revealSubmissions.find((s) => s.powerUp)?.powerUp;
  const newPoolRemaining = playedPower
    ? (() => {
        const idx = round.poolRemaining.indexOf(playedPower);
        return idx >= 0
          ? [...round.poolRemaining.slice(0, idx), ...round.poolRemaining.slice(idx + 1)]
          : round.poolRemaining;
      })()
    : round.poolRemaining;

  // Hand removal uses sabotage override but NOT switch override: each player
  // discards their own original pick (which is what's actually in their hand);
  // sabotage's forced number is the exception (the target loses the forced card,
  // not their original). Under the Echo round power played cards return to the
  // hand instead of being discarded — except the 0 ("silence does not echo"),
  // which is spent as normal so a leader can't cancel the board every turn.
  const echoActive = round.roundPower === "echo";
  const newHands = { ...round.hands };
  for (const playerId of Object.keys(room.pendingSubmissions)) {
    const removed = sabotageOverrides[playerId] ?? room.pendingSubmissions[playerId].number;
    if (echoActive && removed !== 0) continue;
    newHands[playerId] = newHands[playerId].filter((n) => n !== removed);
  }

  // Swap hands runs *after* played cards are removed, so each player keeps their
  // own played card off the swapped remainder. Persists for the rest of the round
  // simply by reassigning the arrays; subsequent turns play from the new hands.
  const swapSub = revealSubmissions.find((s) => (s.resolvedPowerUp ?? s.powerUp) === "swap_hands");
  let swapUsed: RevealDoc["swapUsed"];
  if (swapSub && swapSub.powerUpTarget && newHands[swapSub.powerUpTarget]) {
    const a = swapSub.playerId;
    const b = swapSub.powerUpTarget;
    [newHands[a], newHands[b]] = [newHands[b], newHands[a]];
    swapUsed = { swapperId: a, targetId: b };
  }

  // Glimpse re-pick (Refraction/Broadcast): record each player's pre-review pick vs.
  // their final pick so the reveal can show who adjusted after their glimpse.
  let crosstalkUsed: RevealDoc["crosstalkUsed"];
  if (room.neighborReview) {
    const initial = room.neighborReview.initialPicks;
    crosstalkUsed = room.players.map((p) => ({
      playerId: p.id,
      initialNumber: initial[p.id] ?? room.pendingSubmissions[p.id]?.number ?? 0,
      finalNumber: room.pendingSubmissions[p.id]?.number ?? 0,
    }));
  }

  const reveal: RevealDoc = {
    turnIndex,
    pickerId,
    submissions: revealSubmissions,
    scoreLines: result.lines,
    peekUsed,
    sabotageUsed,
    swapUsed,
    switchUsed,
    rayUsed,
    crosstalkUsed,
    fadeoutFaded,
    fadeoutSurvivorId,
    revealedAt: Date.now(),
  };

  const updatedRound: RoundDoc = {
    ...round,
    poolRemaining: newPoolRemaining,
    hands: newHands,
    reveals: [...round.reveals, reveal],
    perPlayerRoundScore: updatedRoundScores,
    fadedIds: newFadedIds,
  };

  const handSize = room.players.length + 2;
  const isLastTurn = turnIndex >= handSize - 1;

  const next: RoomDoc = {
    ...room,
    // Always land back in turn_submitting for the next turn: resolveTurn can be
    // entered from turn_peek_review or turn_neighbor_review, whose phase would
    // otherwise leak through the `...room` spread. (isLastTurn overrides below.)
    phase: "turn_submitting",
    players: updatedPlayers,
    rounds: room.rounds.map((r, i) => (i === room.currentRoundIndex ? updatedRound : r)),
    pendingSubmissions: {},
    currentTurnIndex: turnIndex + 1,
    peekReview: undefined,
    neighborReview: undefined,
    updatedAt: Date.now(),
  };

  if (isLastTurn) {
    const isLastRound = room.currentRoundIndex + 1 >= room.config.rounds;
    let ended: RoomDoc = { ...next, phase: "round_end" };
    if (!isLastRound && round.roundPower === "conductor") {
      // Conductor: the round's top scorer picks the next round's power from up to
      // 3 drawn options. A tie for the top sends the podium to one of the tied
      // players by lot (the client stages the draw as a name flicker). Only an
      // empty option pool (e.g. a one-entry Choose roster before a final round)
      // skips conduct mode entirely, so a winner is never wedged behind a pick
      // with no options; that case falls back to the normal random roll.
      const scores = room.players.map((p) => updatedRoundScores[p.id] ?? 0);
      const max = Math.max(...scores);
      const winners = room.players.filter((p) => (updatedRoundScores[p.id] ?? 0) === max);
      // Math.random like the Wild roll and peek targets; tests mock it.
      const winner = winners[Math.floor(Math.random() * winners.length)];
      // next.rounds already includes this round, so conductor itself counts as
      // used and can only reappear via the exhausted-roster fallback.
      const pool = roundPowerPool(
        room.config,
        room.players.length,
        usedRoundPowers(next.rounds),
        room.currentRoundIndex + 1,
      );
      const options = shuffle(pool).slice(0, 3);
      if (options.length > 0) {
        ended = {
          ...ended,
          rounds: ended.rounds.map((r, i) =>
            i === room.currentRoundIndex
              ? { ...r, conductorWinnerId: winner.id, conductorOptions: options }
              : r,
          ),
        };
      }
    }
    return isLastRound ? endGame(ended) : ended;
  }
  return next;
}

export function unsubmitTurn(room: RoomDoc, playerId: string): RoomDoc {
  if (room.phase !== "turn_submitting") throw new Error("Can only unlock during submission phase");
  if (!room.pendingSubmissions[playerId]) throw new Error("Nothing to unlock");
  const remaining = { ...room.pendingSubmissions };
  delete remaining[playerId];
  return {
    ...room,
    pendingSubmissions: remaining,
    updatedAt: Date.now(),
  };
}

// Conductor: the recorded pick for the next round, if this round had a conducting
// winner who chose. Absent (→ normal random roll) on ties, non-conductor rounds,
// and when the winner never picked (forceAdvance past an absent winner).
function conductorForced(round: RoundDoc): { power: RoundPowerId; chosenBy: string } | undefined {
  return round.roundPower === "conductor" && round.conductorChoice && round.conductorWinnerId
    ? { power: round.conductorChoice, chosenBy: round.conductorWinnerId }
    : undefined;
}

export function ackRoundEnd(
  room: RoomDoc,
  playerId: string,
  rng: () => number = Math.random,
  chosenPower?: RoundPowerId,
): RoomDoc {
  if (room.phase !== "round_end") return room;
  const round = room.rounds[room.currentRoundIndex];
  if (round.endAcksBy.includes(playerId)) return room;
  // Conductor: the round winner's ack must carry their pick for the next round.
  const conducting =
    round.roundPower === "conductor" &&
    round.conductorWinnerId === playerId &&
    (round.conductorOptions?.length ?? 0) > 0;
  if (chosenPower != null) {
    if (!conducting) throw new Error("Only the round winner picks the next power");
    if (!round.conductorOptions!.includes(chosenPower)) {
      throw new Error("That power is not one of the options");
    }
  } else if (conducting && !round.conductorChoice) {
    throw new Error("Pick the next round's power first");
  }
  const acks = [...round.endAcksBy, playerId];
  const allReady = acks.length === room.players.length;
  const updatedRound: RoundDoc = {
    ...round,
    endAcksBy: acks,
    conductorChoice: chosenPower ?? round.conductorChoice,
  };
  const next: RoomDoc = {
    ...room,
    rounds: room.rounds.map((r, i) => (i === room.currentRoundIndex ? updatedRound : r)),
    updatedAt: Date.now(),
  };
  if (!allReady) return next;
  const nextRoundIdx = room.currentRoundIndex + 1;
  if (nextRoundIdx >= room.config.rounds) return endGame(next);
  return startRound(next, nextRoundIdx, rng, conductorForced(updatedRound));
}

export function forceAdvanceRound(
  room: RoomDoc,
  playerId: string,
  rng: () => number = Math.random,
): RoomDoc {
  if (playerId !== room.hostId) throw new Error("Only host can force-advance");
  if (room.phase !== "round_end") return room;
  const nextRoundIdx = room.currentRoundIndex + 1;
  if (nextRoundIdx >= room.config.rounds) return endGame(room);
  // Honors a conductor pick recorded before the stall; an absent winner who never
  // picked just falls back to the random roll.
  return startRound(room, nextRoundIdx, rng, conductorForced(room.rounds[room.currentRoundIndex]));
}

function endGame(room: RoomDoc): RoomDoc {
  let winnerId: string | undefined;
  let max = -Infinity;
  for (const p of room.players) {
    if (p.totalScore > max) {
      max = p.totalScore;
      winnerId = p.id;
    }
  }
  // Bank this game into the cross-rematch series tally: everyone accumulates
  // points, and every player tied at the top score gets a win (a tied game
  // counts for all tied leaders, even though winnerId stays a single player).
  const prev = room.series ?? { gamesPlayed: 0, perPlayer: {} };
  const perPlayer = { ...prev.perPlayer };
  for (const p of room.players) {
    const entry = perPlayer[p.id] ?? { wins: 0, points: 0 };
    perPlayer[p.id] = {
      wins: entry.wins + (p.totalScore === max ? 1 : 0),
      points: entry.points + p.totalScore,
    };
  }
  const series: SeriesState = { gamesPlayed: prev.gamesPlayed + 1, perPlayer };
  return { ...room, phase: "game_end", winnerId, series, updatedAt: Date.now() };
}

// "Play again" — same room, same seats, same claim tokens. Wipes all game
// progress back to a fresh lobby so the host can re-tweak config and start
// again. Players who left during game_end linger as offline seats (their
// claim token is cleared client-side); the host can kick them in the lobby.
export function resetToLobby(room: RoomDoc): RoomDoc {
  if (room.phase !== "game_end") throw new Error("Game is not over yet");
  return {
    ...room,
    phase: "lobby",
    players: room.players.map((p) => ({ ...p, totalScore: 0 })),
    rounds: [],
    currentRoundIndex: -1,
    currentTurnIndex: -1,
    pendingSubmissions: {},
    peekReview: undefined,
    winnerId: undefined,
    updatedAt: Date.now(),
  };
}

// Pick the next host from a player list: lowest-seat player still in the room,
// preferring one who's currently online so the role lands on someone who can
// actually drive the game. Falls back to the lowest-seat offline player so a
// room is never left hostless. Returns undefined only when there are no players.
function pickNewHost(
  players: PlayerDoc[],
  opts: { excludePlayerId?: string; onlineIds: ReadonlySet<string> },
): string | undefined {
  // Bots never hold the host role — they can't drive lobby/round decisions.
  const candidates = players.filter((p) => p.id !== opts.excludePlayerId && !p.isBot);
  if (candidates.length === 0) return undefined;
  const online = candidates.filter((p) => opts.onlineIds.has(p.id));
  const pool = online.length > 0 ? online : candidates;
  return [...pool].sort((a, b) => a.seat - b.seat)[0].id;
}

// Host steps away gracefully (the "Leave" button). The leaver keeps their seat
// and claim token so they can rejoin as a normal player; only the host role
// moves on, to the lowest-seat online player. No-op if the caller isn't the
// host or is the only player (they stay host; the seat is kept for rejoin).
export function stepDownHost(room: RoomDoc, leaverId: string, onlineIds: ReadonlySet<string>): RoomDoc {
  if (room.hostId !== leaverId) return room;
  const newHost = pickNewHost(room.players, { excludePlayerId: leaverId, onlineIds });
  if (!newHost) return room;
  return { ...room, hostId: newHost, updatedAt: Date.now() };
}

// A present player grabs the host role, but only when the current host is
// offline (e.g. their tab crashed, or they're returning days later in an async
// game). The host-offline guard stops anyone yanking the role from an active host.
export function claimHost(room: RoomDoc, requesterId: string, onlineIds: ReadonlySet<string>): RoomDoc {
  if (!room.players.some((p) => p.id === requesterId)) throw new Error("Not in room");
  if (room.hostId === requesterId) return room;
  if (onlineIds.has(room.hostId)) throw new Error("Host is still here");
  if (!onlineIds.has(requesterId)) throw new Error("You're offline");
  return { ...room, hostId: requesterId, updatedAt: Date.now() };
}

// Host "Skip waiting": push a stalled turn past players who haven't submitted
// (whether they've left, disconnected, or are just AFK). Each missing player is
// auto-played a number sampled by the shared bot heuristic (chooseNumber) with no
// power-up — picked from their remaining hand, weighted toward sensible cards but
// varied, so multiple absentees (or repeated skips) don't all dump the same lowest
// card and tie. An absent picker still forfeits the power slot, so the pool rolls
// untouched to the next picker. Then the normal resolveTurn runs. Keyed on who
// hasn't submitted, not on presence, so the host can also push past an idle online
// player. rng is injectable for deterministic tests (defaults to Math.random).
export function forceResolveTurn(room: RoomDoc, rng: () => number = Math.random): RoomDoc {
  const round = room.rounds[room.currentRoundIndex];
  const handsExcept = (playerId: string) =>
    room.players.filter((p) => p.id !== playerId).map((p) => round.hands[p.id] ?? []);

  if (room.phase === "turn_peek_review") {
    // The peeker is the lone outstanding submitter (everyone else already
    // submitted before peek review began). Auto-submit a sampled card with the
    // recorded peek target; the revealed opponent number is fed as a known play so
    // the pick avoids it. Keep peekReview so resolveTurn records peekUsed.
    if (!room.peekReview) throw new Error("Nothing to skip");
    const { peekerId, targetId, revealedNumber } = room.peekReview;
    const number = chooseNumber(
      round.hands[peekerId] ?? [],
      handsExcept(peekerId),
      [revealedNumber],
      rng,
      round.roundPower,
    );
    const submission: SubmissionDoc = { playerId: peekerId, number, powerUp: "peek", powerUpTarget: targetId };
    return resolveTurn({
      ...room,
      phase: "turn_submitting",
      pendingSubmissions: { ...room.pendingSubmissions, [peekerId]: submission },
      updatedAt: Date.now(),
    });
  }
  if (room.phase === "turn_neighbor_review") {
    // Glimpse re-pick phase: fill non-submitters with their initial pick (or a
    // sampled card as a fallback) and resolve.
    if (!room.neighborReview) throw new Error("Nothing to skip");
    const filled = { ...room.pendingSubmissions };
    for (const p of room.players) {
      if (filled[p.id]) continue;
      const initial = room.neighborReview.initialPicks[p.id];
      const number =
        initial != null
          ? initial
          : chooseNumber(round.hands[p.id] ?? [], handsExcept(p.id), [], rng, round.roundPower);
      filled[p.id] = { playerId: p.id, number };
    }
    return resolveTurn({ ...room, pendingSubmissions: filled, updatedAt: Date.now() });
  }
  if (room.phase !== "turn_submitting") throw new Error("Nothing to skip");
  const missing = room.players.filter((p) => !room.pendingSubmissions[p.id]);
  if (missing.length === 0) return room;
  const filled = { ...room.pendingSubmissions };
  for (const p of missing) {
    const number = chooseNumber(round.hands[p.id] ?? [], handsExcept(p.id), [], rng, round.roundPower);
    filled[p.id] = { playerId: p.id, number };
  }
  return resolveTurn({ ...room, pendingSubmissions: filled, updatedAt: Date.now() });
}

// Remove a player from the room. Clean at a round boundary (or lobby) because the
// next startRound re-deals hands/rotation/pool for the smaller set; finished-round
// history that still references the removed id is left intact (it's correct
// history, and the client renders names from the current player list). Mid-turn
// removal would desync the in-flight round, so it throws — use forceResolveTurn there.
export function removePlayer(room: RoomDoc, playerId: string, onlineIds: ReadonlySet<string> = new Set()): RoomDoc {
  if (room.phase === "lobby" || room.phase === "round_end" || room.phase === "game_end") {
    const players = room.players.filter((p) => p.id !== playerId).map((p, i) => ({ ...p, seat: i }));
    const hostId =
      room.hostId === playerId ? (pickNewHost(players, { onlineIds }) ?? room.hostId) : room.hostId;
    // The series line goes with the seat: a kicked player's banked wins/points leave too.
    const prevSeries = room.series ?? { gamesPlayed: 0, perPlayer: {} };
    const perPlayer = { ...prevSeries.perPlayer };
    delete perPlayer[playerId];
    return { ...room, players, hostId, series: { ...prevSeries, perPlayer }, updatedAt: Date.now() };
  }
  throw new Error("Cannot remove a player mid-turn (use Skip waiting instead)");
}
