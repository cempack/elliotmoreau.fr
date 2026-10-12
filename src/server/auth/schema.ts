import type { Migration } from "../db/types";

/**
 * Admin auth tables. Owned by the admin module.
 *
 * - admin_passkeys: one row per registered passkey (WebAuthn credential).
 *   The public key is the only key material; nothing here can sign in.
 * - admin_sessions: signed-in browsers. Only the sha256 of the cookie's
 *   random value is stored, so a database leak can't be replayed.
 * - admin_challenges: WebAuthn challenges, single use, 5 minutes; a
 *   registration remembers what allowed it (setup token, session, recovery).
 * - admin_recovery: one-time codes (sha256) that allow registering a new
 *   passkey when every device is lost.
 * - admin_rate: failure counters for the progressive lockout.
 * - admin_audit: every sign-in, failure, passkey change and data write.
 * - admin_meta: the WebAuthn user handle (random, fixed).
 */
export const authMigrations: Migration[] = [
  {
    id: "auth-001",
    up: `
      CREATE TABLE admin_passkeys (
        id TEXT PRIMARY KEY,
        public_key BLOB NOT NULL,
        counter INTEGER NOT NULL DEFAULT 0,
        transports TEXT NOT NULL DEFAULT '[]',
        device_type TEXT NOT NULL DEFAULT 'singleDevice',
        backed_up INTEGER NOT NULL DEFAULT 0,
        name TEXT NOT NULL DEFAULT '',
        created_at TEXT NOT NULL,
        last_used_at TEXT
      );
      CREATE TABLE admin_sessions (
        id_hash TEXT PRIMARY KEY,
        passkey_id TEXT,
        created_at TEXT NOT NULL,
        last_seen_at TEXT NOT NULL,
        expires_at INTEGER NOT NULL,
        hard_expires_at INTEGER NOT NULL,
        ua TEXT NOT NULL DEFAULT '',
        ip_hash TEXT NOT NULL DEFAULT ''
      );
      CREATE TABLE admin_challenges (
        id TEXT PRIMARY KEY,
        challenge TEXT NOT NULL,
        kind TEXT NOT NULL CHECK (kind IN ('register', 'login')),
        grant_kind TEXT NOT NULL DEFAULT '',
        expires_at INTEGER NOT NULL
      );
      CREATE TABLE admin_recovery (
        code_hash TEXT PRIMARY KEY,
        created_at TEXT NOT NULL,
        used_at TEXT
      );
      CREATE TABLE admin_rate (
        key TEXT PRIMARY KEY,
        failures INTEGER NOT NULL DEFAULT 0,
        locked_until INTEGER NOT NULL DEFAULT 0,
        updated_at INTEGER NOT NULL
      );
      CREATE TABLE admin_audit (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        at TEXT NOT NULL,
        action TEXT NOT NULL,
        ok INTEGER NOT NULL DEFAULT 1,
        detail TEXT NOT NULL DEFAULT '',
        ip_hash TEXT NOT NULL DEFAULT ''
      );
      CREATE INDEX admin_audit_at ON admin_audit (at DESC);
      CREATE TABLE admin_meta (
        key TEXT PRIMARY KEY,
        value TEXT NOT NULL
      );
    `,
  },
];
