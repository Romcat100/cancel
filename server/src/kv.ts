import { Redis } from "@upstash/redis";
import type { RoomDoc } from "./game/engine.js";
// Type-only import — erased at runtime, so this does not create a require cycle with
// rooms.ts (which imports the mirror functions below at runtime).
import type { PlayerRow } from "./rooms.js";

// Durable key-value mirror (Upstash Redis).
//
// Design principle (see DURABLE_PERSISTENCE_PLAN.md): KV is WRITE-ONLY at runtime and
// READ-ONLY at boot. SQLite stays the synchronous source of truth for every request;
// these functions are a fire-and-forget background mirror so a cold-started instance can
// rehydrate. A failed KV write is logged and swallowed — it can never break or slow
// gameplay. When the env vars are missing, every export is a no-op so local dev and the
// test suite run with zero KV setup.

const ACTIVE_SET = "rooms:active";
const TTL_SECONDS = 7 * 24 * 60 * 60; // abandoned rooms self-expire; live ones keep refreshing

const roomKey = (code: string) => `room:${code}`;
const playersKey = (code: string) => `room:${code}:players`;
// All profiles live in one hash (token → state blob). No TTL: campaign progress
// persists indefinitely, unlike rooms which self-expire when abandoned.
const PROFILES_KEY = "profiles";

// The subset of the Upstash client we use. The real client satisfies this structurally;
// tests inject a small in-memory fake via __setKvClientForTest.
export interface KvClient {
  set(key: string, value: unknown): Promise<unknown>;
  get<T>(key: string): Promise<T | null>;
  sadd(key: string, ...members: string[]): Promise<number>;
  srem(key: string, ...members: string[]): Promise<number>;
  smembers(key: string): Promise<string[]>;
  del(...keys: string[]): Promise<number>;
  expire(key: string, seconds: number): Promise<number>;
  hset(key: string, kv: Record<string, unknown>): Promise<number>;
  hgetall<T>(key: string): Promise<Record<string, T> | null>;
}

// `undefined` = not yet resolved; `null` = unconfigured (no-op). A test override takes
// precedence over env-based construction.
let _client: KvClient | null | undefined;
let _override: KvClient | null | undefined; // undefined = no override in effect

function getClient(): KvClient | null {
  if (_override !== undefined) return _override;
  if (_client !== undefined) return _client;
  const url = process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN;
  if (!url || !token) {
    _client = null;
    return null;
  }
  _client = Redis.fromEnv() as unknown as KvClient;
  console.log("[kv] durable mirror enabled (Upstash)");
  return _client;
}

// Per-room serialized write chain. Mirror writes for a given code apply in FIFO order so a
// slower earlier write can never overwrite a newer rev in KV. Each enqueued op snapshots its
// payload at call time, so the value written reflects the state at the moment of the save.
const chains = new Map<string, Promise<void>>();

function enqueue(code: string, op: () => Promise<void>): Promise<void> {
  const prev = chains.get(code) ?? Promise.resolve();
  const next = prev.then(() => op());
  chains.set(code, next);
  void next.finally(() => {
    if (chains.get(code) === next) chains.delete(code);
  });
  return next;
}

export function mirrorRoom(room: RoomDoc): Promise<void> {
  const client = getClient();
  if (!client) return Promise.resolve();
  const code = room.code;
  // Snapshot so a later in-place rev bump on the same object can't change what this write
  // stores. Cheap relative to the network round-trip and removes all doubt about correctness.
  const snapshot = structuredClone(room);
  return enqueue(code, async () => {
    try {
      await client.set(roomKey(code), snapshot);
      await client.sadd(ACTIVE_SET, code);
      await client.expire(roomKey(code), TTL_SECONDS);
      await client.expire(playersKey(code), TTL_SECONDS);
    } catch (e) {
      console.warn(`[kv] mirrorRoom ${code} failed: ${(e as Error).message}`);
    }
  });
}

export function mirrorPlayer(p: PlayerRow): Promise<void> {
  const client = getClient();
  if (!client) return Promise.resolve();
  const code = p.roomCode;
  const snapshot = { ...p };
  return enqueue(code, async () => {
    try {
      await client.hset(playersKey(code), { [snapshot.id]: snapshot });
      await client.expire(playersKey(code), TTL_SECONDS);
    } catch (e) {
      console.warn(`[kv] mirrorPlayer ${snapshot.id} failed: ${(e as Error).message}`);
    }
  });
}

export function mirrorProfile(token: string, doc: unknown): Promise<void> {
  const client = getClient();
  if (!client) return Promise.resolve();
  const snapshot = structuredClone(doc);
  // Chained per-token so writes for one profile apply in FIFO order, like rooms.
  return enqueue(`profile:${token}`, async () => {
    try {
      await client.hset(PROFILES_KEY, { [token]: snapshot });
    } catch (e) {
      console.warn(`[kv] mirrorProfile failed: ${(e as Error).message}`);
    }
  });
}

// Read once, at boot, alongside hydrateActiveRooms.
export async function hydrateProfiles<T>(): Promise<{ token: string; doc: T }[]> {
  const client = getClient();
  if (!client) return [];
  try {
    const map = await client.hgetall<T>(PROFILES_KEY);
    if (!map) return [];
    return Object.entries(map).map(([token, doc]) => ({ token, doc }));
  } catch (e) {
    console.warn(`[kv] hydrate profiles failed: ${(e as Error).message}`);
    return [];
  }
}

export function dropRoom(code: string): Promise<void> {
  const client = getClient();
  if (!client) return Promise.resolve();
  // On the same chain as the room's mirrors so it lands after any pending writes for it.
  return enqueue(code, async () => {
    try {
      await client.srem(ACTIVE_SET, code);
      await client.del(roomKey(code), playersKey(code));
    } catch (e) {
      console.warn(`[kv] dropRoom ${code} failed: ${(e as Error).message}`);
    }
  });
}

// Read once, at boot. Returns the active rooms and their players for the caller to upsert into
// SQLite. Self-heals the index: a code in rooms:active whose room key has expired is SREM'd.
export async function hydrateActiveRooms(): Promise<{ rooms: RoomDoc[]; players: PlayerRow[] }> {
  const client = getClient();
  if (!client) return { rooms: [], players: [] };
  const rooms: RoomDoc[] = [];
  const players: PlayerRow[] = [];
  try {
    const codes = await client.smembers(ACTIVE_SET);
    for (const code of codes) {
      try {
        const room = await client.get<RoomDoc>(roomKey(code));
        if (!room) {
          await client.srem(ACTIVE_SET, code); // expired but lingering in the index
          continue;
        }
        rooms.push(room);
        const playersMap = await client.hgetall<PlayerRow>(playersKey(code));
        if (playersMap) {
          for (const p of Object.values(playersMap)) players.push(p);
        }
      } catch (e) {
        console.warn(`[kv] hydrate room ${code} failed: ${(e as Error).message}`);
      }
    }
  } catch (e) {
    console.warn(`[kv] hydrate failed: ${(e as Error).message}`);
  }
  return { rooms, players };
}

// --- test hooks ---------------------------------------------------------------------------
// Force a specific client (or `null` for no-op); pass `undefined` to clear the override and
// fall back to env-based construction. Also clears any in-flight write chains.
export function __setKvClientForTest(client: KvClient | null | undefined): void {
  _override = client;
  _client = undefined;
  chains.clear();
}

// Await all currently-queued mirror writes so a test can observe their effects.
export function __flushKv(): Promise<void> {
  return Promise.allSettled([...chains.values()]).then(() => undefined);
}
