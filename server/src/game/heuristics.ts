// Pure number-picking heuristics shared by the bot brain (bots.ts) and the host "Skip waiting"
// auto-play (engine.ts:forceResolveTurn). No engine/IO imports — a leaf module, so both callers
// can use it without forming a dependency cycle (the RoundPowerId import below is type-only, so
// it erases at compile time and the module stays a leaf). Every decision is a function of plain
// number arrays plus an injectable rng (default Math.random), keeping callers deterministic
// under test.

import type { RoundPowerId } from "../../../shared/types.js";

export function mean(nums: number[]): number {
  return nums.length === 0 ? 0 : nums.reduce((s, n) => s + n, 0) / nums.length;
}

// Probability a candidate card `c` survives unique: each opponent still holding `c` plays it with
// ~1/(their remaining cards), assuming a uniform pick. Product over opponents = chance none collide.
export function pUniqueAgainst(c: number, oppHands: number[][]): number {
  return oppHands.reduce(
    (p, h) => (h.includes(c) && h.length > 0 ? p * (1 - 1 / h.length) : p),
    1,
  );
}

// Number-pick randomness. Rather than always playing the highest-EV card (which made every picker
// march 5,4,3,2 down its hand and tie the others, since identical hands produce identical argmaxes),
// the picker SAMPLES a card with probability ∝ (EV + floor)^GREED. Independent draws spread pickers
// across the hand, so they rarely converge on the same card. GREED tunes greedy↔random: 1 is roughly
// proportional-to-value, higher leans toward the top card, lower flattens toward uniform. The floor
// keeps low-but-positive cards in genuine contention so play stays varied.
const GREED = 1.3;
const PICK_FLOOR = 0.15; // floor added to each positive EV, as a fraction of the top card's EV

// Chance every opponent plays a card strictly below `c` (so `c` would be the board max), assuming
// each opponent picks uniformly from their remaining hand. An empty opponent hand plays nothing
// and can't beat `c`, so it contributes factor 1. Mirror: pAllAbove for the board-min chance.
export function pAllBelow(c: number, oppHands: number[][]): number {
  return oppHands.reduce(
    (p, h) => (h.length > 0 ? p * (h.filter((n) => n < c).length / h.length) : p),
    1,
  );
}

export function pAllAbove(c: number, oppHands: number[][]): number {
  return oppHands.reduce(
    (p, h) => (h.length > 0 ? p * (h.filter((n) => n > c).length / h.length) : p),
    1,
  );
}

// Pick a number to play. Everyone holds the same hand and plays each card once per round, so
// collisions dominate: value each card by value × P(stays unique), with a 0 valued for its denial
// (a lone 0 cancels everyone), then sample from that weighting (see GREED note above). `knownPlays`
// are numbers already certain to be on the board (used by the peek re-pick, which knows one
// opponent's number); they collapse to EV 0 and so are never chosen unless nothing else can be.
//
// `roundPower` (when given) reshapes each card's EV to match the live round power's scoring:
//   - static: a 0 can't cancel (and still scores 0), so it loses its denial value — but it keeps
//     a small junk-card weight. Valuing it at exactly 0 made the picker hoard it until the last
//     turn, squeezing the real cards into fewer turns and tying more often (simulated ~6% worse);
//     a mid-round dump diffuses ties, and a 0-0 tie costs nothing under Static.
//   - ultraviolet: every face scores +2 — a 0 becomes a scoring 2 (no denial), and low cards
//     close the gap on high ones ((c+2) vs c).
//   - harmony: a face tie pays double instead of 0, so a knownPlays hit is a *guaranteed*
//     double rather than a card to dodge. Deliberately no blanket tie-seeking beyond that:
//     weighting every card by its collision chance flattened the sampler into near-random
//     timing and simulated slightly worse than baseline play.
//   - absorption: the lone 0 also banks the sum of the silenced faces, so its denial value
//     roughly gains the whole board's expected total (avg face x opponent count) on top.
//   - limiter: the highest surviving card is clipped to 0, so discount a card by its chance of
//     being the board max. (Approximation: ignores the tie-at-the-peak case where a tied top
//     wipes itself before the clip.)
//   - subharmonic: the lowest surviving card gains +4, so credit a card's chance of being the
//     board min while it survives.
//   - pure_tone / refraction / broadcast: no scoring effect on the pick. amplify doubles every
//     nonzero delta uniformly (including the points a 0 denies), so card ranking is unchanged —
//     a deliberate no-op here.
export function chooseNumber(
  myHand: number[],
  oppHands: number[][],
  knownPlays: number[],
  rng: () => number = Math.random,
  roundPower?: RoundPowerId | null,
): number {
  if (myHand.length === 0) return 0;
  const known = new Set(knownPlays);
  const avgOpp = oppHands.length ? mean(oppHands.map((h) => mean(h))) : 0;

  const evs = myHand.map((c) => {
    if (c === 0) {
      if (roundPower === "static") return avgOpp * 0.3; // no cancel or score, just dodge value
      if (roundPower === "ultraviolet") {
        // A 0 scores as a 2 (no denial); it still face-ties another 0, so gate on uniqueness.
        return known.has(0) ? 0 : 2 * pUniqueAgainst(0, oppHands);
      }
      const pLone = known.has(0) ? 0 : pUniqueAgainst(0, oppHands);
      if (roundPower === "absorption") return pLone * avgOpp * (0.6 + oppHands.length); // denial + the absorbed sum
      return pLone * avgOpp * 0.6; // denial value of a likely lone 0
    }
    const pUnique = known.has(c) ? 0 : pUniqueAgainst(c, oppHands);
    if (roundPower === "harmony" && known.has(c)) return 2 * c;
    if (roundPower === "ultraviolet") return (c + 2) * pUnique;
    if (roundPower === "limiter") return c * pUnique * (1 - pAllBelow(c, oppHands));
    if (roundPower === "subharmonic") return c * pUnique + 4 * pAllAbove(c, oppHands) * pUnique;
    return c * pUnique;
  });

  // Weight ∝ (EV + floor)^GREED for positive-EV cards; EV-0 cards (known collisions) get no weight.
  const maxEv = Math.max(0, ...evs);
  const floor = maxEv * PICK_FLOOR;
  const weights = evs.map((ev) => (ev > 0 ? Math.pow(ev + floor, GREED) : 0));
  const total = weights.reduce((s, w) => s + w, 0);

  // Degenerate board (every card a known collision, or no value anywhere): pick uniformly at random.
  if (total <= 0) return myHand[Math.min(myHand.length - 1, Math.floor(rng() * myHand.length))];

  let r = rng() * total;
  for (let i = 0; i < myHand.length; i++) {
    r -= weights[i];
    if (r <= 0) return myHand[i];
  }
  return myHand[myHand.length - 1];
}
