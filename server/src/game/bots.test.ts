import { describe, expect, it } from "vitest";
import {
  ackRoundEnd,
  createRoom,
  setBotCount,
  startGame,
  submitTurn,
  type RoomDoc,
} from "./engine.js";
import { chooseNumber, decideBotMove, decideBotPeekRepick, driveBots } from "./bots.js";
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
