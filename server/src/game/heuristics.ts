// Pure number-picking heuristics shared by the bot brain (bots.ts) and the host "Skip waiting"
// auto-play (engine.ts:forceResolveTurn). No engine/IO imports — a leaf module, so both callers
// can use it without forming a dependency cycle. Every decision is a function of plain number
// arrays plus an injectable rng (default Math.random), keeping callers deterministic under test.

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

// Pick a number to play. Everyone holds the same hand and plays each card once per round, so
// collisions dominate: value each card by value × P(stays unique), with a 0 valued for its denial
// (a lone 0 cancels everyone), then sample from that weighting (see GREED note above). `knownPlays`
// are numbers already certain to be on the board (used by the peek re-pick, which knows one
// opponent's number); they collapse to EV 0 and so are never chosen unless nothing else can be.
export function chooseNumber(
  myHand: number[],
  oppHands: number[][],
  knownPlays: number[],
  rng: () => number = Math.random,
): number {
  if (myHand.length === 0) return 0;
  const known = new Set(knownPlays);
  const avgOpp = oppHands.length ? mean(oppHands.map((h) => mean(h))) : 0;

  const evs = myHand.map((c) => {
    if (c === 0) {
      const pLone = known.has(0) ? 0 : pUniqueAgainst(0, oppHands);
      return pLone * avgOpp * 0.6; // denial value of a likely lone 0
    }
    const pUnique = known.has(c) ? 0 : pUniqueAgainst(c, oppHands);
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
