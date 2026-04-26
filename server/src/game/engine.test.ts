import { describe, expect, it } from "vitest";
import {
  ackRoundEnd,
  addPlayer,
  createRoom,
  startGame,
  submitTurn,
  type RoomDoc,
} from "./engine.js";
import type { PowerUpId } from "../../../shared/types.js";

function room3p(): RoomDoc {
  let r = createRoom({ code: "ABCD", hostId: "A", hostName: "Alice", rounds: 3, turnDeadlineMs: null });
  r = addPlayer(r, "B", "Bob");
  r = addPlayer(r, "C", "Carol");
  return r;
}

function pickSafePower(pool: PowerUpId[]): PowerUpId {
  return pool.find((p) => p !== "peek" && p !== "mute" && p !== "sabotage") ?? pool[0];
}

function ackAll(r: RoomDoc): RoomDoc {
  for (const p of r.players) r = ackRoundEnd(r, p.id);
  return r;
}

const SAFE_POOL: PowerUpId[] = ["double", "shield", "negate_zero", "plus_two", "free_three", "negate", "steal_two", "trade", "equalize", "reverse"];

function forceSafePool(r: RoomDoc): RoomDoc {
  const cur = r.rounds[r.currentRoundIndex];
  const handSize = r.players.length + 2;
  cur.poolFull = SAFE_POOL.slice(0, handSize);
  cur.poolRemaining = [...cur.poolFull];
  return r;
}

describe("engine lifecycle", () => {
  it("creates a lobby with the host as seat 0", () => {
    const r = createRoom({ code: "ABCD", hostId: "A", hostName: "Alice", rounds: 3, turnDeadlineMs: null });
    expect(r.phase).toBe("lobby");
    expect(r.players).toHaveLength(1);
    expect(r.players[0].seat).toBe(0);
  });

  it("addPlayer assigns sequential seats", () => {
    const r = room3p();
    expect(r.players.map((p) => p.seat)).toEqual([0, 1, 2]);
  });

  it("rejects duplicate names case-insensitively", () => {
    const r = createRoom({ code: "ABCD", hostId: "A", hostName: "Alice", rounds: 3, turnDeadlineMs: null });
    expect(() => addPlayer(r, "B", "alice")).toThrow(/name taken/);
  });

  it("startGame deals N+2 cards and N+2 power-ups; first picker is seat 0", () => {
    const r = startGame(room3p());
    expect(r.phase).toBe("turn_submitting");
    const round = r.rounds[0];
    expect(round.poolFull).toHaveLength(5);
    expect(round.poolRemaining).toHaveLength(5);
    expect(round.hands["A"]).toEqual([0, 1, 2, 3, 4]);
    expect(round.rotation).toHaveLength(5);
    expect(round.rotation[0]).toBe("A");
  });

  it("rejects starting with fewer than 2 players", () => {
    const r = createRoom({ code: "ABCD", hostId: "A", hostName: "Alice", rounds: 3, turnDeadlineMs: null });
    expect(() => startGame(r)).toThrow(/2 players/);
  });

  it("submitting a number locks it in; turn auto-resolves when everyone has submitted", () => {
    let r = startGame(room3p());
    const picker = r.rounds[0].rotation[0];
    expect(picker).toBe("A");
    const power = pickSafePower(r.rounds[0].poolRemaining);

    r = submitTurn(r, { playerId: "A", number: 4, powerUp: power });
    r = submitTurn(r, { playerId: "B", number: 3 });
    expect(r.currentTurnIndex).toBe(0);
    expect(Object.keys(r.pendingSubmissions)).toHaveLength(2);

    r = submitTurn(r, { playerId: "C", number: 2 });
    expect(r.rounds[0].reveals).toHaveLength(1);
    expect(r.currentTurnIndex).toBe(1);
    expect(r.pendingSubmissions).toEqual({});
    expect(r.rounds[0].poolRemaining).toHaveLength(4);
    expect(r.rounds[0].hands["A"]).toEqual([0, 1, 2, 3]);
  });

  it("non-pickers cannot play power-ups", () => {
    const r = startGame(room3p());
    const power = pickSafePower(r.rounds[0].poolRemaining);
    expect(() => submitTurn(r, { playerId: "B", number: 0, powerUp: power })).toThrow(/picker/);
  });

  it("picker must pick a power-up while pool is non-empty", () => {
    const r = startGame(room3p());
    expect(() => submitTurn(r, { playerId: "A", number: 0 })).toThrow(/must pick/);
  });

  it("rejects already-submitted player", () => {
    let r = startGame(room3p());
    const power = pickSafePower(r.rounds[0].poolRemaining);
    r = submitTurn(r, { playerId: "A", number: 4, powerUp: power });
    expect(() => submitTurn(r, { playerId: "A", number: 0, powerUp: power })).toThrow(/already submitted/);
  });

  it("rotation moves picker to seat 1 on turn 2", () => {
    let r = startGame(room3p());
    const power0 = pickSafePower(r.rounds[0].poolRemaining);
    r = submitTurn(r, { playerId: "A", number: 4, powerUp: power0 });
    r = submitTurn(r, { playerId: "B", number: 3 });
    r = submitTurn(r, { playerId: "C", number: 2 });
    expect(r.rounds[0].rotation[1]).toBe("B");
  });

  it("after last turn of a round, phase is round_end and waits for all acks", () => {
    let r = forceSafePool(startGame(room3p()));
    for (let turn = 0; turn < 5; turn++) {
      const cur = r.rounds[r.currentRoundIndex];
      const picker = cur.rotation[r.currentTurnIndex];
      const power = pickSafePower(cur.poolRemaining);
      const targetId = power === "peek" || power === "mute" ? r.players.find((p) => p.id !== picker)!.id : undefined;
      const submitFor = (pid: string, isPick: boolean) => {
        const hand = r.rounds[r.currentRoundIndex].hands[pid];
        r = submitTurn(
          r,
          isPick
            ? { playerId: pid, number: hand[0], powerUp: power, powerUpTarget: targetId }
            : { playerId: pid, number: hand[0] },
        );
      };
      submitFor(picker, true);
      for (const p of r.players) if (p.id !== picker) submitFor(p.id, false);
    }
    expect(r.phase).toBe("round_end");
    expect(r.currentRoundIndex).toBe(0);

    r = ackRoundEnd(r, "A");
    expect(r.phase).toBe("round_end");
    r = ackRoundEnd(r, "B");
    expect(r.phase).toBe("round_end");
    r = ackRoundEnd(r, "C");
    expect(r.phase).toBe("turn_submitting");
    expect(r.currentRoundIndex).toBe(1);
  });

  it("transitions through 3 rounds to game_end with a winner", () => {
    let r = forceSafePool(startGame(room3p()));
    for (let round = 0; round < 3; round++) {
      for (let turn = 0; turn < 5; turn++) {
        const cur = r.rounds[r.currentRoundIndex];
        const picker = cur.rotation[r.currentTurnIndex];
        const power = pickSafePower(cur.poolRemaining);
        const targetId = power === "peek" || power === "mute" ? r.players.find((p) => p.id !== picker)!.id : undefined;
        const submitFor = (pid: string, isPick: boolean) => {
          const hand = r.rounds[r.currentRoundIndex].hands[pid];
          r = submitTurn(
            r,
            isPick
              ? { playerId: pid, number: hand[0], powerUp: power, powerUpTarget: targetId }
              : { playerId: pid, number: hand[0] },
          );
        };
        submitFor(picker, true);
        for (const p of r.players) if (p.id !== picker) submitFor(p.id, false);
      }
      r = ackAll(r);
      if (round < 2) r = forceSafePool(r);
    }
    expect(r.phase).toBe("game_end");
    expect(r.winnerId).toBeDefined();
  });
});

