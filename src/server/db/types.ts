import type Database from "better-sqlite3";

/** One forward-only migration. `id` is namespaced by module: "content-001", "auth-001", "mail-001". */
export type Migration = { id: string; up: string | ((d: Database.Database) => void) };
/** Fills an empty table with starting data; must be idempotent (check before inserting). */
export type Seed = (d: Database.Database) => void;
