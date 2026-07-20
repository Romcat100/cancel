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
  equippedFlair: FlairId | null;
}

export function freshProfile(): ProfileDoc {
  return { completedLevels: {}, unlockedFlairs: [], equippedFlair: null };
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
  if (doc.equippedFlair === undefined || (doc.equippedFlair && !(doc.equippedFlair in FLAIRS))) {
    doc.equippedFlair = null;
  }
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

// A player's equipped flair, or null for a fresh/unknown token. Never throws —
// flair lookup is decoration, not a gate.
export function equippedFlairFor(token: string | undefined): FlairId | null {
  if (!token) return null;
  try {
    return loadProfile(validateProfileToken(token)).equippedFlair;
  } catch {
    return null;
  }
}