describe("peek mid-turn re-pick", () => {
  function setup(): RoomDoc {
    let r = startGame(room3p());
    // Force first round's pool to include 'peek' deterministically — replace remaining[0] with peek.
    const round = r.rounds[r.currentRoundIndex];
    if (!round.poolRemaining.includes("peek")) {
      round.poolFull = ["peek", ...round.poolFull.slice(1)];
      round.poolRemaining = ["peek", ...round.poolRemaining.slice(1)];
    }
    return r;
  }

  it("when picker plays peek, after all submissions phase becomes turn_peek_review with the peeker un-submitted", () => {
    let r = setup();
    r = submitTurn(r, { playerId: "A", number: 4, powerUp: "peek", powerUpTarget: "B" });
    r = submitTurn(r, { playerId: "B", number: 3 });
    r = submitTurn(r, { playerId: "C", number: 2 });
    expect(r.phase).toBe("turn_peek_review");
    expect(r.peekReview).toEqual({ peekerId: "A", targetId: "B", revealedNumber: 3, originalNumber: 4 });
    expect(r.pendingSubmissions["A"]).toBeUndefined();
    expect(r.pendingSubmissions["B"]).toBeDefined();
    expect(r.pendingSubmissions["C"]).toBeDefined();
  });

  it("only the peeker can submit during peek review; non-peekers throw", () => {
    let r = setup();
    r = submitTurn(r, { playerId: "A", number: 4, powerUp: "peek", powerUpTarget: "B" });
    r = submitTurn(r, { playerId: "B", number: 3 });
    r = submitTurn(r, { playerId: "C", number: 2 });
    expect(() => submitTurn(r, { playerId: "B", number: 0 })).toThrow(/peeker/);
  });

  it("peeker re-submits a new number; turn resolves with the new number", () => {
    let r = setup();
    r = submitTurn(r, { playerId: "A", number: 4, powerUp: "peek", powerUpTarget: "B" });
    r = submitTurn(r, { playerId: "B", number: 3 });
    r = submitTurn(r, { playerId: "C", number: 2 });
    r = submitTurn(r, { playerId: "A", number: 0 });
    expect(r.phase).toBe("turn_submitting");
    const reveal = r.rounds[0].reveals[0];
    const aSub = reveal.submissions.find((s) => s.playerId === "A")!;
    expect(aSub.number).toBe(0);
    expect(reveal.peekUsed).toEqual({ peekerId: "A", targetId: "B", revealedNumber: 3, originalNumber: 4 });
  });

  it("peeker can re-submit the same number they originally chose", () => {
    let r = setup();
    r = submitTurn(r, { playerId: "A", number: 4, powerUp: "peek", powerUpTarget: "B" });
    r = submitTurn(r, { playerId: "B", number: 3 });
    r = submitTurn(r, { playerId: "C", number: 2 });
    r = submitTurn(r, { playerId: "A", number: 4 });
    expect(r.phase).toBe("turn_submitting");
    const reveal = r.rounds[0].reveals[0];
    expect(reveal.submissions.find((s) => s.playerId === "A")!.number).toBe(4);
  });
});

