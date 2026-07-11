import type { GameStats } from "../../../shared/types.js";

// Structural view of the RoomDoc fields the stats walk needs, so tests can build
// minimal fixtures without a full engine playthrough. RoomDoc satisfies this.
export interface GameStatsInput {
  players: { id: string; seat: number }[];
  rounds: {
    index: number;
    perPlayerRoundScore: { [playerId: string]: number };
    reveals: { scoreLines: { playerId: string; delta: number; notes: string[] }[] }[];
  }[];
}

// Note-string coupling: these key off the exact strings scoring.ts pushes (the
// same ones the client's revealTreatment reads). "Tied…" is the tie wipe ("Tie
// Die"/"Jinx" notes start "Tie "/"Jinx" so they don't match); the exact
// "Cancelled by 0" match deliberately excludes Free Three's lowercase
// "Free Three: cancelled by 0" (a lost bonus, not a wiped card).
const isWipeNote = (n: string) => n.startsWith("Tied") || n === "Cancelled by 0";
const isSilenceNote = (n: string) => n.includes("cancelled all others");

export function computeGameStats(room: GameStatsInput): GameStats {
  // Seat order makes every tie-break deterministic (lowest seat wins a tie).
  const players = [...room.players].sort((a, b) => a.seat - b.seat);
  const seated = new Set(players.map((p) => p.id));
  const rounds = [...room.rounds].sort((a, b) => a.index - b.index);

  const stats: GameStats = {};

  const cancelledCount = new Map<string, number>();
  const silencedCount = new Map<string, number>();
  for (const round of rounds) {
    for (const reveal of round.reveals) {
      for (const line of reveal.scoreLines) {
        // Players removed mid-game leave scoreLines behind; skip them.
        if (!seated.has(line.playerId)) continue;
        if (line.delta > 0 && (!stats.biggestTurn || line.delta > stats.biggestTurn.delta)) {
          stats.biggestTurn = { playerId: line.playerId, delta: line.delta, roundIndex: round.index };
        }
        if (line.notes.some(isWipeNote)) {
          cancelledCount.set(line.playerId, (cancelledCount.get(line.playerId) ?? 0) + 1);
        }
        if (line.notes.some(isSilenceNote)) {
          silencedCount.set(line.playerId, (silencedCount.get(line.playerId) ?? 0) + 1);
        }
      }
    }
  }

  for (const p of players) {
    const cancelled = cancelledCount.get(p.id) ?? 0;
    if (cancelled > 0 && cancelled > (stats.mostCancelled?.count ?? 0)) {
      stats.mostCancelled = { playerId: p.id, count: cancelled };
    }
    const silenced = silencedCount.get(p.id) ?? 0;
    if (silenced > 0 && silenced > (stats.silencer?.count ?? 0)) {
      stats.silencer = { playerId: p.id, count: silenced };
    }
  }

  // Comeback: standings after the penultimate round vs. final standings.
  if (rounds.length >= 2) {
    const before = new Map(players.map((p) => [p.id, 0]));
    for (const round of rounds.slice(0, -1)) {
      for (const p of players) before.set(p.id, before.get(p.id)! + (round.perPlayerRoundScore[p.id] ?? 0));
    }
    const lastRound = rounds[rounds.length - 1];
    const after = new Map(players.map((p) => [p.id, before.get(p.id)! + (lastRound.perPlayerRoundScore[p.id] ?? 0)]));
    const rank = (totals: Map<string, number>, id: string) =>
      1 + players.filter((p) => totals.get(p.id)! > totals.get(id)!).length;
    for (const p of players) {
      const places = rank(before, p.id) - rank(after, p.id);
      if (places < 1) continue;
      const pointsGained = lastRound.perPlayerRoundScore[p.id] ?? 0;
      const best = stats.comeback;
      if (!best || places > best.places || (places === best.places && pointsGained > best.pointsGained)) {
        stats.comeback = { playerId: p.id, places, pointsGained };
      }
    }
  }

  return stats;
}
