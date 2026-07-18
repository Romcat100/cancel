import { describe, expect, it } from "vitest";
import {
  ackRoundEnd,
  createRoom,
  setBotCount,
  startGame,
  submitTurn,
  type RoomDoc,
} from "./engine.js";
import { decideBotMove, decideBotNeighborRepick, decideBotPeekRepick, driveBots } from "./bots.js";
import { chooseNumber } from "./heuristics.js";
import { POWER_UPS, POWER_UP_IDS } from "../../../shared/types.js";

// A solo room: one human "H" plus `bots` AI players. rounds defaults low for fast tests.
function soloRoom(bots: number, opts?: { rounds?: number; powerUpMode?: "off" | "random" }): RoomDoc {
  let r = createRoom({
    code: "SOLO",
    hostId: "H",
    hostName: "You",
    rounds: opts?.rounds ?? 1,
    turnDeadlineMs: null,
    solo: true,
    powerUpMode: opts?.powerUpMode ?? "random",
  });
  return setBotCount(r, bots);
}

const human = (r: RoomDoc) => r.players.find((p) => !p.isBot)!;

describe("chooseNumber", () => {
  it("returns a card from the hand", () => {
    const n = chooseNumber([0, 1, 2, 3], [[0, 1, 2, 3]], [], () => 0.5);
    expect([0, 1, 2, 3]).toContain(n);
  });

  it("avoids a number known to already be on the board", () => {
    // With one opponent and a constant rng, the higher unique cards win; 3 is a known collision.
    const n = chooseNumber([0, 1, 2, 3], [[0, 1, 2, 3]], [3], () => 0.5);
    expect(n).not.toBe(3);
  });

  it("falls back gracefully on an empty hand", () => {
    expect(chooseNumber([], [[0, 1]], [], () => 0.5)).toBe(0);
  });

  it("samples a spread of cards instead of always taking the highest (so bots don't all tie)", () => {
    // Fresh full hand, three opponents holding the same hand: every card has equal P(unique), so a
    // deterministic argmax would return the top card every time. Over many draws we expect variety.
    const hand = [0, 1, 2, 3, 4, 5];
    const opp = [hand, hand, hand];
    const picks = Array.from({ length: 400 }, () => chooseNumber(hand, opp, []));
    const distinct = new Set(picks);
    const topShare = picks.filter((n) => n === 5).length / picks.length;
    expect(distinct.size).toBeGreaterThanOrEqual(4); // not collapsed onto one card
    expect(topShare).toBeLessThan(0.6); // favors the top card but is far from deterministic
  });

  it("two bots with identical hands usually diverge", () => {
    // The whole point of sampling: independent draws from the same hand rarely collide every time.
    const hand = [0, 1, 2, 3, 4, 5];
    const opp = [hand, hand];
    let diverged = 0;
    for (let i = 0; i < 400; i++) {
      if (chooseNumber(hand, opp, []) !== chooseNumber(hand, opp, [])) diverged++;
    }
    expect(diverged).toBeGreaterThan(200); // > half the time they pick different cards
  });
});

