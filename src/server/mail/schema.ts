import type { Migration } from "../db/types";

/**
 * Mail tables (threads, messages, IMAP sync state). Owned by the mail module.
 *
 * - threads: one per conversation a visitor starts. The visitor's link
 *   token is stored twice: as a sha256 (lookups) and AES-256-GCM encrypted
 *   (so an admin reply can carry the link again). The email address is
 *   never sent to the browser.
 * - messages: every letter in a thread, both ways, stored as plain text.
 *   `message_id` is the RFC 5322 Message-ID, unique across all mail.
 * - mail_refs: every Message-ID known to belong to a thread (ours, and the
 *   ones Proton gives the same letters on its side), so a reply's
 *   In-Reply-To/References find their thread even if an id was rewritten;
 *   `message_row` is the letter it names, when we have it.
 * - mail_sync: per-mailbox IMAP position (UIDVALIDITY + last UID seen).
 * - mail_rate: fixed-window counters for the abuse limits.
 * - mail_senders: who sent each letter from the site, for Elliot to judge
 *   abuse by: the IP, its reverse DNS and network (`network`, JSON, looked
 *   up after arrival), and `info` (JSON: Cloudflare's location, every
 *   request header but cookies, what the browser said about itself and the
 *   visit). Kept 90 days (SENDER_DAYS), then forgotten; the thread keeps
 *   only its salted IP hash.
 * - mail_kv: small internal values (a generated secret when SESSION_SECRET
 *   isn't set, so tokens and IP hashes still have a key; how the last SMTP
 *   send went).
 */
export const mailMigrations: Migration[] = [
  {
    id: "mail-001",
    up: `
      CREATE TABLE threads (
        id TEXT PRIMARY KEY,
        token_hash TEXT NOT NULL UNIQUE,
        token_enc TEXT NOT NULL,
        name TEXT NOT NULL DEFAULT '',
        email TEXT NOT NULL,
        subject TEXT NOT NULL DEFAULT '',
        lang TEXT NOT NULL DEFAULT 'en' CHECK (lang IN ('en', 'fr')),
        status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'answered', 'archived', 'spam')),
        ip_hash TEXT,
        created_at TEXT NOT NULL,
        last_at TEXT NOT NULL,
        admin_unread INTEGER NOT NULL DEFAULT 0,
        visitor_unread INTEGER NOT NULL DEFAULT 0
      );
      CREATE INDEX threads_status_last ON threads (status, last_at DESC);
      CREATE INDEX threads_email ON threads (email COLLATE NOCASE);

      CREATE TABLE messages (
        id TEXT PRIMARY KEY,
        thread_id TEXT NOT NULL REFERENCES threads (id) ON DELETE CASCADE,
        direction TEXT NOT NULL CHECK (direction IN ('in', 'out')),
        body TEXT NOT NULL,
        message_id TEXT NOT NULL UNIQUE,
        in_reply_to TEXT,
        source TEXT NOT NULL CHECK (source IN ('site', 'admin', 'imap')),
        created_at TEXT NOT NULL,
        sent_at TEXT,
        error TEXT
      );
      CREATE INDEX messages_thread ON messages (thread_id, created_at);

      CREATE TABLE mail_refs (
        message_id TEXT PRIMARY KEY,
        thread_id TEXT NOT NULL REFERENCES threads (id) ON DELETE CASCADE,
        message_row TEXT REFERENCES messages (id) ON DELETE SET NULL
      );
      CREATE INDEX mail_refs_thread ON mail_refs (thread_id);

      CREATE TABLE mail_sync (
        mailbox TEXT PRIMARY KEY,
        uidvalidity INTEGER,
        last_uid INTEGER NOT NULL DEFAULT 0,
        last_run TEXT,
        last_error TEXT
      );

      CREATE TABLE mail_rate (
        key TEXT PRIMARY KEY,
        count INTEGER NOT NULL,
        window_start INTEGER NOT NULL
      );

      CREATE TABLE mail_kv (
        key TEXT PRIMARY KEY,
        value TEXT NOT NULL
      );
    `,
  },
  {
    id: "mail-002",
    up: `
      CREATE TABLE mail_senders (
        message_id TEXT PRIMARY KEY REFERENCES messages (id) ON DELETE CASCADE,
        ip TEXT NOT NULL,
        country TEXT,
        host TEXT,
        network TEXT,
        info TEXT NOT NULL,
        turnstile TEXT NOT NULL DEFAULT 'off' CHECK (turnstile IN ('passed', 'off')),
        created_at TEXT NOT NULL
      );
      CREATE INDEX mail_senders_created ON mail_senders (created_at);
    `,
  },
];
