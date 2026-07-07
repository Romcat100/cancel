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

  it("Tie Die lets the user score despite tie; tied opponents still score 0", () => {
    const r = scoreTurn([
      { playerId: "A", number: 5, powerUp: "tie_die" },
      { playerId: "B", number: 5 },
      { playerId: "C", number: 3 },
    ]);
    expect(points(r)).toEqual({ A: 5, B: 0, C: 3 });
  });

  it("Tie Die on a 0 still cancels everyone when another player also plays 0", () => {
    // Without Tie Die the two 0s would suppress each other and C would score 5
    // (see 'multiple 0s suppress the cancel'). Tie Die keeps A's 0 as the canceller.
    const r = scoreTurn([
      { playerId: "A", number: 0, powerUp: "tie_die" },
      { playerId: "B", number: 0 },
      { playerId: "C", number: 5 },
    ]);
    expect(points(r)).toEqual({ A: 0, B: 0, C: 0 });
  });

  it("Tie Die on a 0 cancels through multiple other 0s", () => {
    const r = scoreTurn([
      { playerId: "A", number: 0, powerUp: "tie_die" },
      { playerId: "B", number: 0 },
      { playerId: "C", number: 0 },
      { playerId: "D", number: 7 },
    ]);
    expect(points(r)).toEqual({ A: 0, B: 0, C: 0, D: 0 });
  });

  it("Tie Die on a non-zero does NOT protect from another player's single 0 cancel", () => {
    const r = scoreTurn([
      { playerId: "A", number: 5, powerUp: "tie_die" },
      { playerId: "B", number: 0 },
      { playerId: "C", number: 3 },
    ]);
    expect(points(r)).toEqual({ A: 0, B: 0, C: 0 });
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

  it("Free Three's virtual 3 also self-cancels with the user's own real 3", () => {
    const r = scoreTurn([
      { playerId: "A", number: 3, powerUp: "free_three" },
      { playerId: "B", number: 5 },
      { playerId: "C", number: 4 },
    ]);
    // A's real 3 collides with their phantom 3 — A's card is cancelled and the +3 bonus is lost.
    expect(points(r)).toEqual({ A: 0, B: 5, C: 4 });
  });

  it("Free Three on a 1 still scores the bonus when nobody plays a 3", () => {
    const r = scoreTurn([
      { playerId: "A", number: 1, powerUp: "free_three" },
      { playerId: "B", number: 5 },
      { playerId: "C", number: 4 },
    ]);
    expect(points(r)).toEqual({ A: 4, B: 5, C: 4 });
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
      { playerId: "A", number: 4, powerUp: "make_negative" },
      { playerId: "B", number: 5 },
      { playerId: "C", number: 3 },
    ]);
    expect(points(r)).toEqual({ A: -4, B: -5, C: -3 });
  });

  it("Minus Two lowers every player's face value by 2 (Universal), shifting ties and scores", () => {
    const r = scoreTurn([
      { playerId: "A", number: 1, powerUp: "minus_two" }, // 1 → -1
      { playerId: "B", number: 5 }, // 5 → 3
      { playerId: "C", number: 3 }, // 3 → 1
      { playerId: "D", number: 3 }, // 3 → 1 (ties C on 1)
    ]);
    expect(points(r)).toEqual({ A: -1, B: 3, C: 0, D: 0 });
  });

  it("Minus Two turns a played 2 into a 0 that cancels everyone", () => {
    const r = scoreTurn([
      { playerId: "A", number: 2, powerUp: "minus_two" }, // 2 → 0, now cancels
      { playerId: "B", number: 5 }, // 5 → 3
      { playerId: "C", number: 4 }, // 4 → 2
    ]);
    expect(points(r)).toEqual({ A: 0, B: 0, C: 0 });
  });

  it("Minus Two drops a true 0 to -2 so it no longer cancels", () => {
    const r = scoreTurn([
      { playerId: "A", number: 0, powerUp: "minus_two" }, // 0 → -2, no cancel
      { playerId: "B", number: 5 }, // 5 → 3
      { playerId: "C", number: 4 }, // 4 → 2
    ]);
    expect(points(r)).toEqual({ A: -2, B: 3, C: 2 });
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

  it("Slide rotates scores one seat: A→B, B→C, C→A", () => {
    const r = scoreTurn([
      { playerId: "A", number: 5, powerUp: "slide" },
      { playerId: "B", number: 3 },
      { playerId: "C", number: 2 },
    ]);
    // Pre-slide: A=5, B=3, C=2. Each seat receives previous seat's score:
    // A gets C's 2; B gets A's 5; C gets B's 3.
    expect(points(r)).toEqual({ A: 2, B: 5, C: 3 });
  });

  it("Slide with cancellation: zero deltas still rotate", () => {
    const r = scoreTurn([
      { playerId: "A", number: 4, powerUp: "slide" },
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

  it("Flip flips face values; a max-card flips to 0 and now cancels everyone", () => {
    // 3 players → max card = 4. B's 4 flips to 0, which cancels the whole turn.
    const r = scoreTurn([
      { playerId: "A", number: 0, powerUp: "flip" },
      { playerId: "B", number: 4 },
      { playerId: "C", number: 2 },
    ]);
    expect(points(r)).toEqual({ A: 0, B: 0, C: 0 });
  });

  it("Flip with no flipped 0s — every face is just inverted and scored", () => {
    // 3 players → max = 4. Plays 1, 2, 3 → flipped 3, 2, 1.
    const r = scoreTurn([
      { playerId: "A", number: 1, powerUp: "flip" },
      { playerId: "B", number: 2 },
      { playerId: "C", number: 3 },
    ]);
    expect(points(r)).toEqual({ A: 3, B: 2, C: 1 });
  });

  it("Flip can create ties on flipped values", () => {
    // 3 players → max = 4. A=1→3, B=3→1, C=1→3 → A and C now tie on 3.
    const r = scoreTurn([
      { playerId: "A", number: 1, powerUp: "flip" },
      { playerId: "B", number: 3 },
      { playerId: "C", number: 1 },
    ]);
    expect(points(r)).toEqual({ A: 0, B: 1, C: 0 });
  });

  it("Flip on a custom set mirrors positionally, not arithmetically", () => {
    // Game numbers {0,3,8,9}. Positional mirror: 0↔9, 3↔8. So A's 3 → 8, B's 8 → 3,
    // C's 9 → 0 (the lone 0 now cancels everyone). Arithmetic (max-n) would give different
    // off-set values, so this proves positional behavior.
    const r = scoreTurn(
      [
        { playerId: "A", number: 3, powerUp: "flip" },
        { playerId: "B", number: 8 },
        { playerId: "C", number: 9 },
      ],
      [0, 3, 8, 9],
    );
    expect(points(r)).toEqual({ A: 0, B: 0, C: 0 });
  });

  it("Flip on a custom set with no flipped 0 just scores the mirrored faces", () => {
    // Game numbers {0,3,8,9}. A's 8 → 3, B's 3 → 8, C's 0 → 9. All unique.
    const r = scoreTurn(
      [
        { playerId: "A", number: 8, powerUp: "flip" },
        { playerId: "B", number: 3 },
        { playerId: "C", number: 0 },
      ],
      [0, 3, 8, 9],
    );
    expect(points(r)).toEqual({ A: 3, B: 8, C: 9 });
  });

  it("Drain shifts face values: picker +1, target -1, and the new values score", () => {
    const r = scoreTurn([
      { playerId: "A", number: 1, powerUp: "drain", powerUpTarget: "B" },
      { playerId: "B", number: 5 },
      { playerId: "C", number: 3 },
    ]);
    // A's 1 → 2, B's 5 → 4, C's 3 stays. All unique faces.
    expect(points(r)).toEqual({ A: 2, B: 4, C: 3 });
  });

  it("Drain on a target's 1 makes it a 0, which cancels everyone (including the picker)", () => {
    const r = scoreTurn([
      { playerId: "A", number: 5, powerUp: "drain", powerUpTarget: "B" },
      { playerId: "B", number: 1 },
      { playerId: "C", number: 3 },
    ]);
    // A's 5 → 6, B's 1 → 0 (lone canceller), C's 3 stays. B's 0 cancels A and C.
    expect(points(r)).toEqual({ A: 0, B: 0, C: 0 });
  });

  it("Drain shifts the picker's and target's faces into a tie, zeroing both", () => {
    const r = scoreTurn([
      { playerId: "A", number: 2, powerUp: "drain", powerUpTarget: "B" },
      { playerId: "B", number: 4 },
      { playerId: "C", number: 5 },
    ]);
    // A's 2 → 3, B's 4 → 3 → A and B tie on face 3. C unique on 5.
    expect(points(r)).toEqual({ A: 0, B: 0, C: 5 });
  });

  it("Drain on a target's 0 takes it to -1, removing the cancel and scoring -1", () => {
    const r = scoreTurn([
      { playerId: "A", number: 3, powerUp: "drain", powerUpTarget: "B" },
      { playerId: "B", number: 0 },
      { playerId: "C", number: 5 },
    ]);
    // A's 3 → 4, B's 0 → -1 (no longer cancels), C's 5 stays. All unique.
    expect(points(r)).toEqual({ A: 4, B: -1, C: 5 });
  });
});

describe("scoreTurn — Jinx", () => {
  it("Jinx pays the user's card value +2 for matching one opponent; the opponent still wipes", () => {
    const r = scoreTurn([
      { playerId: "A", number: 5, powerUp: "jinx" },
      { playerId: "B", number: 5 },
      { playerId: "C", number: 3 },
    ]);
    // A matches B on 5: scores 5 + 2 = 7. B is tied → wiped. C unique.
    expect(points(r)).toEqual({ A: 7, B: 0, C: 3 });
  });

  it("Jinx pays +2 for each matching opponent", () => {
    const r = scoreTurn([
      { playerId: "A", number: 5, powerUp: "jinx" },
      { playerId: "B", number: 5 },
      { playerId: "C", number: 5 },
      { playerId: "D", number: 2 },
    ]);
    // A matches two 5s: 5 + 2 + 2 = 9. B and C tied → wiped. D unique.
    expect(points(r)).toEqual({ A: 9, B: 0, C: 0, D: 2 });
  });

  it("Jinx with no match scores the card normally (no penalty)", () => {
    const r = scoreTurn([
      { playerId: "A", number: 5, powerUp: "jinx" },
      { playerId: "B", number: 4 },
      { playerId: "C", number: 3 },
    ]);
    expect(points(r)).toEqual({ A: 5, B: 4, C: 3 });
  });

  it("Jinx does not protect from another player's lone 0, even when the user matched someone", () => {
    const r = scoreTurn([
      { playerId: "A", number: 5, powerUp: "jinx" },
      { playerId: "B", number: 5 },
      { playerId: "C", number: 0 },
    ]);
    // A matched B on 5, but C's lone 0 cancels the whole board (mirrors Tie Die).
    expect(points(r)).toEqual({ A: 0, B: 0, C: 0 });
  });

  it("Jinx on a 0 cashes in +2 for a matching 0 instead of mutual suppression", () => {
    const r = scoreTurn([
      { playerId: "A", number: 0, powerUp: "jinx" },
      { playerId: "B", number: 0 },
      { playerId: "C", number: 5 },
    ]);
    // Two 0s normally suppress each other (C would score 5). A's Jinx matches B's 0:
    // scoreValue 0 + 2 = 2. B suppressed → 0. C still scores its unique 5.
    expect(points(r)).toEqual({ A: 2, B: 0, C: 5 });
  });

  it("Jinx on a 0 scales +2 per matching 0", () => {
    const r = scoreTurn([
      { playerId: "A", number: 0, powerUp: "jinx" },
      { playerId: "B", number: 0 },
      { playerId: "C", number: 0 },
      { playerId: "D", number: 7 },
    ]);
    // A matches two other 0s: 0 + 4 = 4. B and C suppressed → 0. D unique.
    expect(points(r)).toEqual({ A: 4, B: 0, C: 0, D: 7 });
  });

  it("Jinx as the lone 0 just cancels everyone (no match, no bonus)", () => {
    const r = scoreTurn([
      { playerId: "A", number: 0, powerUp: "jinx" },
      { playerId: "B", number: 5 },
      { playerId: "C", number: 3 },
    ]);
    expect(points(r)).toEqual({ A: 0, B: 0, C: 0 });
  });
});

describe("scoreTurn — combinations", () => {
  it("Double × Negate cancels out (negative doubled)", () => {
    // Only one power-up plays per turn, so this is impossible — sanity check Negate alone.
    const r = scoreTurn([
      { playerId: "A", number: 4, powerUp: "make_negative" },
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

  it("Plus Five Self + Tie Die: protected user scores adjusted value despite tie", () => {
    // Only one power-up active; sanity check Tie Die with PlusFive scenarios separately.
    const r = scoreTurn([
      { playerId: "A", number: 3, powerUp: "tie_die" },
      { playerId: "B", number: 3 },
    ]);
    expect(points(r)).toEqual({ A: 3, B: 0 });
  });

  it("Minus Two also shifts the picker's own card (Universal, includes the user)", () => {
    const r = scoreTurn([
      { playerId: "A", number: 5, powerUp: "minus_two" }, // 5 → 3 (ties B)
      { playerId: "B", number: 5 }, // 5 → 3
      { playerId: "C", number: 4 }, // 4 → 2
    ]);
    // A and B both shift to 3 and tie → 0. C shifts to a unique 2.
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

  it("Nothingburger is a true no-op — scores exactly like no power-up", () => {
    const withPower = scoreTurn([
      { playerId: "A", number: 4, powerUp: "nothingburger" },
      { playerId: "B", number: 5 },
      { playerId: "C", number: 3 },
    ]);
    const withoutPower = scoreTurn([
      { playerId: "A", number: 4 },
      { playerId: "B", number: 5 },
      { playerId: "C", number: 3 },
    ]);
    expect(points(withPower)).toEqual({ A: 4, B: 5, C: 3 });
    expect(points(withPower)).toEqual(points(withoutPower));
  });

  it("Nothingburger does not interfere with another player's 0 cancel", () => {
    const r = scoreTurn([
      { playerId: "A", number: 5, powerUp: "nothingburger" },
      { playerId: "B", number: 0 },
      { playerId: "C", number: 3 },
    ]);
    expect(points(r)).toEqual({ A: 0, B: 0, C: 0 });
  });
});

describe("scoreTurn — Sacrifice", () => {
  it("picker's card scores 0 and every other player loses the picker's face value", () => {
    const r = scoreTurn([
      { playerId: "A", number: 5, powerUp: "sacrifice" },
      { playerId: "B", number: 3 },
      { playerId: "C", number: 4 },
    ]);
    expect(points(r)).toEqual({ A: 0, B: -2, C: -1 });
  });

  it("fizzles when the picker's card is cancelled by another player's 0", () => {
    const r = scoreTurn([
      { playerId: "A", number: 5, powerUp: "sacrifice" },
      { playerId: "B", number: 0 },
      { playerId: "C", number: 3 },
    ]);
    // B's 0 cancels everyone to 0; the sacrifice is nullified, so no penalty lands.
    expect(points(r)).toEqual({ A: 0, B: 0, C: 0 });
  });

  it("fizzles when the picker's card is tied out", () => {
    const r = scoreTurn([
      { playerId: "A", number: 5, powerUp: "sacrifice" },
      { playerId: "B", number: 5 },
      { playerId: "C", number: 3 },
    ]);
    // A and B tie on 5 → both wipe to 0; the sacrifice is nullified. C keeps its unique 3.
    expect(points(r)).toEqual({ A: 0, B: 0, C: 3 });
  });

  it("still lands when an uninvolved tie or suppressed zeros leave the picker's card live", () => {
    const r = scoreTurn([
      { playerId: "A", number: 5, powerUp: "sacrifice" },
      { playerId: "B", number: 3 },
      { playerId: "C", number: 3 },
    ]);
    // B and C tie out on 3, but A's 5 is unique and live, so the sacrifice deducts 5.
    expect(points(r)).toEqual({ A: 0, B: -5, C: -5 });
  });

  it("sacrificing a 0 is a no-op penalty (lone 0 still cancels via standard rules)", () => {
    const r = scoreTurn([
      { playerId: "A", number: 0, powerUp: "sacrifice" },
      { playerId: "B", number: 3 },
      { playerId: "C", number: 4 },
    ]);
    // A's 0 cancels everyone to 0; Sacrifice's penalty is 0 so no further deduction.
    expect(points(r)).toEqual({ A: 0, B: 0, C: 0 });
  });

  it("works in a 2-player game", () => {
    const r = scoreTurn([
      { playerId: "A", number: 4, powerUp: "sacrifice" },
      { playerId: "B", number: 3 },
    ]);
    expect(points(r)).toEqual({ A: 0, B: -1 });
  });

  it("both score 0 when the picker's sacrifice card ties the only opponent (2-player)", () => {
    const r = scoreTurn([
      { playerId: "A", number: 4, powerUp: "sacrifice" },
      { playerId: "B", number: 4 },
    ]);
    // Tie on 4 wipes both to 0; the sacrifice fizzles, so neither loses points.
    expect(points(r)).toEqual({ A: 0, B: 0 });
  });
});

describe("scoreTurn — round powers", () => {
  it("pure_tone is identical to no power (uniques, a tie, a lone-0 cancel)", () => {
    const plays = [
      { playerId: "A", number: 4 },
      { playerId: "B", number: 4 },
      { playerId: "C", number: 3 },
    ];
    expect(points(scoreTurn(plays, undefined, "pure_tone"))).toEqual(points(scoreTurn(plays)));
    const cancelPlays = [
      { playerId: "A", number: 0 },
      { playerId: "B", number: 5 },
      { playerId: "C", number: 3 },
    ];
    expect(points(scoreTurn(cancelPlays, undefined, "pure_tone"))).toEqual(
      points(scoreTurn(cancelPlays)),
    );
  });

  it("harmony: a tied pair each score double their value, uniques unaffected", () => {
    const r = scoreTurn(
      [
        { playerId: "A", number: 4 },
        { playerId: "B", number: 4 },
        { playerId: "C", number: 3 },
      ],
      undefined,
      "harmony",
    );
    // The tied 4s each score 4*2 = 8 instead of being wiped to 0.
    expect(points(r)).toEqual({ A: 8, B: 8, C: 3 });
  });

  it("harmony: a three-way tie each score double", () => {
    const r = scoreTurn(
      [
        { playerId: "A", number: 5 },
        { playerId: "B", number: 5 },
        { playerId: "C", number: 5 },
      ],
      undefined,
      "harmony",
    );
    expect(points(r)).toEqual({ A: 10, B: 10, C: 10 });
  });

  it("harmony: matching zeros score 0 (0 doubled) and still don't cancel", () => {
    const r = scoreTurn(
      [
        { playerId: "A", number: 0 },
        { playerId: "B", number: 0 },
        { playerId: "C", number: 5 },
      ],
      undefined,
      "harmony",
    );
    expect(points(r)).toEqual({ A: 0, B: 0, C: 5 });
  });

  it("harmony does not rescue cards cancelled by a lone 0", () => {
    const r = scoreTurn(
      [
        { playerId: "A", number: 0 },
        { playerId: "B", number: 3 },
        { playerId: "C", number: 3 },
      ],
      undefined,
      "harmony",
    );
    // B and C tie, but the lone 0 cancels the whole board before ties matter.
    expect(points(r)).toEqual({ A: 0, B: 0, C: 0 });
  });

  it("harmony's doubled-tie survivors carry notes that don't read as cancelled", () => {
    const r = scoreTurn(
      [
        { playerId: "A", number: 4 },
        { playerId: "B", number: 4 },
        { playerId: "C", number: 3 },
      ],
      undefined,
      "harmony",
    );
    // The doubled tie survivors (delta > 0) must not carry notes revealTreatment
    // would read as a cancelled/tied pair, or they'd render as CANCELLED not glowing.
    for (const l of r.lines.filter((x) => x.delta > 0)) {
      for (const n of l.notes) {
        expect(n.startsWith("Tied")).toBe(false);
        expect(n.includes("Cancelled by 0")).toBe(false);
        expect(n.includes("cancel suppressed")).toBe(false);
      }
    }
  });

  it("amplify doubles unique scores; tied and cancelled stay 0", () => {
    const r = scoreTurn(
      [
        { playerId: "A", number: 4 },
        { playerId: "B", number: 4 },
        { playerId: "C", number: 3 },
      ],
      undefined,
      "amplify",
    );
    expect(points(r)).toEqual({ A: 0, B: 0, C: 6 });
  });

  it("amplify doubles negative deltas too", () => {
    const r = scoreTurn(
      [
        { playerId: "A", number: 4, powerUp: "sacrifice" },
        { playerId: "B", number: 3 },
        { playerId: "C", number: 5 },
      ],
      undefined,
      "amplify",
    );
    // Sacrifice lands: B (3-4=-1) and C (5-4=1), then amplify doubles both.
    expect(points(r)).toEqual({ A: 0, B: -2, C: 2 });
  });

  it("static: a lone 0 no longer cancels; everyone scores normally", () => {
    const r = scoreTurn(
      [
        { playerId: "A", number: 0 },
        { playerId: "B", number: 5 },
        { playerId: "C", number: 3 },
      ],
      undefined,
      "static",
    );
    expect(points(r)).toEqual({ A: 0, B: 5, C: 3 });
    const zeroLine = r.lines.find((l) => l.playerId === "A")!;
    expect(zeroLine.notes.join(" ")).toContain("Static");
  });

  it("ultraviolet: every face rises 2; scores and ties use the raised faces", () => {
    const flat = scoreTurn(
      [
        { playerId: "A", number: 4 },
        { playerId: "B", number: 5 },
        { playerId: "C", number: 3 },
      ],
      undefined,
      "ultraviolet",
    );
    expect(points(flat)).toEqual({ A: 6, B: 7, C: 5 });

    // A 0 becomes a 2 (no longer cancels), so everyone scores their raised face.
    const zero = scoreTurn(
      [
        { playerId: "A", number: 0 },
        { playerId: "B", number: 5 },
        { playerId: "C", number: 3 },
      ],
      undefined,
      "ultraviolet",
    );
    expect(points(zero)).toEqual({ A: 2, B: 7, C: 5 });
  });

  it("ultraviolet: a raised tie still cancels (both play the same face)", () => {
    const tied = scoreTurn(
      [
        { playerId: "A", number: 4 },
        { playerId: "B", number: 4 },
        { playerId: "C", number: 3 },
      ],
      undefined,
      "ultraviolet",
    );
    // Both 4s become 6 and tie out; C's 3 becomes a unique 5.
    expect(points(tied)).toEqual({ A: 0, B: 0, C: 5 });
  });

  it("dormant composition: per-play double + amplify stack to x4", () => {
    const r = scoreTurn(
      [
        { playerId: "A", number: 4, powerUp: "double" },
        { playerId: "B", number: 3 },
        { playerId: "C", number: 5 },
      ],
      undefined,
      "amplify",
    );
    expect(points(r)).toEqual({ A: 16, B: 12, C: 20 });
  });

  it("dormant composition: tie_die user keeps card value under harmony, others double", () => {
    const r = scoreTurn(
      [
        { playerId: "A", number: 4, powerUp: "tie_die" },
        { playerId: "B", number: 4 },
        { playerId: "C", number: 3 },
      ],
      undefined,
      "harmony",
    );
    // Tie Die pays A its scoreValue (4); B's tied 4 doubles to 8 under Harmony.
    expect(points(r)).toEqual({ A: 4, B: 8, C: 3 });
  });

  it("dormant composition: per-play negate_zero + static is idempotent", () => {
    const r = scoreTurn(
      [
        { playerId: "A", number: 0, powerUp: "negate_zero" },
        { playerId: "B", number: 5 },
        { playerId: "C", number: 3 },
      ],
      undefined,
      "static",
    );
    expect(points(r)).toEqual({ A: 0, B: 5, C: 3 });
  });

  it("limiter: the highest card that scored is clipped to 0", () => {
    const r = scoreTurn(
      [
        { playerId: "A", number: 5 },
        { playerId: "B", number: 3 },
        { playerId: "C", number: 1 },
      ],
      undefined,
      "limiter",
    );
    expect(points(r)).toEqual({ A: 0, B: 3, C: 1 });
    const aNotes = r.lines.find((l) => l.playerId === "A")!.notes;
    expect(aNotes).toContain("Limiter: 5 clipped to 0");
    // The clipped line must not read as a tie/cancel to revealTreatment.
    expect(aNotes.some((n) => n.startsWith("Tied") || n.includes("Cancelled by 0"))).toBe(false);
  });

  it("limiter: a tie for the top wipes itself first; the clip falls on the next survivor", () => {
    const r = scoreTurn(
      [
        { playerId: "A", number: 6 },
        { playerId: "B", number: 6 },
        { playerId: "C", number: 4 },
        { playerId: "D", number: 2 },
      ],
      undefined,
      "limiter",
    );
    // The 6s tie out on their own; the highest SURVIVOR is the 4, which gets clipped.
    expect(points(r)).toEqual({ A: 0, B: 0, C: 0, D: 2 });
    expect(r.lines.find((l) => l.playerId === "C")!.notes).toContain("Limiter: 4 clipped to 0");
  });

  it("limiter: a lone 0 wipes the board and leaves nothing to clip", () => {
    const r = scoreTurn(
      [
        { playerId: "A", number: 0 },
        { playerId: "B", number: 5 },
        { playerId: "C", number: 3 },
      ],
      undefined,
      "limiter",
    );
    expect(points(r)).toEqual({ A: 0, B: 0, C: 0 });
    expect(r.lines.every((l) => !l.notes.some((n) => n.startsWith("Limiter")))).toBe(true);
  });

  it("limiter: no positive deltas at all (everyone tied) is a no-op", () => {
    const r = scoreTurn(
      [
        { playerId: "A", number: 5 },
        { playerId: "B", number: 5 },
        { playerId: "C", number: 5 },
      ],
      undefined,
      "limiter",
    );
    expect(points(r)).toEqual({ A: 0, B: 0, C: 0 });
    expect(r.lines.every((l) => !l.notes.some((n) => n.startsWith("Limiter")))).toBe(true);
  });

  it("dormant composition: limiter clips the peak face after a per-play double", () => {
    const r = scoreTurn(
      [
        { playerId: "A", number: 7, powerUp: "double" },
        { playerId: "B", number: 5 },
        { playerId: "C", number: 2 },
      ],
      undefined,
      "limiter",
    );
    // Double pays A 14 and B 10 / C 4 — but A's 7 is still the highest face, so it's clipped.
    expect(points(r)).toEqual({ A: 0, B: 10, C: 4 });
  });

  it("dormant composition: limiter ignores negative deltas (nothing positive to clip)", () => {
    const r = scoreTurn(
      [
        { playerId: "A", number: 4, powerUp: "make_negative" },
        { playerId: "B", number: 6 },
        { playerId: "C", number: 2 },
      ],
      undefined,
      "limiter",
    );
    expect(points(r)).toEqual({ A: -4, B: -6, C: -2 });
    expect(r.lines.every((l) => !l.notes.some((n) => n.startsWith("Limiter")))).toBe(true);
  });

  it("absorption: a lone 0 scores the average of the silenced cards, rounded up", () => {
    const r = scoreTurn(
      [
        { playerId: "A", number: 0 },
        { playerId: "B", number: 5 },
        { playerId: "C", number: 2 },
      ],
      undefined,
      "absorption",
    );
    // avg(5, 2) = 3.5 → rounds up to 4; the cancelled cards still score 0.
    expect(points(r)).toEqual({ A: 4, B: 0, C: 0 });
    expect(r.lines.find((l) => l.playerId === "A")!.notes).toContain(
      "Absorption: +4 (average of the silenced cards)",
    );
  });

  it("absorption: an exact average doesn't round", () => {
    const r = scoreTurn(
      [
        { playerId: "A", number: 0 },
        { playerId: "B", number: 4 },
        { playerId: "C", number: 2 },
      ],
      undefined,
      "absorption",
    );
    expect(points(r)).toEqual({ A: 3, B: 0, C: 0 });
  });

  it("absorption: tied opponents still count in the average", () => {
    const r = scoreTurn(
      [
        { playerId: "A", number: 0 },
        { playerId: "B", number: 3 },
        { playerId: "C", number: 3 },
      ],
      undefined,
      "absorption",
    );
    expect(points(r)).toEqual({ A: 3, B: 0, C: 0 });
  });

  it("absorption: matching zeros still suppress each other and absorb nothing", () => {
    const r = scoreTurn(
      [
        { playerId: "A", number: 0 },
        { playerId: "B", number: 0 },
        { playerId: "C", number: 6 },
      ],
      undefined,
      "absorption",
    );
    expect(points(r)).toEqual({ A: 0, B: 0, C: 6 });
    expect(r.lines.every((l) => !l.notes.some((n) => n.startsWith("Absorption")))).toBe(true);
  });

  it("absorption: without a lone 0 it scores identically to no power", () => {
    const plays = [
      { playerId: "A", number: 4 },
      { playerId: "B", number: 4 },
      { playerId: "C", number: 3 },
    ];
    expect(points(scoreTurn(plays, undefined, "absorption"))).toEqual(points(scoreTurn(plays)));
  });
});