describe("chooseNumber — round-power awareness", () => {
  // Fraction of `picks` equal to `n`, for the distributional cases below.
  const share = (picks: number[], n: number) => picks.filter((x) => x === n).length / picks.length;
  const draws = (times: number, fn: () => number) => Array.from({ length: times }, fn);

  it("static: plays the 0 much less (no denial value, only a junk-card dodge weight)", () => {
    // Opponents hold no 0, so at baseline the 0 is a guaranteed lone canceller with real denial
    // value (~23% pick share here). Under Static that collapses to a small dump weight (~15%) —
    // deliberately not zero, or the bot hoards the 0 to the last turn and ties more elsewhere.
    const hand = [0, 5];
    const opp = [[1, 2], [3, 4]];
    const baseline = draws(1000, () => chooseNumber(hand, opp, []));
    const statics = draws(1000, () => chooseNumber(hand, opp, [], Math.random, "static"));
    expect(share(statics, 0)).toBeGreaterThan(0); // still in rotation
    expect(share(statics, 0)).toBeLessThan(share(baseline, 0) - 0.03);
  });

  it("harmony: embraces a known collision instead of dodging it", () => {
    // knownPlays [5] normally zeroes the 5's EV (see the dodge test above); under Harmony the
    // guaranteed tie pays double (10), beating the safe 4, so the 5 becomes the favorite.
    const hand = [4, 5];
    const opp = [[4, 5]];
    const baseline = draws(100, () => chooseNumber(hand, opp, [5]));
    expect(baseline.every((n) => n !== 5)).toBe(true);
    const harmonic = draws(400, () => chooseNumber(hand, opp, [5], Math.random, "harmony"));
    expect(share(harmonic, 5)).toBeGreaterThan(0.5);
  });

  it("absorption: leans harder on the lone 0 (it banks the silenced sum too)", () => {
    const hand = [0, 3];
    const opp = [[1, 2], [1, 2]];
    const baseline = draws(600, () => chooseNumber(hand, opp, []));
    const absorbing = draws(600, () => chooseNumber(hand, opp, [], Math.random, "absorption"));
    expect(share(absorbing, 0)).toBeGreaterThan(share(baseline, 0) + 0.08);
  });

  it("limiter (Gate): never plays a card certain to be the board min (it would be cut to 0)", () => {
    // Both opponents hold only cards above 1, so the 1 is the guaranteed board min: its whole
    // value gets cut, EV 0. At baseline the 1 still gets a real share of picks.
    const hand = [1, 5];
    const opp = [[2, 3], [2, 4]];
    const baseline = draws(400, () => chooseNumber(hand, opp, []));
    expect(share(baseline, 1)).toBeGreaterThan(0.05);
    const limited = draws(100, () => chooseNumber(hand, opp, [], Math.random, "limiter"));
    expect(limited.every((n) => n !== 1)).toBe(true);
  });

  it("subharmonic: favors the low card more (the board min gains +4)", () => {
    // Opponents hold only cards above 1, so the 1 is the guaranteed board min: it collects the
    // +4 lift (EV 5, equal to the 5), versus a small baseline EV of 1.
    const hand = [1, 5];
    const opp = [[2, 3], [2, 4]];
    const baseline = draws(600, () => chooseNumber(hand, opp, []));
    const lifted = draws(600, () => chooseNumber(hand, opp, [], Math.random, "subharmonic"));
    expect(share(lifted, 1)).toBeGreaterThan(share(baseline, 1) + 0.15);
  });

  it("inversion: hunts the known collision (a guaranteed tie saves the whole face)", () => {
    // The glimpsed 5 is a certain collision: at baseline that's EV 0 (never picked while the
    // unique 2 has value), but under Inversion a tie keeps the card at 0 while a survivor
    // scores minus its face — so the 5 becomes the only card worth playing (the 2 would
    // survive for -2, weight 0).
    const hand = [2, 5];
    const opp = [
      [3, 4],
      [3, 4],
    ];
    const baseline = draws(100, () => chooseNumber(hand, opp, [5]));
    expect(baseline.every((n) => n === 2)).toBe(true);
    const inverted = draws(100, () => chooseNumber(hand, opp, [5], Math.random, "inversion"));
    expect(inverted.every((n) => n === 5)).toBe(true);
  });

  it("dead_air: still plays the 0 against a known board 0 (the cancel can't be suppressed)", () => {
    // knownPlays [0] collapses the 0's EV at baseline (a second 0 would suppress the
    // cancel), so it's never picked while a live card has value. Under Dead Air the
    // denial keeps no uniqueness gate, so the 0 stays in real rotation.
    const hand = [0, 4];
    const opp = [[0, 2]];
    const baseline = draws(100, () => chooseNumber(hand, opp, [0]));
    expect(baseline.every((n) => n !== 0)).toBe(true);
    const dead = draws(600, () => chooseNumber(hand, opp, [0], Math.random, "dead_air"));
    expect(share(dead, 0)).toBeGreaterThan(0.1);
  });

  it("ultraviolet: shifts weight toward low cards (every face scores +2)", () => {
    const hand = [1, 5];
    const opp = [hand, hand];
    const baseline = draws(1000, () => chooseNumber(hand, opp, []));
    const uv = draws(1000, () => chooseNumber(hand, opp, [], Math.random, "ultraviolet"));
    expect(share(uv, 1)).toBeGreaterThan(share(baseline, 1) + 0.04);
  });

  it("pure_tone / amplify: card ranking is unchanged (deliberate no-ops)", () => {
    // Uniform scaling doesn't reorder EVs, so a crisp 5-dominant setup stays 5-dominant.
    const hand = [1, 5];
    const opp = [[1, 2], [2, 3]];
    for (const power of ["pure_tone", "amplify"] as const) {
      const picks = draws(400, () => chooseNumber(hand, opp, [], Math.random, power));
      expect(share(picks, 5), power).toBeGreaterThan(0.5);
    }
  });
});

