import { describe, expect, it } from "vitest";
import { scoreTurn } from "./scoring.js";

const points = (r: ReturnType<typeof scoreTurn>) => {
  const m = new Map<string, number>();
  for (const l of r.lines) m.set(l.playerId, l.delta);
  return Object.fromEntries(m);
};

describe("scoreTurn — standard rules", () => {
  it("all unique numbers each score their card value", () => {
    const r = scoreTurn([
      { playerId: "A", number: 1 },
      { playerId: "B", number: 2 },
      { playerId: "C", number: 3 },
    ]);
    expect(points(r)).toEqual({ A: 1, B: 2, C: 3 });
  });

  it("one tied pair scores 0; uniques score normally", () => {
    const r = scoreTurn([
      { playerId: "A", number: 4 },
      { playerId: "B", number: 4 },
      { playerId: "C", number: 3 },
    ]);
    expect(points(r)).toEqual({ A: 0, B: 0, C: 3 });
  });

  it("two pairs all score 0", () => {
    const r = scoreTurn([
      { playerId: "A", number: 1 },
      { playerId: "B", number: 1 },
      { playerId: "C", number: 2 },
      { playerId: "D", number: 2 },
    ]);
    expect(points(r)).toEqual({ A: 0, B: 0, C: 0, D: 0 });
  });

  it("everyone the same scores 0", () => {
    const r = scoreTurn([
      { playerId: "A", number: 5 },
      { playerId: "B", number: 5 },
      { playerId: "C", number: 5 },
    ]);
    expect(points(r)).toEqual({ A: 0, B: 0, C: 0 });
  });

  it("single 0 cancels all other players", () => {
    const r = scoreTurn([
      { playerId: "A", number: 0 },
      { playerId: "B", number: 5 },
      { playerId: "C", number: 3 },
    ]);
    expect(points(r)).toEqual({ A: 0, B: 0, C: 0 });
  });

  it("multiple 0s suppress the cancel — others score normally", () => {
    const r = scoreTurn([
      { playerId: "A", number: 0 },
      { playerId: "B", number: 0 },
      { playerId: "C", number: 5 },
      { playerId: "D", number: 3 },
    ]);
    expect(points(r)).toEqual({ A: 0, B: 0, C: 5, D: 3 });
  });

  it("single 0 + ties: zero still cancels everyone (ties already 0 anyway)", () => {
    const r = scoreTurn([
      { playerId: "A", number: 0 },
      { playerId: "B", number: 3 },
      { playerId: "C", number: 3 },
    ]);
    expect(points(r)).toEqual({ A: 0, B: 0, C: 0 });
  });

  it("multi-zero with non-zero tie: zeros suppressed, ties still score 0", () => {
    const r = scoreTurn([
      { playerId: "A", number: 0 },
      { playerId: "B", number: 0 },
      { playerId: "C", number: 4 },
      { playerId: "D", number: 4 },
      { playerId: "E", number: 5 },
    ]);
    expect(points(r)).toEqual({ A: 0, B: 0, C: 0, D: 0, E: 5 });
  });
});

