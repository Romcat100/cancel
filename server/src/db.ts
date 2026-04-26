import Database from "better-sqlite3";
import path from "node:path";
import { fileURLToPath } from "node:url";
import fs from "node:fs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DEFAULT_DB_PATH = path.resolve(__dirname, "../data/cancel.sqlite");

export type DB = Database.Database;

let _db: DB | null = null;

export function getDb(): DB {
  if (_db) return _db;
  const dbPath = process.env.DB_PATH ?? DEFAULT_DB_PATH;
  fs.mkdirSync(path.dirname(dbPath), { recursive: true });
  const db = new Database(dbPath);
  db.pragma("journal_mode = WAL");
  db.pragma("foreign_keys = ON");
  initSchema(db);
  _db = db;
  return db;
}

function initSchema(db: DB) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS rooms (
      code TEXT PRIMARY KEY,
      state TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'active',
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL
    );
    CREATE INDEX IF NOT EXISTS rooms_status_idx ON rooms(status);
    CREATE INDEX IF NOT EXISTS rooms_updated_idx ON rooms(updated_at);

    CREATE TABLE IF NOT EXISTS players (
      id TEXT PRIMARY KEY,
      room_code TEXT NOT NULL,
      name TEXT NOT NULL,
      seat INTEGER NOT NULL,
      claim_token TEXT NOT NULL UNIQUE,
      created_at INTEGER NOT NULL,
      FOREIGN KEY (room_code) REFERENCES rooms(code) ON DELETE CASCADE
    );
    CREATE INDEX IF NOT EXISTS players_room_idx ON players(room_code);

    CREATE TABLE IF NOT EXISTS push_subscriptions (
      id TEXT PRIMARY KEY,
      player_id TEXT NOT NULL,
      endpoint TEXT NOT NULL UNIQUE,
      p256dh TEXT NOT NULL,
      auth TEXT NOT NULL,
      created_at INTEGER NOT NULL,
      FOREIGN KEY (player_id) REFERENCES players(id) ON DELETE CASCADE
    );
    CREATE INDEX IF NOT EXISTS push_player_idx ON push_subscriptions(player_id);
  `);
}

export function closeDb() {
  if (_db) {
    _db.close();
    _db = null;
  }
}