describe("decideBotMove", () => {
  it("a non-picker bot submits a number from its hand and no power", () => {
    const r = startGame(soloRoom(2)); // picker (turn 0) is the human at seat 0
    const bot = r.players.find((p) => p.isBot)!;
    const move = decideBotMove(r, bot.id);
    expect(r.rounds[0].hands[bot.id]).toContain(move.number);
    expect(move.powerUp).toBeUndefined();
  });

  it("a picker bot plays an engine-valid move for EVERY power", () => {
    for (const pid of POWER_UP_IDS) {
      const r = startGame(soloRoom(3)); // 4 players: peek/sabotage allowed (>2)
      const bot = r.players.find((p) => p.isBot)!;
      // Force this bot to be the picker with exactly `pid` available.
      r.rounds[0].rotation[r.currentTurnIndex] = bot.id;
      r.rounds[0].poolFull = [pid];
      r.rounds[0].poolRemaining = [pid];

      const move = decideBotMove(r, bot.id);
      expect(move.powerUp, `power ${pid}`).toBe(pid);
      expect(r.rounds[0].hands[bot.id], `number for ${pid}`).toContain(move.number);
      if (POWER_UPS[pid].needsTarget) {
        expect(move.powerUpTarget, `target for ${pid}`).toBeTruthy();
        expect(move.powerUpTarget).not.toBe(bot.id);
        expect(r.players.some((p) => p.id === move.powerUpTarget)).toBe(true);
      }
      if (pid === "sabotage") {
        expect(r.rounds[0].hands[move.powerUpTarget!]).toContain(move.sabotageNumber);
      }
      // The engine must accept the bot's move without throwing.
      expect(() => submitTurn(r, move), `submit ${pid}`).not.toThrow();
    }
  });

  it("threads the round power into the number pick (a Gate bot never plays the certain min)", () => {
    // Opponents hold only cards above 1, so under Gate the 1's EV is exactly 0 (guaranteed
    // cut); at baseline it keeps a real share of picks. 100 clean draws prove the round power
    // actually reached chooseNumber.
    const r = startGame(soloRoom(2, { powerUpMode: "off" }));
    const bot = r.players.find((p) => p.isBot)!;
    r.rounds[0].roundPower = "limiter";
    r.rounds[0].hands[bot.id] = [1, 5];
    const others = r.players.filter((p) => p.id !== bot.id);
    r.rounds[0].hands[others[0].id] = [2, 3];
    r.rounds[0].hands[others[1].id] = [2, 4];
    for (let i = 0; i < 100; i++) {
      expect(decideBotMove(r, bot.id).number).not.toBe(1);
    }
  });

  it("plays a number-only move when the picker bot faces an empty pool", () => {
    const r = startGame(soloRoom(2));
    const bot = r.players.find((p) => p.isBot)!;
    r.rounds[0].rotation[r.currentTurnIndex] = bot.id;
    r.rounds[0].poolFull = [];
    r.rounds[0].poolRemaining = [];
    const move = decideBotMove(r, bot.id);
    expect(move.powerUp).toBeUndefined();
    expect(r.rounds[0].hands[bot.id]).toContain(move.number);
  });
});

