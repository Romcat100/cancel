import { afterAll, describe, expect, it } from "vitest";
// Must be set before the first getDb() call. getDb is lazy (only invoked inside
// the tests below), so assigning here — after the hoisted imports, none of which
// call getDb at load — points the whole file at a throwaway in-memory DB.
process.env.DB_PATH = ":memory:";

import { closeDb, getDb } from "./db.js";
import { loadRoom, saveRoom } from "./rooms.js";
import { ackRoundEnd, addPlayer, createRoom, startGame, submitTurn, type RoomDoc } from "./game/engine.js";
import { projectStateForPlayer } from "./projection.js";

afterAll(() => closeDb());

describe("rev versioning", () => {
  it("saveRoom bumps rev by one each call; loadRoom reads it back", () => {
    const r = createRoom({ code: "REV1", hostId: "A", hostName: "Alice", rounds: 2, turnDeadlineMs: null });
    expect(r.rev).toBe(0);
    saveRoom(r);
    expect(r.rev).toBe(1);
    saveRoom(r);
    expect(r.rev).toBe(2);
    expect(loadRoom("REV1")!.rev).toBe(2);
  });

  it("projection carries the room's rev", () => {
    const r = createRoom({ code: "PROJ", hostId: "A", hostName: "Alice", rounds: 2, turnDeadlineMs: null });
    saveRoom(r);
    expect(projectStateForPlayer(r, "A", new Set(["A"])).rev).toBe(r.rev);
  });

  it("loadRoom defaults rev to 0 for rows saved before the field existed", () => {
    const r = createRoom({ code: "OLD1", hostId: "A", hostName: "Alice", rounds: 2, turnDeadlineMs: null });
    const legacy = JSON.parse(JSON.stringify(r)) as Record<string, unknown>;
    delete legacy.rev;
    getDb()
      .prepare(`INSERT INTO rooms (code, state, status, created_at, updated_at) VALUES (?, ?, 'active', ?, ?)`)
      .run("OLD1", JSON.stringify(legacy), r.createdAt, r.updatedAt);
    expect(loadRoom("OLD1")!.rev).toBe(0);
  });

  it("loadRoom migrates the legacy powerUps boolean to powerUpMode", () => {
    const r = createRoom({ code: "OLD2", hostId: "A", hostName: "Alice", rounds: 2, turnDeadlineMs: null });
    const legacy = JSON.parse(JSON.stringify(r)) as { config: Record<string, unknown> };
    delete legacy.config.powerUpMode;
    delete legacy.config.selectedPowerUps;
    legacy.config.powerUps = false;
    getDb()
      .prepare(`INSERT INTO rooms (code, state, status, created_at, updated_at) VALUES (?, ?, 'active', ?, ?)`)
      .run("OLD2", JSON.stringify(legacy), r.createdAt, r.updatedAt);
    const loaded = loadRoom("OLD2")!;
    expect(loaded.config.powerUpMode).toBe("off");
    expect(loaded.config.selectedPowerUps).toEqual([]);
    expect((loaded.config as Record<string, unknown>).powerUps).toBeUndefined();
  });

  it("loadRoom maps a legacy powerUps:true (or missing) to random mode", () => {
    const r = createRoom({ code: "OLD3", hostId: "A", hostName: "Alice", rounds: 2, turnDeadlineMs: null });
    const legacy = JSON.parse(JSON.stringify(r)) as { config: Record<string, unknown> };
    delete legacy.config.powerUpMode;
    delete legacy.config.selectedPowerUps;
    legacy.config.powerUps = true;
    getDb()
      .prepare(`INSERT INTO rooms (code, state, status, created_at, updated_at) VALUES (?, ?, 'active', ?, ?)`)
      .run("OLD3", JSON.stringify(legacy), r.createdAt, r.updatedAt);
    expect(loadRoom("OLD3")!.config.powerUpMode).toBe("random");
  });

  it("rev strictly increases across every save through round_end and game_end", () => {
    // One save per step, mirroring the handler's load→mutate→saveRoom chokepoint.
    const revs: number[] = [];
    const save = (room: RoomDoc) => {
      saveRoom(room);
      revs.push(room.rev);
    };

    let r = createRoom({ code: "GAME", hostId: "A", hostName: "Alice", rounds: 2, turnDeadlineMs: null, powerUpMode: "off" });
    save(r);
    r = addPlayer(r, "B", "Bob");
    save(r);
    r = startGame(r);
    save(r);

    let sawRoundEnd = false;
    let guard = 0;
    while (r.phase !== "game_end") {
      if (++guard > 100) throw new Error("game did not terminate");
      if (r.phase === "turn_submitting") {
        for (const pid of ["A", "B"]) {
          const hand = r.rounds[r.currentRoundIndex].hands[pid];
          r = submitTurn(r, { playerId: pid, number: hand[0] });
          save(r);
        }
      } else if (r.phase === "round_end") {
        sawRoundEnd = true;
        for (const pid of ["A", "B"]) {
          r = ackRoundEnd(r, pid);
          save(r);
        }
      } else {
        throw new Error(`unexpected phase ${r.phase}`);
      }
    }

    expect(sawRoundEnd).toBe(true);
    expect(r.phase).toBe("game_end");
    for (let i = 1; i < revs.length; i++) {
      expect(revs[i]).toBeGreaterThan(revs[i - 1]);
    }
    // each step is exactly one save, so the sequence is 1..N with no gaps
    expect(revs[0]).toBe(1);
    expect(revs[revs.length - 1]).toBe(revs.length);
    expect(loadRoom("GAME")!.rev).toBe(r.rev);
  });
});
