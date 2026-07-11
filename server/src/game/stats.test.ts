import { describe, expect, it } from "vitest";
import { computeGameStats, type GameStatsInput } from "./stats.js";

type Line = { playerId: string; delta: number; notes: string[] };

function room(
  rounds: { scores: Record<string, number>; lines: Line[][] }[],
  playerIds = ["a", "b", "c"],
): GameStatsInput {
  return {
    players: playerIds.map((id, seat) => ({ id, seat })),
    rounds: rounds.map((r, index) => ({
      index,
      perPlayerRoundScore: r.scores,
      reveals: r.lines.map((scoreLines) => ({ scoreLines })),
    })),
  };
}

const ok = (playerId: string, delta: number): Line => ({
  playerId,
  delta,
  notes: [`Unique ${delta}`],
});
const tied = (playerId: string, face: number): Line => ({
  playerId,
  delta: 0,
  notes: [`Tied on ${face}`],
});
const zeroed = (playerId: string): Line => ({ playerId, delta: 0, notes: ["Cancelled by 0"] });
const silencer = (playerId: string): Line => ({
  playerId,
  delta: 0,
  notes: ["Played 0 (cancelled all others)"],
});

describe("computeGameStats", () => {
  it("returns no stats for an empty game", () => {
    expect(computeGameStats(room([]))).toEqual({});
  });

  it("finds the biggest positive single-turn delta with its round", () => {
    const stats = computeGameStats(
      room([
        { scores: { a: 5, b: 3, c: 0 }, lines: [[ok("a", 5), ok("b", 3), ok("c", 0)]] },
        { scores: { a: 2, b: 9, c: -4 }, lines: [[ok("a", 2), ok("b", 9), { playerId: "c", delta: -4, notes: ["Sacrifice: −4"] }]] },
      ]),
    );
    expect(stats.biggestTurn).toEqual({ playerId: "b", delta: 9, roundIndex: 1 });
  });

  it("omits biggestTurn when no delta is positive", () => {
    const stats = computeGameStats(
      room([{ scores: { a: 0, b: 0, c: 0 }, lines: [[tied("a", 4), tied("b", 4), ok("c", 0)]] }]),
    );
    expect(stats.biggestTurn).toBeUndefined();
  });

  it("counts tie and lone-0 wipes for mostCancelled, breaking ties by lowest seat", () => {
    const stats = computeGameStats(
      room([
        {
          scores: { a: 0, b: 0, c: 5 },
          lines: [
            [tied("a", 4), tied("b", 4), ok("c", 5)],
            [zeroed("a"), zeroed("b"), silencer("c")],
          ],
        },
      ]),
    );
    // a and b were each wiped twice; the lowest seat (a) takes the title.
    expect(stats.mostCancelled).toEqual({ playerId: "a", count: 2 });
  });

  it("does not count Free Three's lost bonus or Tie Die notes as wipes", () => {
    const stats = computeGameStats(
      room([
        {
          scores: { a: 3, b: 3, c: 0 },
          lines: [
            [
              { playerId: "a", delta: 3, notes: ["Free Three: cancelled by 0"] },
              { playerId: "b", delta: 3, notes: ["Tie Die: scored 3 despite tie on 3"] },
              ok("c", 0),
            ],
          ],
        },
      ]),
    );
    expect(stats.mostCancelled).toBeUndefined();
  });

  it("counts lone-0 board wipes for silencer", () => {
    const stats = computeGameStats(
      room([
        {
          scores: { a: 0, b: 0, c: 0 },
          lines: [
            [silencer("c"), zeroed("a"), zeroed("b")],
            [silencer("c"), zeroed("a"), zeroed("b")],
            [silencer("a"), zeroed("b"), zeroed("c")],
          ],
        },
      ]),
    );
    expect(stats.silencer).toEqual({ playerId: "c", count: 2 });
  });

  it("ignores scoreLines from players no longer seated", () => {
    const stats = computeGameStats(
      room(
        [{ scores: { a: 1 }, lines: [[ok("gone", 99), silencer("gone"), ok("a", 1)]] }],
        ["a"],
      ),
    );
    expect(stats.biggestTurn).toEqual({ playerId: "a", delta: 1, roundIndex: 0 });
    expect(stats.silencer).toBeUndefined();
  });

  describe("comeback", () => {
    it("is omitted for single-round games", () => {
      const stats = computeGameStats(
        room([{ scores: { a: 1, b: 9, c: 5 }, lines: [] }]),
      );
      expect(stats.comeback).toBeUndefined();
    });

    it("is omitted when nobody climbs in the final round", () => {
      const stats = computeGameStats(
        room([
          { scores: { a: 9, b: 5, c: 1 }, lines: [] },
          { scores: { a: 9, b: 5, c: 1 }, lines: [] },
        ]),
      );
      expect(stats.comeback).toBeUndefined();
    });

    it("finds the biggest final-round climb", () => {
      const stats = computeGameStats(
        room([
          // Standings before the final round: a=10 (1st), b=6 (2nd), c=1 (3rd).
          { scores: { a: 10, b: 6, c: 1 }, lines: [] },
          // Final: c=13 → 14 total (1st), a → 10 (2nd), b → 6 (3rd). c climbs 2.
          { scores: { a: 0, b: 0, c: 13 }, lines: [] },
        ]),
      );
      expect(stats.comeback).toEqual({ playerId: "c", places: 2, pointsGained: 13 });
    });

    it("breaks a climb tie by points gained in the final round", () => {
      const stats = computeGameStats(
        room([
          // Before final: a=10, b=8, c=6, d=0 (ranks 1..4).
          { scores: { a: 10, b: 8, c: 6, d: 0 }, lines: [] },
          // Final totals: c=12, d=11, a=10, b=8 → c and d both climb 2; d gained more.
          { scores: { a: 0, b: 0, c: 6, d: 11 }, lines: [] },
        ], ["a", "b", "c", "d"]),
      );
      expect(stats.comeback).toEqual({ playerId: "d", places: 2, pointsGained: 11 });
    });
  });
});
