import { afterAll, beforeEach, describe, expect, it } from "vitest";
// Lazy getDb means setting this after the hoisted imports still points saveRoom/recordPlayer
// at a throwaway in-memory DB (same pattern as rooms.test.ts).
process.env.DB_PATH = ":memory:";

import { closeDb, getDb } from "./db.js";
import {
  findPlayerByClaim,
  loadRoom,
  recordPlayer,
  restorePlayer,
  restoreRoom,
  saveRoom,
  type PlayerRow,
} from "./rooms.js";
import { createRoom, type RoomDoc } from "./game/engine.js";
import {
  __flushKv,
  __setKvClientForTest,
  dropRoom,
  hydrateActiveRooms,
  mirrorPlayer,
  mirrorRoom,
  type KvClient,
} from "./kv.js";

const delay = (ms: number) => new Promise((r) => setTimeout(r, ms));

// Faithful-ish in-memory Upstash fake: JSON-(de)serializes on set/get and hash values, exactly
// like @upstash/redis, so round-trips through it match production behavior.
class FakeRedis implements KvClient {
  strings = new Map<string, string>();
  sets = new Map<string, Set<string>>();
  hashes = new Map<string, Map<string, string>>();
  ttls = new Map<string, number>();
  setLog: Array<{ key: string; value: any }> = [];
  firstSetDelayMs = 0;
  private firstSetSeen = false;

  async set(key: string, value: unknown) {
    if (!this.firstSetSeen && this.firstSetDelayMs > 0) {
      this.firstSetSeen = true;
      await delay(this.firstSetDelayMs);
    }
    const serialized = JSON.stringify(value);
    this.strings.set(key, serialized);
    this.setLog.push({ key, value: JSON.parse(serialized) });
    return "OK";
  }
  async get<T>(key: string): Promise<T | null> {
    const v = this.strings.get(key);
    return v === undefined ? null : (JSON.parse(v) as T);
  }
  async sadd(key: string, ...members: string[]) {
    let s = this.sets.get(key);
    if (!s) this.sets.set(key, (s = new Set()));
    let added = 0;
    for (const m of members) if (!s.has(m)) (s.add(m), added++);
    return added;
  }
  async srem(key: string, ...members: string[]) {
    const s = this.sets.get(key);
    if (!s) return 0;
    let removed = 0;
    for (const m of members) if (s.delete(m)) removed++;
    return removed;
  }
  async smembers(key: string) {
    return [...(this.sets.get(key) ?? [])];
  }
  async del(...keys: string[]) {
    let n = 0;
    for (const k of keys) {
      if (this.strings.delete(k)) n++;
      if (this.hashes.delete(k)) n++;
      this.sets.delete(k);
    }
    return n;
  }
  async expire(key: string, seconds: number) {
    const exists = this.strings.has(key) || this.hashes.has(key) || this.sets.has(key);
    if (!exists) return 0;
    this.ttls.set(key, seconds);
    return 1;
  }
  async hset(key: string, kv: Record<string, unknown>) {
    let h = this.hashes.get(key);
    if (!h) this.hashes.set(key, (h = new Map()));
    let n = 0;
    for (const [f, v] of Object.entries(kv)) {
      if (!h.has(f)) n++;
      h.set(f, JSON.stringify(v));
    }
    return n;
  }
  async hgetall<T>(key: string): Promise<Record<string, T> | null> {
    const h = this.hashes.get(key);
    if (!h || h.size === 0) return null;
    const out: Record<string, T> = {};
    for (const [f, v] of h) out[f] = JSON.parse(v) as T;
    return out;
  }
}

const mkRoom = (code: string) =>
  createRoom({ code, hostId: "A", hostName: "Alice", rounds: 2, turnDeadlineMs: null });

const mkPlayer = (roomCode: string, id: string, seat: number): PlayerRow => ({
  id,
  roomCode,
  name: `P${seat}`,
  seat,
  claimToken: `tok-${id}`,
});

afterAll(() => {
  __setKvClientForTest(undefined);
  closeDb();
});

describe("kv mirror — unconfigured", () => {
  beforeEach(() => __setKvClientForTest(null));

  it("mirror calls are no-ops and never throw", async () => {
    await expect(mirrorRoom(mkRoom("NOOP"))).resolves.toBeUndefined();
    await expect(mirrorPlayer(mkPlayer("NOOP", "p1", 0))).resolves.toBeUndefined();
    await expect(dropRoom("NOOP")).resolves.toBeUndefined();
  });

  it("hydrateActiveRooms returns empty", async () => {
    await expect(hydrateActiveRooms()).resolves.toEqual({ rooms: [], players: [] });
  });

  it("saveRoom still works without KV (live path unaffected)", () => {
    const r = mkRoom("LIVE");
    expect(() => saveRoom(r)).not.toThrow();
    expect(r.rev).toBe(1);
  });
});

