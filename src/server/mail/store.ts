import "server-only";
import { db } from "../db";

/** Row shapes and the few queries every part of the mail module shares. */

export type ThreadStatus = "open" | "answered" | "archived" | "spam";
export type Direction = "in" | "out";
export type Source = "site" | "admin" | "imap";

export type ThreadDb = {
  id: string;
  token_hash: string;
  token_enc: string;
  name: string;
  email: string;
  subject: string;
  lang: "en" | "fr";
  status: ThreadStatus;
  ip_hash: string | null;
  created_at: string;
  last_at: string;
  admin_unread: number;
  visitor_unread: number;
};

export type MessageDb = {
  id: string;
  thread_id: string;
  direction: Direction;
  body: string;
  message_id: string;
  in_reply_to: string | null;
  source: Source;
  created_at: string;
  sent_at: string | null;
  error: string | null;
};

export const STATUSES: ThreadStatus[] = ["open", "answered", "archived", "spam"];

export function threadById(id: string) {
  return db().prepare(`SELECT * FROM threads WHERE id = ?`).get(id) as ThreadDb | undefined;
}

export function threadByTokenHash(hash: string) {
  return db().prepare(`SELECT * FROM threads WHERE token_hash = ?`).get(hash) as ThreadDb | undefined;
}

export function messagesOf(threadId: string) {
  return db().prepare(`SELECT * FROM messages WHERE thread_id = ? ORDER BY created_at, rowid`).all(threadId) as MessageDb[];
}

/** the thread's Message-IDs, oldest first: In-Reply-To is the last, References all of them */
export function messageIdsOf(threadId: string) {
  return (db().prepare(`SELECT message_id FROM messages WHERE thread_id = ? ORDER BY created_at, rowid`).all(threadId) as { message_id: string }[]).map(
    (r) => r.message_id
  );
}

export function messageByMessageId(messageId: string) {
  return db().prepare(`SELECT * FROM messages WHERE message_id = ?`).get(messageId) as MessageDb | undefined;
}

/** remember that a Message-ID belongs to a thread (and, when known, which letter it names) */
export function addRef(messageId: string, threadId: string, messageRow: string | null = null) {
  db().prepare(`INSERT OR IGNORE INTO mail_refs (message_id, thread_id, message_row) VALUES (?, ?, ?)`).run(messageId, threadId, messageRow);
}

/** the latest of the letters these Message-IDs name, in one thread */
export function latestNamed(threadId: string, refs: string[]) {
  if (!refs.length) return null;
  const row = db()
    .prepare(
      `SELECT MAX(m.created_at) AS at FROM mail_refs r JOIN messages m ON m.id = r.message_row
       WHERE r.thread_id = ? AND r.message_id IN (${refs.map(() => "?").join(", ")})`
    )
    .get(threadId, ...refs) as { at: string | null };
  return row.at;
}

/** the thread any of these Message-IDs belongs to (the latest reference wins) */
export function threadForRefs(refs: string[]) {
  const get = db().prepare(`SELECT t.* FROM mail_refs r JOIN threads t ON t.id = r.thread_id WHERE r.message_id = ?`);
  for (let i = refs.length - 1; i >= 0; i--) {
    const t = get.get(refs[i]) as ThreadDb | undefined;
    if (t) return t;
  }
  return undefined;
}

export function insertMessage(m: Omit<MessageDb, "error"> & { error?: string | null }) {
  const d = db();
  d.prepare(
    `INSERT INTO messages (id, thread_id, direction, body, message_id, in_reply_to, source, created_at, sent_at, error)
     VALUES (@id, @thread_id, @direction, @body, @message_id, @in_reply_to, @source, @created_at, @sent_at, @error)`
  ).run({ error: null, ...m });
  addRef(m.message_id, m.thread_id, m.id);
}

/** whether an address has written before and been marked as spam */
export function emailMarkedSpam(email: string) {
  return Boolean(db().prepare(`SELECT 1 FROM threads WHERE email = ? COLLATE NOCASE AND status = 'spam' LIMIT 1`).get(email));
}

export function ipMarkedSpam(ipHash: string) {
  return Boolean(db().prepare(`SELECT 1 FROM threads WHERE ip_hash = ? AND status = 'spam' LIMIT 1`).get(ipHash));
}

/** threads that address writes from (case-insensitive), newest first */
export function threadsByEmail(email: string) {
  return db().prepare(`SELECT * FROM threads WHERE email = ? COLLATE NOCASE ORDER BY last_at DESC`).all(email) as ThreadDb[];
}

export function hasThreadFor(email: string) {
  return Boolean(db().prepare(`SELECT 1 FROM threads WHERE email = ? COLLATE NOCASE LIMIT 1`).get(email));
}