describe("driveBots", () => {
  it("pre-submits all bots and waits for the human", () => {
    let r = startGame(soloRoom(2)); // 3 players
    r = driveBots(r);
    expect(r.phase).toBe("turn_submitting");
    const bots = r.players.filter((p) => p.isBot);
    for (const b of bots) expect(r.pendingSubmissions[b.id]).toBeDefined();
    expect(r.pendingSubmissions[human(r).id]).toBeUndefined();
  });

  it("plays a full solo game to game_end, pausing at round_end for the human", () => {
    let r = startGame(soloRoom(2, { rounds: 2, powerUpMode: "off" }));
    r = driveBots(r);
    let sawRoundEnd = false;
    let guard = 0;
    while (r.phase !== "game_end" && guard++ < 200) {
      if (r.phase === "turn_submitting") {
        const h = human(r);
        const hand = r.rounds[r.currentRoundIndex].hands[h.id];
        r = submitTurn(r, { playerId: h.id, number: hand[0] });
        r = driveBots(r);
      } else if (r.phase === "round_end") {
        sawRoundEnd = true;
        // Bots have acked, but the round must NOT advance until the human acks too.
        expect(r.rounds[r.currentRoundIndex].endAcksBy).not.toContain(human(r).id);
        r = ackRoundEnd(r, human(r).id);
        r = driveBots(r);
      } else {
        break;
      }
    }
    expect(r.phase).toBe("game_end");
    expect(sawRoundEnd).toBe(true);
    expect(r.winnerId).toBeDefined();
  });

  it("auto-resolves a bot peeker's re-pick", () => {
    let r = startGame(soloRoom(2)); // 3 players → peek allowed
    const peeker = r.players.filter((p) => p.isBot)[0];
    r.rounds[0].rotation[0] = peeker.id; // bot is the picker
    r.rounds[0].poolFull = ["peek"];
    r.rounds[0].poolRemaining = ["peek"];

    r = driveBots(r); // bots submit; the peeker bot plays peek
    expect(r.phase).toBe("turn_submitting"); // still waiting on the human

    const h = human(r);
    r = submitTurn(r, { playerId: h.id, number: r.rounds[0].hands[h.id][0] });
    r = driveBots(r); // human's submit triggers peek review; driver re-picks for the bot peeker

    expect(r.rounds[0].reveals).toHaveLength(1);
    expect(r.rounds[0].reveals[0].peekUsed?.peekerId).toBe(peeker.id);
  });

  it("does nothing in a lobby or a botless room", () => {
    const lobby = soloRoom(2);
    expect(driveBots(lobby)).toBe(lobby); // lobby phase → no-op (same ref)

    let humanOnly = createRoom({ code: "MP", hostId: "A", hostName: "Alice", rounds: 1, turnDeadlineMs: null });
    // no bots; starting needs 2 humans
    humanOnly = setBotCount(humanOnly, 0);
    expect(driveBots(humanOnly)).toBe(humanOnly);
  });
});

