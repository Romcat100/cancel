import { randomUUID } from "node:crypto";
import { getDb } from "./db.js";
import type { RoomDoc } from "./game/engine.js";

const CODE_ALPHABET = "ABCDEFGHJKMNPQRTUVWXYZ23456789";

export function generateRoomCode(): string {
  const db = getDb();
  for (let attempt = 0; attempt < 10; attempt++) {
    let code = "";
    for (let i = 0; i < 4; i++) code += CODE_ALPHABET[Math.floor(Math.random() * CODE_ALPHABET.length)];
    const existing = db.prepare("SELECT 1 FROM rooms WHERE code = ?").get(code);
    if (!existing) return code;
  }
  throw new Error("failed to generate unique room code");
}

export function newPlayerId(): string {
  return randomUUID();
}

export function newClaimToken(): string {
  return randomUUID();
}

export function saveRoom(room: RoomDoc): void {
  const db = getDb();
  db.prepare(
    `INSERT INTO rooms (code, state, status, created_at, updated_at)
     VALUES (?, ?, 'active', ?, ?)
     ON CONFLICT(code) DO UPDATE SET state = excluded.state, updated_at = excluded.updated_at, status = excluded.status`,
  ).run(room.code, JSON.stringify(room), room.createdAt, room.updatedAt);
}

export function loadRoom(code: string): RoomDoc | null {
  const db = getDb();
  const row = db.prepare("SELECT state FROM rooms WHERE code = ? AND status = 'active'").get(code) as
    | { state: string }
    | undefined;
  if (!row) return null;
  const doc = JSON.parse(row.state) as RoomDoc;
  if (doc.config.powerUps === undefined) doc.config.powerUps = true;
  return doc;
}

export function archiveRoom(code: string, status: "complete" | "archived" = "complete"): void {
  const db = getDb();
  db.prepare("UPDATE rooms SET status = ?, updated_at = ? WHERE code = ?").run(status, Date.now(), code);
}

export interface PlayerRow {
  id: string;
  roomCode: string;
  name: string;
  seat: number;
  claimToken: string;
}

export function recordPlayer(p: { id: string; roomCode: string; name: string; seat: number; claimToken: string }): void {
  const db = getDb();
  db.prepare(
    `INSERT INTO players (id, room_code, name, seat, claim_token, created_at)
     VALUES (?, ?, ?, ?, ?, ?)`,
  ).run(p.id, p.roomCode, p.name, p.seat, p.claimToken, Date.now());
}

export function findPlayerByClaim(claimToken: string): PlayerRow | null {
  const db = getDb();
  const row = db
    .prepare("SELECT id, room_code as roomCode, name, seat, claim_token as claimToken FROM players WHERE claim_token = ?")
    .get(claimToken) as PlayerRow | undefined;
  return row ?? null;
}

export function gcAbandoned(maxAgeMs: number): number {
  const db = getDb();
  const cutoff = Date.now() - maxAgeMs;
  const res = db
    .prepare("UPDATE rooms SET status = 'archived' WHERE status = 'active' AND updated_at < ?")
    .run(cutoff);
  return res.changes;
}

export function countActiveGames(): number {
  const db = getDb();
  const row = db
    .prepare(
      `SELECT COUNT(*) AS c FROM rooms
       WHERE status = 'active'
         AND json_extract(state, '$.phase') IN ('turn_submitting', 'turn_peek_review', 'round_end')`,
    )
    .get() as { c: number };
  return row.c;
}