describe("scoreTurn — power-ups", () => {
  it("Double multiplies all scoring lines x2", () => {
    const r = scoreTurn([
      { playerId: "A", number: 5, powerUp: "double" },
      { playerId: "B", number: 4 },
      { playerId: "C", number: 3 },
    ]);
    expect(points(r)).toEqual({ A: 10, B: 8, C: 6 });
  });

  it("Double doesn't double a 0 (already 0)", () => {
    const r = scoreTurn([
      { playerId: "A", number: 4, powerUp: "double" },
      { playerId: "B", number: 4 },
      { playerId: "C", number: 3 },
    ]);
    expect(points(r)).toEqual({ A: 0, B: 0, C: 6 });
  });

  it("Shield lets the user score despite tie; tied opponents still score 0", () => {
    const r = scoreTurn([
      { playerId: "A", number: 5, powerUp: "shield" },
      { playerId: "B", number: 5 },
      { playerId: "C", number: 3 },
    ]);
    expect(points(r)).toEqual({ A: 5, B: 0, C: 3 });
  });

  it("Negate Zero suppresses a single 0's cancel — others score normally", () => {
    const r = scoreTurn([
      { playerId: "A", number: 0, powerUp: "negate_zero" },
      { playerId: "B", number: 5 },
      { playerId: "C", number: 3 },
    ]);
    expect(points(r)).toEqual({ A: 0, B: 5, C: 3 });
  });

  it("Negate Zero from a non-zero player still suppresses zeros", () => {
    const r = scoreTurn([
      { playerId: "A", number: 5, powerUp: "negate_zero" },
      { playerId: "B", number: 0 },
      { playerId: "C", number: 3 },
    ]);
    expect(points(r)).toEqual({ A: 5, B: 0, C: 3 });
  });

  it("Plus Two bumps the user's face value by 2; +2 collides with another player's matching number", () => {
    const r = scoreTurn([
      { playerId: "A", number: 4, powerUp: "plus_two" }, // face becomes 6
      { playerId: "B", number: 6 },
      { playerId: "C", number: 3 },
    ]);
    expect(points(r)).toEqual({ A: 0, B: 0, C: 3 });
  });

  it("Plus Two on a 0: the user plays a 2 and no longer cancels", () => {
    const r = scoreTurn([
      { playerId: "A", number: 0, powerUp: "plus_two" }, // face becomes 2
      { playerId: "B", number: 5 },
      { playerId: "C", number: 3 },
    ]);
    expect(points(r)).toEqual({ A: 2, B: 5, C: 3 });
  });

  it("Plus Two on a 0 ties when another player plays a 2", () => {
    const r = scoreTurn([
      { playerId: "A", number: 0, powerUp: "plus_two" }, // face becomes 2
      { playerId: "B", number: 2 },
      { playerId: "C", number: 5 },
    ]);
    expect(points(r)).toEqual({ A: 0, B: 0, C: 5 });
  });

  it("Plus Two on a 3: the user plays a 5", () => {
    const r = scoreTurn([
      { playerId: "A", number: 3, powerUp: "plus_two" }, // face becomes 5
      { playerId: "B", number: 4 },
      { playerId: "C", number: 1 },
    ]);
    expect(points(r)).toEqual({ A: 5, B: 4, C: 1 });
  });

  it("Plus Two does not protect the user from a true 0 cancel by another player", () => {
    const r = scoreTurn([
      { playerId: "A", number: 4, powerUp: "plus_two" }, // face becomes 6
      { playerId: "B", number: 0 },
      { playerId: "C", number: 5 },
    ]);
    expect(points(r)).toEqual({ A: 0, B: 0, C: 0 });
  });

  it("Free Three adds +3 when no other player played a 3", () => {
    const r = scoreTurn([
      { playerId: "A", number: 4, powerUp: "free_three" },
      { playerId: "B", number: 5 },
    ]);
    expect(points(r)).toEqual({ A: 7, B: 5 });
  });

  it("Free Three's virtual 3 cancels with another player's 3 (both lose)", () => {
    const r = scoreTurn([
      { playerId: "A", number: 5, powerUp: "free_three" },
      { playerId: "B", number: 3 },
      { playerId: "C", number: 4 },
    ]);
    // A plays 5 (unique → 5), but their phantom 3 ties with B's 3 → B is cancelled, A's +3 bonus lost.
    expect(points(r)).toEqual({ A: 5, B: 0, C: 4 });
  });

  it("Free Three is suppressed when cancelled by a 0", () => {
    const r = scoreTurn([
      { playerId: "A", number: 5, powerUp: "free_three" },
      { playerId: "B", number: 0 },
      { playerId: "C", number: 4 },
    ]);
    expect(points(r)).toEqual({ A: 0, B: 0, C: 0 });
  });

  it("Negate inverts all scoring lines", () => {
    const r = scoreTurn([
      { playerId: "A", number: 4, powerUp: "negate" },
      { playerId: "B", number: 5 },
      { playerId: "C", number: 3 },
    ]);
    expect(points(r)).toEqual({ A: -4, B: -5, C: -3 });
  });

  it("Steal Two subtracts 2 from each scoring opponent (>0 only)", () => {
    const r = scoreTurn([
      { playerId: "A", number: 1, powerUp: "steal_two" },
      { playerId: "B", number: 5 },
      { playerId: "C", number: 3 },
      { playerId: "D", number: 3 },
    ]);
    expect(points(r)).toEqual({ A: 1, B: 3, C: 0, D: 0 });
  });

  it("Mute zeros out a target's card and removes its cancel effect", () => {
    const r = scoreTurn([
      { playerId: "A", number: 5, powerUp: "mute", powerUpTarget: "B" },
      { playerId: "B", number: 0 },
      { playerId: "C", number: 3 },
    ]);
    expect(points(r)).toEqual({ A: 5, B: 0, C: 3 });
  });

  it("Mute a tied opponent removes the tie", () => {
    const r = scoreTurn([
      { playerId: "A", number: 3, powerUp: "mute", powerUpTarget: "B" },
      { playerId: "B", number: 3 },
      { playerId: "C", number: 5 },
    ]);
    expect(points(r)).toEqual({ A: 3, B: 0, C: 5 });
  });

  it("Peek has no scoring effect (info value is realized via the re-pick flow)", () => {
    const r = scoreTurn([
      { playerId: "A", number: 4, powerUp: "peek", powerUpTarget: "B" },
      { playerId: "B", number: 5 },
      { playerId: "C", number: 3 },
    ]);
    expect(points(r)).toEqual({ A: 4, B: 5, C: 3 });
  });

  it("Trade rotates scores one seat: A→B, B→C, C→A", () => {
    const r = scoreTurn([
      { playerId: "A", number: 5, powerUp: "trade" },
      { playerId: "B", number: 3 },
      { playerId: "C", number: 2 },
    ]);
    // Pre-trade: A=5, B=3, C=2. Each seat receives previous seat's score:
    // A gets C's 2; B gets A's 5; C gets B's 3.
    expect(points(r)).toEqual({ A: 2, B: 5, C: 3 });
  });

  it("Trade with cancellation: zero deltas still rotate", () => {
    const r = scoreTurn([
      { playerId: "A", number: 4, powerUp: "trade" },
      { playerId: "B", number: 4 },
      { playerId: "C", number: 5 },
    ]);
    // A=0 (tied), B=0 (tied), C=5. Rotate: A gets C's 5, B gets A's 0, C gets B's 0.
    expect(points(r)).toEqual({ A: 5, B: 0, C: 0 });
  });

  it("Equalize sets all positive scorers to the average; ties/cancels untouched", () => {
    const r = scoreTurn([
      { playerId: "A", number: 5, powerUp: "equalize" },
      { playerId: "B", number: 3 },
      { playerId: "C", number: 1 },
    ]);
    // 5 + 3 + 1 = 9 / 3 = 3 (floor). All three become 3.
    expect(points(r)).toEqual({ A: 3, B: 3, C: 3 });
  });

  it("Equalize ignores zero scorers (tied/cancelled)", () => {
    const r = scoreTurn([
      { playerId: "A", number: 5, powerUp: "equalize" },
      { playerId: "B", number: 5 },
      { playerId: "C", number: 1 },
      { playerId: "D", number: 4 },
    ]);
    // A and B tied (both 0). C=1, D=4. Avg of positives = (1+4)/2 = 2.
    expect(points(r)).toEqual({ A: 0, B: 0, C: 2, D: 2 });
  });

  it("Equalize with only one positive scorer is a no-op", () => {
    const r = scoreTurn([
      { playerId: "A", number: 5, powerUp: "equalize" },
      { playerId: "B", number: 5 },
      { playerId: "C", number: 1 },
    ]);
    // A and B tied (0). C=1 unique. Only one positive → no averaging.
    expect(points(r)).toEqual({ A: 0, B: 0, C: 1 });
  });
});

