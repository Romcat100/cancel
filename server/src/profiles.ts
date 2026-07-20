import { getDb } from "./db.js";
import * as kv from "./kv.js";
import type { CampaignProgress, FlairId } from "../../shared/campaign.js";
import { earnedFlairs, FLAIRS } from "../../shared/campaign.js";

// Anonymous per-device profile, keyed by a client-generated UUID (the "profile
// token") the same way room seats are keyed by claim tokens. It is a credential:
// it must never appear in any room projection. Whole state is one JSON blob per
// row, mirroring the rooms pattern — add new fields defensively in loadProfile.

export interface ProfileDoc extends CampaignProgress {
  unlockedFlairs: FlairId[];
  // One equipped cosmetic per kind, all worn together. `equippedFlair` is the
  // wave slot (the original single slot, name kept for save compat).
  equippedFlair: FlairId | null;
  equippedName: FlairId | null;
  equippedFlourish: FlairId | null;
  equippedSound: FlairId | null;
}

export function freshProfile(): ProfileDoc {
  return {
    completedLevels: {},
    unlockedFlairs: [],
    equippedFlair: null,
    equippedName: null,
    equippedFlourish: null,
    equippedSound: null,
  };
}

// Tokens come straight from clients — bound them so junk can't grow keys unboundedly.
export function validateProfileToken(token: unknown): string {
  if (typeof token !== "string" || token.length < 8 || token.length > 64) {
    throw new Error("Invalid profile token");
  }
  return token;
}

// The single defaults chokepoint (mirrors rooms.ts:loadRoom). A missing row is a
// fresh empty profile — nothing is written until the first save.
export function loadProfile(token: string): ProfileDoc {
  const db = getDb();
  const row = db.prepare("SELECT state FROM profiles WHERE token = ?").get(token) as
    | { state: string }
    | undefined;
  if (!row) return freshProfile();
  const doc = JSON.parse(row.state) as ProfileDoc;
  if (doc.completedLevels === undefined) doc.completedLevels = {};
  if (doc.unlockedFlairs === undefined) doc.unlockedFlairs = [];
  // Drop flair ids that no longer exist (renamed/retired cosmetics), then
  // backfill everything the recorded progress has earned: flairs derive from
  // completions, so re-spacing the unlock schedule applies retroactively to
  // profiles that completed levels under the old mapping. (Heals in memory on
  // every load; persisted whenever the profile is next saved.)
  doc.unlockedFlairs = [
    ...new Set([...doc.unlockedFlairs.filter((id) => id in FLAIRS), ...earnedFlairs(doc)]),
  ];
  // Each slot must hold a flair of its own kind (this also sheds retired ids
  // and defaults slots that predate their kind).
  const slotOk = (id: FlairId | null | undefined, kind: string) =>
    id != null && FLAIRS[id]?.kind === kind ? id : null;
  doc.equippedFlair = slotOk(doc.equippedFlair, "wave");
  doc.equippedName = slotOk(doc.equippedName, "name");
  doc.equippedFlourish = slotOk(doc.equippedFlourish, "flourish");
  doc.equippedSound = slotOk(doc.equippedSound, "sound");
  return doc;
}

export function saveProfile(token: string, doc: ProfileDoc): void {
  const db = getDb();
  const now = Date.now();
  db.prepare(
    `INSERT INTO profiles (token, state, created_at, updated_at)
     VALUES (?, ?, ?, ?)
     ON CONFLICT(token) DO UPDATE SET state = excluded.state, updated_at = excluded.updated_at`,
  ).run(token, JSON.stringify(doc), now, now);
  // Fire-and-forget durable mirror, same contract as rooms: never awaited, never throws.
  void kv.mirrorProfile(token, doc);
}

// Raw upsert of a profile restored from KV at boot: does NOT re-mirror (avoids a
// hydrate→mirror loop) and never overwrites a newer local row.
export function restoreProfile(token: string, doc: ProfileDoc): void {
  const db = getDb();
  const now = Date.now();
  db.prepare(
    `INSERT INTO profiles (token, state, created_at, updated_at)
     VALUES (?, ?, ?, ?)
     ON CONFLICT(token) DO NOTHING`,
  ).run(token, JSON.stringify(doc), now, now);
}

// A player's equipped cosmetics, empty for a fresh/unknown token. Never throws —
// flair lookup is decoration, not a gate.
export interface EquippedCosmetics {
  wave: FlairId | null;
  name: FlairId | null;
  flourish: FlairId | null;
  sound: FlairId | null;
}

const NO_COSMETICS: EquippedCosmetics = { wave: null, name: null, flourish: null, sound: null };

export function equippedCosmeticsFor(token: string | undefined): EquippedCosmetics {
  if (!token) return NO_COSMETICS;
  try {
    const p = loadProfile(validateProfileToken(token));
    return {
      wave: p.equippedFlair,
      name: p.equippedName,
      flourish: p.equippedFlourish,
      sound: p.equippedSound,
    };
  } catch {
    return NO_COSMETICS;
  }
}