describe("decideBotNeighborRepick", () => {
  // A 3-player room paused in turn_neighbor_review, with the bot's hand pinned so every
  // case is deterministic. The caller pins initialPicks/targets per scenario.
  function reviewRoom(power: "refraction" | "broadcast") {
    const r = startGame(soloRoom(2));
    const bot = r.players.filter((p) => p.isBot)[0];
    const h = human(r);
    r.phase = "turn_neighbor_review";
    r.rounds[0].roundPower = power;
    r.rounds[0].hands[bot.id] = [0, 2, 3, 4];
    return { r, bot, h };
  }
  const missRoll = () => 0.99; // above REPICK_CHANCE: the random dodge never fires

  it("keeps a safe initial pick (glimpse shows no tie and no 0)", () => {
    const { r, bot, h } = reviewRoom("refraction");
    r.neighborReview = { initialPicks: { [bot.id]: 3, [h.id]: 1 }, targets: { [bot.id]: h.id } };
    expect(decideBotNeighborRepick(r, bot.id, missRoll).number).toBe(3);
  });

  it("occasionally dodges even a safe pick (REPICK_CHANCE with a real rng)", () => {
    const { r, bot, h } = reviewRoom("refraction");
    r.neighborReview = { initialPicks: { [bot.id]: 3, [h.id]: 1 }, targets: { [bot.id]: h.id } };
    let changed = 0;
    for (let i = 0; i < 1000; i++) {
      if (decideBotNeighborRepick(r, bot.id).number !== 3) changed++;
    }
    // The dodge fires ~10% of the time (and the re-pick sometimes re-selects 3 anyway),
    // so changes land well under the chance but clearly above zero.
    expect(changed).toBeGreaterThan(20);
    expect(changed).toBeLessThan(200);
  });

  it("dodges a glimpsed tie, never re-picking the tied number", () => {
    const { r, bot, h } = reviewRoom("refraction");
    r.neighborReview = { initialPicks: { [bot.id]: 3, [h.id]: 3 }, targets: { [bot.id]: h.id } };
    for (let i = 0; i < 50; i++) {
      const move = decideBotNeighborRepick(r, bot.id);
      expect(move.number).not.toBe(3);
      expect(r.rounds[0].hands[bot.id]).toContain(move.number);
    }
  });

  it("dumps the lowest nonzero card when the glimpse shows a lone 0", () => {
    const { r, bot, h } = reviewRoom("refraction");
    r.neighborReview = { initialPicks: { [bot.id]: 4, [h.id]: 0 }, targets: { [bot.id]: h.id } };
    expect(decideBotNeighborRepick(r, bot.id, missRoll).number).toBe(2);
  });

  it("broadcast: a tie with ANY other player's pick triggers a dodge", () => {
    const { r, bot, h } = reviewRoom("broadcast");
    const other = r.players.filter((p) => p.isBot)[1];
    // No per-player targets under broadcast; the whole board is the glimpse.
    r.neighborReview = {
      initialPicks: { [bot.id]: 3, [h.id]: 1, [other.id]: 3 },
      targets: {},
    };
    for (let i = 0; i < 50; i++) {
      const move = decideBotNeighborRepick(r, bot.id);
      expect(move.number).not.toBe(3);
      expect(r.rounds[0].hands[bot.id]).toContain(move.number);
    }
  });

  it("falls back to a fresh legal pick when the review snapshot is missing", () => {
    const { r, bot } = reviewRoom("refraction");
    r.neighborReview = undefined;
    const move = decideBotNeighborRepick(r, bot.id, () => 0.5);
    expect(r.rounds[0].hands[bot.id]).toContain(move.number);
  });
});

describe("decideBotPeekRepick", () => {
  it("returns a hand card and dodges the revealed opponent number", () => {
    let r = startGame(soloRoom(2));
    const peeker = r.players.filter((p) => p.isBot)[0];
    const target = human(r);
    r = {
      ...r,
      phase: "turn_peek_review",
      peekReview: { peekerId: peeker.id, targetId: target.id, revealedNumber: 2, originalNumber: 4 },
    };
    const move = decideBotPeekRepick(r, peeker.id, () => 0.5);
    expect(r.rounds[0].hands[peeker.id]).toContain(move.number);
  });
});
