import { POWER_UP_IDS, type PowerUpId } from "../../../shared/types.js";
import { scoreTurn } from "./scoring.js";

export type RoomPhaseDoc =
  | "lobby"
  | "turn_submitting"
  | "turn_peek_review"
  | "round_end"
  | "game_end";

export interface PlayerDoc {
  id: string;
  name: string;
  seat: number;
  totalScore: number;
}

export interface SubmissionDoc {
  playerId: string;
  number: number;
  powerUp?: PowerUpId;
  powerUpTarget?: string;
}

export interface RevealDoc {
  turnIndex: number;
  pickerId: string;
  submissions: SubmissionDoc[];
  scoreLines: { playerId: string; delta: number; notes: string[] }[];
  peekUsed?: { peekerId: string; targetId: string; revealedNumber: number; originalNumber: number };
  revealedAt: number;
}

export interface RoundDoc {
  index: number;
  poolFull: PowerUpId[];
  poolRemaining: PowerUpId[];
  rotation: string[];
  reveals: RevealDoc[];
  hands: { [playerId: string]: number[] };
  endAcksBy: string[];
  perPlayerRoundScore: { [playerId: string]: number };
}

export interface PeekReviewDoc {
  peekerId: string;
  targetId: string;
  revealedNumber: number;
  originalNumber: number;
}

export interface RoomDoc {
  code: string;
  hostId: string;
  config: { rounds: number; turnDeadlineMs: number | null };
  phase: RoomPhaseDoc;
  players: PlayerDoc[];
  rounds: RoundDoc[];
  currentRoundIndex: number;
  currentTurnIndex: number;
  pendingSubmissions: { [playerId: string]: SubmissionDoc };
  peekReview?: PeekReviewDoc;
  winnerId?: string;
  createdAt: number;
  updatedAt: number;
}

const HOST_SEAT = 0;
const MAX_PLAYERS = 8;

export function createRoom(opts: {
  code: string;
  hostId: string;
  hostName: string;
  rounds: number;
  turnDeadlineMs: number | null;
}): RoomDoc {
  const now = Date.now();
  return {
    code: opts.code,
    hostId: opts.hostId,
    config: { rounds: opts.rounds, turnDeadlineMs: opts.turnDeadlineMs },
    phase: "lobby",
    players: [{ id: opts.hostId, name: opts.hostName, seat: HOST_SEAT, totalScore: 0 }],
    rounds: [],
    currentRoundIndex: -1,
    currentTurnIndex: -1,
    pendingSubmissions: {},
    createdAt: now,
    updatedAt: now,
  };
}

export function addPlayer(room: RoomDoc, playerId: string, name: string): RoomDoc {
  if (room.phase !== "lobby") throw new Error("game already started");
  if (room.players.length >= MAX_PLAYERS) throw new Error("room is full");
  if (room.players.some((p) => p.id === playerId)) return room;
  if (room.players.some((p) => p.name.trim().toLowerCase() === name.trim().toLowerCase())) {
    throw new Error("name taken");
  }
  return {
    ...room,
    players: [...room.players, { id: playerId, name, seat: room.players.length, totalScore: 0 }],
    updatedAt: Date.now(),
  };
}

function shuffle<T>(arr: T[], rng: () => number = Math.random): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function dealPool(handSize: number, rng = Math.random): PowerUpId[] {
  const ids = [...POWER_UP_IDS];
  if (handSize <= ids.length) return shuffle(ids, rng).slice(0, handSize);
  const out: PowerUpId[] = [];
  while (out.length < handSize) {
    out.push(...shuffle(ids, rng).slice(0, Math.min(ids.length, handSize - out.length)));
  }
  return out;
}

function dealHand(handSize: number): number[] {
  return Array.from({ length: handSize }, (_, i) => i);
}

function buildRotation(players: PlayerDoc[], handSize: number, roundIndex: number): string[] {
  const sorted = [...players].sort((a, b) => a.seat - b.seat);
  const offset = roundIndex % sorted.length;
  const order = [...sorted.slice(offset), ...sorted.slice(0, offset)];
  const rot: string[] = [];
  for (let i = 0; i < handSize; i++) rot.push(order[i % order.length].id);
  return rot;
}

export function startGame(room: RoomDoc): RoomDoc {
  if (room.phase !== "lobby") throw new Error("not in lobby");
  if (room.players.length < 2) throw new Error("need at least 2 players");
  return startRound(room, 0);
}

function startRound(room: RoomDoc, roundIndex: number): RoomDoc {
  const handSize = room.players.length + 2;
  const round: RoundDoc = {
    index: roundIndex,
    poolFull: dealPool(handSize),
    poolRemaining: [],
    rotation: buildRotation(room.players, handSize, roundIndex),
    reveals: [],
    hands: Object.fromEntries(room.players.map((p) => [p.id, dealHand(handSize)])),
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
    updatedAt: Date.now(),
  };
}

export interface SubmitInput {
  playerId: string;
  number: number;
  powerUp?: PowerUpId;
  powerUpTarget?: string;
}