describe("kv mirror — configured", () => {
  let fake: FakeRedis;
  beforeEach(() => {
    fake = new FakeRedis();
    __setKvClientForTest(fake);
  });

  it("mirrorRoom writes the blob, adds the active-set member, and refreshes TTL on both keys", async () => {
    const r = mkRoom("RM01");
    r.rev = 3;
    await mirrorRoom(r);
    expect(fake.strings.has("room:RM01")).toBe(true);
    expect((await fake.get<RoomDoc>("room:RM01"))!.rev).toBe(3);
    expect(await fake.smembers("rooms:active")).toContain("RM01");
    expect(fake.ttls.get("room:RM01")).toBe(7 * 24 * 60 * 60);
    // players-key TTL is refreshed even before any player exists (no-op on a missing key)
    expect(fake.ttls.has("room:RM01:players")).toBe(false);
  });

  it("saveRoom enqueues a room mirror through rooms.ts", async () => {
    const r = mkRoom("SAVE");
    saveRoom(r); // fire-and-forget inside
    await __flushKv();
    expect((await fake.get<RoomDoc>("room:SAVE"))!.rev).toBe(1);
    expect(await fake.smembers("rooms:active")).toContain("SAVE");
  });

  it("recordPlayer enqueues a player mirror through rooms.ts", async () => {
    saveRoom(mkRoom("PLY1"));
    recordPlayer({ id: "p1", roomCode: "PLY1", name: "Alice", seat: 0, claimToken: "tok-p1" });
    await __flushKv();
    const players = await fake.hgetall<PlayerRow>("room:PLY1:players");
    expect(players).not.toBeNull();
    expect(players!.p1.claimToken).toBe("tok-p1");
    expect(fake.ttls.get("room:PLY1:players")).toBe(7 * 24 * 60 * 60);
  });

  it("per-room chain preserves rev order even when an earlier write is slow", async () => {
    fake.firstSetDelayMs = 30; // delay only the first set() so out-of-order would land rev1 last
    const r = mkRoom("ORD1");
    r.rev = 1;
    const p1 = mirrorRoom(r);
    r.rev = 2; // mutate same object; snapshot in mirrorRoom must capture rev=1 for the first call
    const p2 = mirrorRoom(r);
    await Promise.all([p1, p2]);
    const roomSets = fake.setLog.filter((e) => e.key === "room:ORD1").map((e) => e.value.rev);
    expect(roomSets).toEqual([1, 2]); // op1 fully completed before op2 started
    expect((await fake.get<RoomDoc>("room:ORD1"))!.rev).toBe(2); // newest rev wins
  });

  it("dropRoom removes the active-set member and both keys", async () => {
    const r = mkRoom("DROP");
    await mirrorRoom(r);
    await mirrorPlayer(mkPlayer("DROP", "p1", 0));
    expect(await fake.smembers("rooms:active")).toContain("DROP");
    await dropRoom("DROP");
    expect(await fake.smembers("rooms:active")).not.toContain("DROP");
    expect(fake.strings.has("room:DROP")).toBe(false);
    expect(fake.hashes.has("room:DROP:players")).toBe(false);
  });

  it("hydrateActiveRooms round-trips a room and its players", async () => {
    const r = mkRoom("HYDR");
    r.rev = 5;
    await mirrorRoom(r);
    await mirrorPlayer(mkPlayer("HYDR", "p1", 0));
    await mirrorPlayer(mkPlayer("HYDR", "p2", 1));

    const { rooms, players } = await hydrateActiveRooms();
    expect(rooms).toHaveLength(1);
    expect(rooms[0].code).toBe("HYDR");
    expect(rooms[0].rev).toBe(5);
    expect(players.map((p) => p.id).sort()).toEqual(["p1", "p2"]);
    expect(players.every((p) => p.roomCode === "HYDR")).toBe(true);
  });

  it("self-heals the index: a code with an expired room key is removed and skipped", async () => {
    // Simulate a code lingering in the set after its room:<code> key expired.
    await fake.sadd("rooms:active", "GONE");
    const { rooms } = await hydrateActiveRooms();
    expect(rooms).toHaveLength(0);
    expect(await fake.smembers("rooms:active")).not.toContain("GONE");
  });
});

describe("kv — restart survival (boot hydrate into a wiped SQLite)", () => {
  it("rehydrates an active room and its seats from KV after the DB is wiped", async () => {
    const fake = new FakeRedis();
    __setKvClientForTest(fake);

    // Play a bit: save a room and two seats — both mirror to KV in the background.
    const r = mkRoom("BOOT");
    saveRoom(r);
    recordPlayer({ id: "h1", roomCode: "BOOT", name: "Alice", seat: 0, claimToken: "claim-host" });
    recordPlayer({ id: "g1", roomCode: "BOOT", name: "Bob", seat: 1, claimToken: "claim-guest" });
    await __flushKv();

    // Cold start: SQLite is wiped, KV survives.
    closeDb();
    getDb(); // fresh empty in-memory DB
    expect(loadRoom("BOOT")).toBeNull();

    // Boot hydrate: read KV once, upsert into SQLite (rooms before players for the FK).
    const { rooms, players } = await hydrateActiveRooms();
    for (const doc of rooms) restoreRoom(doc);
    for (const p of players) restorePlayer(p);

    const restored = loadRoom("BOOT");
    expect(restored).not.toBeNull();
    expect(restored!.code).toBe("BOOT");
    expect(restored!.rev).toBe(r.rev); // restoreRoom preserves the durable rev (no bump)
    expect(findPlayerByClaim("claim-host")?.id).toBe("h1");
    expect(findPlayerByClaim("claim-guest")?.seat).toBe(1);
  });
});
