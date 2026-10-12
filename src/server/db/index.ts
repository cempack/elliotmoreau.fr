import "server-only";
import fs from "node:fs";
import path from "node:path";
import Database from "better-sqlite3";
import { env } from "../env";
import { MIGRATIONS, SEEDS } from "./registry";

export type DB = Database.Database;

/**
 * The one SQLite database (better-sqlite3: synchronous, so a query is a
 * plain function call). Opened lazily on first use, WAL mode, foreign keys
 * on, and migrated forward: each module keeps its own ordered migration
 * list (see registry.ts) and every applied id is recorded in _migrations,
 * so a deploy only runs what's new. Seeds run once, on an empty table.
 *
 * Kept on globalThis so dev reloads don't open a second handle.
 */
const g = globalThis as unknown as { __emosDb?: DB };

export function db(): DB {
  if (g.__emosDb) return g.__emosDb;
  fs.mkdirSync(path.dirname(env.databasePath), { recursive: true });
  const d = new Database(env.databasePath);
  d.pragma("journal_mode = WAL");
  d.pragma("foreign_keys = ON");
  d.pragma("busy_timeout = 5000");
  d.pragma("synchronous = NORMAL");
  migrate(d);
  g.__emosDb = d;
  return d;
}

function migrate(d: DB) {
  d.exec(`CREATE TABLE IF NOT EXISTS _migrations (id TEXT PRIMARY KEY, applied_at TEXT NOT NULL DEFAULT (datetime('now')))`);
  const done = new Set((d.prepare(`SELECT id FROM _migrations`).all() as { id: string }[]).map((r) => r.id));
  const mark = d.prepare(`INSERT INTO _migrations (id) VALUES (?)`);
  for (const m of MIGRATIONS) {
    if (done.has(m.id)) continue;
    d.transaction(() => {
      if (typeof m.up === "string") d.exec(m.up);
      else m.up(d);
      mark.run(m.id);
    })();
  }
  for (const seed of SEEDS) seed(d);
}

/** Run `fn` in one transaction (all or nothing). */
export function tx<T>(fn: (d: DB) => T): T {
  const d = db();
  return d.transaction(() => fn(d))();
}

/** ISO timestamp for "now", the format every table stores. */
export const nowIso = () => new Date().toISOString();
