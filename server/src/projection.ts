import type {
  Player,
  PublicState,
  PublicSubmission,
  RevealedTurn,
  RoomStateForPlayer,
  RoundState,
  ScoreLine,
} from "../../shared/types.js";
import type { RevealDoc, RoomDoc } from "./game/engine.js";

function toRevealedTurn(rv: RevealDoc, roundIndex: number): RevealedTurn {
  return {
    turnIndex: rv.turnIndex,
    roundIndex,
    pickerId: rv.pickerId,
    submissions: rv.submissions.map((s) => ({
      playerId: s.playerId,
      number: s.number,
      powerUp: s.powerUp,
      powerUpTarget: s.powerUpTarget,
    })),
    scoring: rv.scoreLines.map<ScoreLine>((l) => ({
      playerId: l.playerId,
      base: l.delta,
      delta: l.delta,
      notes: l.notes,
    })),
    peekUsed: rv.peekUsed,
  };
}

export function projectStateForPlayer(
  room: RoomDoc,
  playerId: string,
  onlinePlayerIds: ReadonlySet<string>,
): RoomStateForPlayer {
  const me = room.players.find((p) => p.id === playerId);
  if (!me) throw new Error("not in room");

  const round = room.currentRoundIndex >= 0 ? room.rounds[room.currentRoundIndex] : undefined;
  const pickerId =
    round && (room.phase === "turn_submitting" || room.phase === "turn_peek_review")
      ? round.rotation[room.currentTurnIndex]
      : undefined;
  const isPicker = pickerId === playerId;

  const players: Player[] = room.players.map((p) => ({
    id: p.id,
    name: p.name,
    seat: p.seat,
    online: onlinePlayerIds.has(p.id),
    totalScore: p.totalScore,
  }));

  const isPeekerReviewing = room.phase === "turn_peek_review" && room.peekReview?.peekerId === playerId;

  const currentSubmissions: PublicSubmission[] = room.players.map((p) => {
    if (room.phase === "turn_peek_review") {
      // The peeker is "thinking" again — show them as not-submitted to others.
      const isPeekerHere = room.peekReview?.peekerId === p.id;
      return { playerId: p.id, submitted: isPeekerHere ? false : true };
    }
    return { playerId: p.id, submitted: !!room.pendingSubmissions[p.id] };
  });

  const lastReveal =
    round && round.reveals.length > 0
      ? toRevealedTurn(round.reveals[round.reveals.length - 1], round.index)
      : undefined;

  const roundState: RoundState | undefined = round
    ? {
        index: round.index,
        poolFull: round.poolFull,
        poolRemaining: round.poolRemaining,
        pickerRotation: round.rotation,
        reveals: round.reveals.map((rv) => toRevealedTurn(rv, round.index)),
        roundScores: round.perPlayerRoundScore,
        endAcksBy: round.endAcksBy,
      }
    : undefined;

  const publicState: PublicState = {
    roomCode: room.code,
    phase: room.phase,
    players,
    hostId: room.hostId,
    round: roundState,
    currentTurnIndex: room.currentTurnIndex,
    currentPickerId: pickerId,
    currentSubmissions,
    lastReveal,
    winnerId: room.winnerId,
    config: room.config,
  };

  const hand = round?.hands[playerId] ?? [];
  const hasSubmittedThisTurn = !!room.pendingSubmissions[playerId];

  let peekReveal: { targetPlayerId: string; revealedNumber: number; originalNumber: number } | undefined;
  let blockedByOthers = false;
  if (isPeekerReviewing && room.peekReview) {
    peekReveal = {
      targetPlayerId: room.peekReview.targetId,
      revealedNumber: room.peekReview.revealedNumber,
      originalNumber: room.peekReview.originalNumber,
    };
  } else if (room.phase === "turn_peek_review") {
    blockedByOthers = true;
  }

  return {
    selfPlayerId: playerId,
    publicState,
    privateState: {
      hand,
      hasSubmittedThisTurn,
      isPicker: !!isPicker,
      peekReveal,
      blockedByOthers,
    },
  };
}