describe("sabotage", () => {
  function setup(): RoomDoc {
    let r = startGame(room3p());
    const round = r.rounds[r.currentRoundIndex];
    if (!round.poolRemaining.includes("sabotage")) {
      round.poolFull = ["sabotage", ...round.poolFull.slice(1)];
      round.poolRemaining = ["sabotage", ...round.poolRemaining.slice(1)];
    }
    return r;
  }

  it("sabotage requires a target and a sabotage number", () => {
    const r = setup();
    expect(() =>
      submitTurn(r, { playerId: "A", number: 1, powerUp: "sabotage" }),
    ).toThrow(/target required/);
    expect(() =>
      submitTurn(r, { playerId: "A", number: 1, powerUp: "sabotage", powerUpTarget: "B" }),
    ).toThrow(/sabotage number required/);
  });

  it("sabotage number must be in the target's hand", () => {
    let r = setup();
    r.rounds[0].hands["B"] = [0, 1, 2];
    expect(() =>
      submitTurn(r, { playerId: "A", number: 4, powerUp: "sabotage", powerUpTarget: "B", sabotageNumber: 5 }),
    ).toThrow(/not in target's hand/);
  });

  it("sabotage overrides the target's submitted number at resolve time", () => {
    let r = setup();
    r = submitTurn(r, { playerId: "A", number: 4, powerUp: "sabotage", powerUpTarget: "B", sabotageNumber: 0 });
    r = submitTurn(r, { playerId: "B", number: 3 });
    r = submitTurn(r, { playerId: "C", number: 2 });
    const reveal = r.rounds[0].reveals[0];
    expect(reveal.submissions.find((s) => s.playerId === "B")!.number).toBe(0);
    expect(reveal.sabotageUsed).toEqual({ sabotagerId: "A", targetId: "B", forcedNumber: 0, originalNumber: 3 });
    // B's hand should have lost the forced 0, not their original 3.
    expect(r.rounds[0].hands["B"]).not.toContain(0);
    expect(r.rounds[0].hands["B"]).toContain(3);
  });

  it("sabotage forcing a 0 cancels everyone (a single 0 still cancels)", () => {
    let r = setup();
    r = submitTurn(r, { playerId: "A", number: 4, powerUp: "sabotage", powerUpTarget: "B", sabotageNumber: 0 });
    r = submitTurn(r, { playerId: "B", number: 3 });
    r = submitTurn(r, { playerId: "C", number: 2 });
    const reveal = r.rounds[0].reveals[0];
    const scoreFor = (id: string) => reveal.scoreLines.find((l) => l.playerId === id)?.delta;
    expect(scoreFor("A")).toBe(0);
    expect(scoreFor("B")).toBe(0);
    expect(scoreFor("C")).toBe(0);
  });

  it("sabotage can force a tie with the picker to neutralize the target", () => {
    let r = setup();
    r = submitTurn(r, { playerId: "A", number: 4, powerUp: "sabotage", powerUpTarget: "B", sabotageNumber: 4 });
    r = submitTurn(r, { playerId: "B", number: 1 });
    r = submitTurn(r, { playerId: "C", number: 2 });
    const reveal = r.rounds[0].reveals[0];
    const scoreFor = (id: string) => reveal.scoreLines.find((l) => l.playerId === id)?.delta;
    expect(scoreFor("A")).toBe(0);
    expect(scoreFor("B")).toBe(0);
    expect(scoreFor("C")).toBe(2);
  });
});