export function submitTurn(room: RoomDoc, input: SubmitInput): RoomDoc {
  if (room.phase === "turn_peek_review") return submitPeekReview(room, input);
  if (room.phase !== "turn_submitting") throw new Error("not accepting submissions");

  const round = room.rounds[room.currentRoundIndex];
  const turnIndex = room.currentTurnIndex;
  const pickerId = round.rotation[turnIndex];

  const player = room.players.find((p) => p.id === input.playerId);
  if (!player) throw new Error("not in room");

  const hand = round.hands[input.playerId];
  if (!hand.includes(input.number)) throw new Error("number not in hand");

  if (room.pendingSubmissions[input.playerId]) throw new Error("already submitted");

  if (input.powerUp) {
    if (input.playerId !== pickerId) throw new Error("only picker plays power-up");
    if (!round.poolRemaining.includes(input.powerUp)) throw new Error("power-up not in pool");
  } else if (input.playerId === pickerId && round.poolRemaining.length > 0) {
    throw new Error("picker must pick a power-up while pool is non-empty");
  }
  if (input.powerUp === "peek" || input.powerUp === "mute") {
    if (!input.powerUpTarget) throw new Error("target required");
    if (input.powerUpTarget === input.playerId) throw new Error("cannot target self");
    if (!room.players.some((p) => p.id === input.powerUpTarget)) throw new Error("unknown target");
  }

  const submission: SubmissionDoc = {
    playerId: input.playerId,
    number: input.number,
    powerUp: input.powerUp,
    powerUpTarget: input.powerUpTarget,
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
    next = resolveTurn(next);
  }
  return next;
}

function submitPeekReview(room: RoomDoc, input: SubmitInput): RoomDoc {
  if (!room.peekReview) throw new Error("no peek review pending");
  if (input.playerId !== room.peekReview.peekerId) throw new Error("only the peeker may submit during peek review");
  if (input.powerUp) throw new Error("power-up already played this turn");
  const round = room.rounds[room.currentRoundIndex];
  if (!round.hands[input.playerId].includes(input.number)) throw new Error("number not in hand");

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

  const playsBySeat = [...room.players].sort((a, b) => a.seat - b.seat);
  const plays = playsBySeat.map((p) => {
    const s = room.pendingSubmissions[p.id];
    return {
      playerId: p.id,
      number: s.number,
      powerUp: s.powerUp,
      powerUpTarget: s.powerUpTarget,
    };
  });

  const result = scoreTurn(plays);

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

  const playedPower = plays.find((pl) => pl.powerUp)?.powerUp;
  const newPoolRemaining = playedPower
    ? (() => {
        const idx = round.poolRemaining.indexOf(playedPower);
        return idx >= 0
          ? [...round.poolRemaining.slice(0, idx), ...round.poolRemaining.slice(idx + 1)]
          : round.poolRemaining;
      })()
    : round.poolRemaining;

  const newHands = { ...round.hands };
  for (const pl of plays) newHands[pl.playerId] = newHands[pl.playerId].filter((n) => n !== pl.number);

  const reveal: RevealDoc = {
    turnIndex,
    pickerId,
    submissions: plays,
    scoreLines: result.lines,
    peekUsed,
    revealedAt: Date.now(),
  };

  const updatedRound: RoundDoc = {
    ...round,
    poolRemaining: newPoolRemaining,
    hands: newHands,
    reveals: [...round.reveals, reveal],
    perPlayerRoundScore: updatedRoundScores,
  };

  const handSize = room.players.length + 2;
  const isLastTurn = turnIndex >= handSize - 1;

  const next: RoomDoc = {
    ...room,
    players: updatedPlayers,
    rounds: room.rounds.map((r, i) => (i === room.currentRoundIndex ? updatedRound : r)),
    pendingSubmissions: {},
    currentTurnIndex: turnIndex + 1,
    peekReview: undefined,
    updatedAt: Date.now(),
  };

  if (isLastTurn) {
    const isLastRound = room.currentRoundIndex + 1 >= room.config.rounds;
    const ended: RoomDoc = { ...next, phase: "round_end" };
    return isLastRound ? endGame(ended) : ended;
  }
  return next;
}

export function ackRoundEnd(room: RoomDoc, playerId: string): RoomDoc {
  if (room.phase !== "round_end") return room;
  const round = room.rounds[room.currentRoundIndex];
  if (round.endAcksBy.includes(playerId)) return room;
  const acks = [...round.endAcksBy, playerId];
  const allReady = acks.length === room.players.length;
  const updatedRound: RoundDoc = { ...round, endAcksBy: acks };
  const next: RoomDoc = {
    ...room,
    rounds: room.rounds.map((r, i) => (i === room.currentRoundIndex ? updatedRound : r)),
    updatedAt: Date.now(),
  };
  if (!allReady) return next;
  const nextRoundIdx = room.currentRoundIndex + 1;
  if (nextRoundIdx >= room.config.rounds) return endGame(next);
  return startRound(next, nextRoundIdx);
}

export function forceAdvanceRound(room: RoomDoc, playerId: string): RoomDoc {
  if (playerId !== room.hostId) throw new Error("only host can force-advance");
  if (room.phase !== "round_end") return room;
  const nextRoundIdx = room.currentRoundIndex + 1;
  if (nextRoundIdx >= room.config.rounds) return endGame(room);
  return startRound(room, nextRoundIdx);
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
  return { ...room, phase: "game_end", winnerId, updatedAt: Date.now() };
}

export function removePlayer(room: RoomDoc, playerId: string): RoomDoc {
  if (room.phase === "lobby") {
    return {
      ...room,
      players: room.players.filter((p) => p.id !== playerId).map((p, i) => ({ ...p, seat: i })),
      hostId:
        room.hostId === playerId && room.players.length > 1 ? room.players.find((p) => p.id !== playerId)!.id : room.hostId,
      updatedAt: Date.now(),
    };
  }
  throw new Error("cannot remove a player mid-game (use force-skip instead)");
}