describe("scoreTurn — combinations", () => {
  it("Double × Negate cancels out (negative doubled)", () => {
    // Only one power-up plays per turn, so this is impossible — sanity check Negate alone.
    const r = scoreTurn([
      { playerId: "A", number: 4, powerUp: "negate" },
      { playerId: "B", number: 5 },
    ]);
    expect(points(r)).toEqual({ A: -4, B: -5 });
  });

  it("Negate Zero + multi-zero: same as multi-zero alone", () => {
    const r = scoreTurn([
      { playerId: "A", number: 0, powerUp: "negate_zero" },
      { playerId: "B", number: 0 },
      { playerId: "C", number: 3 },
    ]);
    // Negate Zero suppresses cancel (already suppressed by multi-zero anyway). Zeros tied → 0.
    expect(points(r)).toEqual({ A: 0, B: 0, C: 3 });
  });

  it("Plus Five Self + Shield: shielded user scores adjusted value despite tie", () => {
    // Only one power-up active; sanity check Shield with PlusFive scenarios separately.
    const r = scoreTurn([
      { playerId: "A", number: 3, powerUp: "shield" },
      { playerId: "B", number: 3 },
    ]);
    expect(points(r)).toEqual({ A: 3, B: 0 });
  });

  it("Steal Two doesn't go below 0 from negative — applied only to >0 scorers", () => {
    const r = scoreTurn([
      { playerId: "A", number: 5, powerUp: "steal_two" },
      { playerId: "B", number: 5 },
      { playerId: "C", number: 4 },
    ]);
    // A and B tied → 0; A is the user (no self-steal), B is opponent with delta=0 (not >0). C is unique 4 → -2 = 2.
    expect(points(r)).toEqual({ A: 0, B: 0, C: 2 });
  });

  it("Mute with single zero: the zero still cancels (mute targets a different player)", () => {
    const r = scoreTurn([
      { playerId: "A", number: 5, powerUp: "mute", powerUpTarget: "C" },
      { playerId: "B", number: 0 },
      { playerId: "C", number: 4 },
    ]);
    // Mute targets C (4 → 0, non-cancel). B's 0 still cancels because mute didn't touch it.
    expect(points(r)).toEqual({ A: 0, B: 0, C: 0 });
  });

  it("Mute the cancelling zero: cancel suppressed, others score normally", () => {
    const r = scoreTurn([
      { playerId: "A", number: 5, powerUp: "mute", powerUpTarget: "B" },
      { playerId: "B", number: 0 },
      { playerId: "C", number: 4 },
    ]);
    expect(points(r)).toEqual({ A: 5, B: 0, C: 4 });
  });
});
