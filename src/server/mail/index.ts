import "server-only";
import { db, nowIso, tx } from "../db";
import { env, imapReady } from "../env";
import { DAY, HOUR, LIMITS, MIN_COMPOSE_MS, RATE, elliotAddresses } from "./config";
import { adminMail, testMail, visitorMail, messageIdFor, type MailThread } from "./compose";
import { TOKEN_RE, decryptToken, encryptToken, hashToken, newId, newToken, saltedHash } from "./crypto";
import { takeRate, type Limit } from "./rate";
import {
  STATUSES,
  emailMarkedSpam,
  insertMessage,
  ipMarkedSpam,
  messageIdsOf,
  messagesOf,
  threadById,
  threadByTokenHash,
  type MessageDb,
  type ThreadDb,
  type ThreadStatus,
} from "./store";
import { canSend, deliver, lastSmtpError } from "./transport";
import { cleanBody, cleanEmail, cleanLang, cleanLine } from "./validate";
import { syncStatus } from "./sync";

/**
 * The mail module's API: what the site's Mail app (visitor side, through
 * /api/mail/*) and the admin panel call. Mail goes out through SMTP
 * (Proton Mail Bridge); replies written in Proton come back through the
 * IMAP poller (sync.ts). Bodies are plain text, always.
 *
 * Nothing here ever emails an address a visitor typed, except Elliot's own
 * deliberate reply (adminReply): no confirmations, no copies, so the form
 * can't be used to send mail to anyone else.
 */

export type { ThreadStatus } from "./store";
export type MessageRow = { id: string; direction: "in" | "out"; body: string; source: "site" | "admin" | "imap"; createdAt: string; error?: string };
export type ThreadRow = {
  id: string;
  name: string;
  email: string;
  subject: string;
  lang: "en" | "fr";
  status: ThreadStatus;
  createdAt: string;
  lastAt: string;
  adminUnread: number;
  messages?: MessageRow[];
};
export type VisitorThread = Omit<ThreadRow, "email" | "adminUnread"> & { messages: MessageRow[]; visitorUnread: number };

type Fail<E extends string> = { ok: false; error: E };

const toMessage = (m: MessageDb): MessageRow => ({
  id: m.id,
  direction: m.direction,
  body: m.body,
  source: m.source,
  createdAt: m.created_at,
  ...(m.error ? { error: m.error } : {}),
});

const toThread = (t: ThreadDb): ThreadRow => ({
  id: t.id,
  name: t.name,
  email: t.email,
  subject: t.subject,
  lang: t.lang,
  status: t.status,
  createdAt: t.created_at,
  lastAt: t.last_at,
  adminUnread: t.admin_unread,
});

const mailThread = (t: ThreadDb): MailThread => ({ id: t.id, name: t.name, email: t.email, subject: t.subject, lang: t.lang });

/** the latest letter from the visitor, quoted under an admin reply */
function lastIn(threadId: string) {
  const m = db()
    .prepare(`SELECT body, created_at FROM messages WHERE thread_id = ? AND direction = 'in' ORDER BY created_at DESC, rowid DESC LIMIT 1`)
    .get(threadId) as { body: string; created_at: string } | undefined;
  return m ? { body: m.body, at: m.created_at } : undefined;
}

function safely<T>(fn: () => T, fallback: T): T {
  try {
    return fn();
  } catch (e) {
    console.error("[mail]", (e as Error)?.message ?? e);
    return fallback;
  }
}

/* ───────────────────────── visitor side ───────────────────────── */

/**
 * A visitor's first letter: checked, rate-limited, emailed to Elliot, then
 * stored as a new thread. The token comes back once; it is the visitor's
 * only key to the thread (kept in their browser, and in Elliot's replies).
 */
export async function sendFromVisitor(input: {
  name?: string;
  email: string;
  subject: string;
  body: string;
  lang: "en" | "fr";
  ip: string;
  ua?: string;
  startedAt?: number;
  honeypot?: string;
}): Promise<{ ok: true; token: string; threadId: string } | Fail<"invalid" | "rate" | "unavailable" | "failed">> {
  if (!canSend()) return { ok: false, error: "unavailable" };
  // bots fill every field, and are fast
  if (input.honeypot) return { ok: false, error: "invalid" };
  if (input.startedAt != null && (!Number.isFinite(input.startedAt) || Date.now() - input.startedAt < MIN_COMPOSE_MS)) {
    return { ok: false, error: "invalid" };
  }
  const email = cleanEmail(input.email);
  const name = cleanLine(input.name, LIMITS.name);
  const subject = cleanLine(input.subject, LIMITS.subject);
  const body = cleanBody(input.body);
  const lang = cleanLang(input.lang);
  if (email == null || name == null || subject == null || body == null) return { ok: false, error: "invalid" };
  if (elliotAddresses().has(email.toLowerCase())) return { ok: false, error: "invalid" };

  let ipHash: string;
  try {
    ipHash = saltedHash(input.ip || "unknown");
    if (emailMarkedSpam(email) || ipMarkedSpam(ipHash)) return { ok: false, error: "rate" };
    const emailHash = saltedHash(email);
    const limits: Limit[] = [
      { key: `send:ip:h:${ipHash}`, max: RATE.sendPerIpHour, windowMs: HOUR },
      { key: `send:ip:d:${ipHash}`, max: RATE.sendPerIpDay, windowMs: DAY },
      { key: `send:email:d:${emailHash}`, max: RATE.sendPerEmailDay, windowMs: DAY },
      { key: `global:d`, max: RATE.globalDay, windowMs: DAY },
    ];
    if (!takeRate(limits)) return { ok: false, error: "rate" };
  } catch (e) {
    console.error("[mail] database unavailable:", (e as Error)?.message ?? e);
    return { ok: false, error: "failed" };
  }

  const token = newToken();
  const thread: ThreadDb = {
    id: newId(8),
    token_hash: hashToken(token),
    token_enc: encryptToken(token),
    name,
    email,
    subject,
    lang,
    status: "open",
    ip_hash: ipHash,
    created_at: "",
    last_at: "",
    admin_unread: 1,
    visitor_unread: 0,
  };
  const msgId = newId();
  const sent = await deliver(visitorMail(mailThread(thread), { id: msgId, body }, []));
  if (!sent.ok) return { ok: false, error: sent.error === "unavailable" ? "unavailable" : "failed" };

  try {
    const at = nowIso();
    tx((d) => {
      d.prepare(
        `INSERT INTO threads (id, token_hash, token_enc, name, email, subject, lang, status, ip_hash, created_at, last_at, admin_unread, visitor_unread)
         VALUES (@id, @token_hash, @token_enc, @name, @email, @subject, @lang, @status, @ip_hash, @at, @at, 1, 0)`
      ).run({ ...thread, at });
      insertMessage({
        id: msgId,
        thread_id: thread.id,
        direction: "in",
        body,
        message_id: messageIdFor(msgId),
        in_reply_to: null,
        source: "site",
        created_at: at,
        sent_at: at,
      });
    });
  } catch (e) {
    // the email reached Elliot; only the copy on the site is missing
    console.error("[mail] sent but not stored:", (e as Error)?.message ?? e);
    return { ok: false, error: "failed" };
  }
  return { ok: true, token, threadId: thread.id };
}

/**
 * The visitor's view of a thread (never their own address back), or null
 * when the token names none. Throws if the database can't be read, so a
 * caller can tell "not on file" from "try again later".
 */
export function visitorThread(token: string): VisitorThread | null {
  if (typeof token !== "string" || !TOKEN_RE.test(token)) return null;
  const t = threadByTokenHash(hashToken(token));
  if (!t) return null;
  // a send error is the admin's business, not the visitor's
  const messages = messagesOf(t.id).map((m) => toMessage({ ...m, error: null }));
  return {
    id: t.id,
    name: t.name,
    subject: t.subject,
    lang: t.lang,
    // the visitor sees only whose turn it is (never "archived" or "spam")
    status: messages[messages.length - 1]?.direction === "out" ? "answered" : "open",
    createdAt: t.created_at,
    lastAt: t.last_at,
    visitorUnread: t.visitor_unread,
    messages,
  };
}

/** the visitor opened the thread: Elliot's replies are read */
export function markVisitorRead(token: string) {
  if (typeof token !== "string" || !TOKEN_RE.test(token)) return;
  safely(() => db().prepare(`UPDATE threads SET visitor_unread = 0 WHERE token_hash = ?`).run(hashToken(token)), undefined);
}

/** A reply written on the site: emailed to Elliot (threaded), then added to the thread. */
export async function visitorReply(
  token: string,
  body: string,
  ip: string
): Promise<{ ok: true } | Fail<"invalid" | "rate" | "unavailable" | "failed" | "notfound">> {
  if (typeof token !== "string" || !TOKEN_RE.test(token)) return { ok: false, error: "notfound" };
  if (!canSend()) return { ok: false, error: "unavailable" };
  const text = cleanBody(body);
  if (text == null) return { ok: false, error: "invalid" };

  let t: ThreadDb | undefined;
  try {
    t = threadByTokenHash(hashToken(token));
    if (!t) return { ok: false, error: "notfound" };
    if (t.status === "spam") return { ok: false, error: "rate" };
    const ipHash = saltedHash(ip || "unknown");
    const limits: Limit[] = [
      { key: `reply:ip:h:${ipHash}`, max: RATE.replyPerIpHour, windowMs: HOUR },
      { key: `reply:ip:d:${ipHash}`, max: RATE.replyPerIpDay, windowMs: DAY },
      { key: `reply:thread:d:${t.id}`, max: RATE.replyPerThreadDay, windowMs: DAY },
      { key: `global:d`, max: RATE.globalDay, windowMs: DAY },
    ];
    if (!takeRate(limits)) return { ok: false, error: "rate" };
  } catch (e) {
    console.error("[mail] database unavailable:", (e as Error)?.message ?? e);
    return { ok: false, error: "failed" };
  }

  const prior = messageIdsOf(t.id);
  const msgId = newId();
  const sent = await deliver(visitorMail(mailThread(t), { id: msgId, body: text }, prior));
  if (!sent.ok) return { ok: false, error: sent.error === "unavailable" ? "unavailable" : "failed" };

  const thread = t;
  try {
    const at = nowIso();
    tx((d) => {
      insertMessage({
        id: msgId,
        thread_id: thread.id,
        direction: "in",
        body: text,
        message_id: messageIdFor(msgId),
        in_reply_to: prior[prior.length - 1] ?? null,
        source: "site",
        created_at: at,
        sent_at: at,
      });
      // the ball is in Elliot's court again (an archived thread comes back to the inbox)
      d.prepare(`UPDATE threads SET status = 'open', last_at = ?, admin_unread = admin_unread + 1 WHERE id = ?`).run(at, thread.id);
    });
  } catch (e) {
    console.error("[mail] sent but not stored:", (e as Error)?.message ?? e);
    return { ok: false, error: "failed" };
  }
  return { ok: true };
}

/* ───────────────────────── admin side ───────────────────────── */

/** threads, newest activity first; "inbox" = open + answered; no filter = all but spam */
export function listThreads(filter?: { status?: ThreadStatus | "inbox" }): ThreadRow[] {
  const s = filter?.status;
  const statuses: ThreadStatus[] = s === "inbox" ? ["open", "answered"] : s && STATUSES.includes(s) ? [s] : ["open", "answered", "archived"];
  return db()
    .prepare(`SELECT * FROM threads WHERE status IN (${statuses.map(() => "?").join(", ")}) ORDER BY last_at DESC LIMIT 500`)
    .all(...statuses)
    .map((t) => toThread(t as ThreadDb));
}

export function getThread(id: string): ThreadRow | null {
  const t = threadById(id);
  if (!t) return null;
  return { ...toThread(t), messages: messagesOf(t.id).map(toMessage) };
}

export function markThreadRead(id: string) {
  db().prepare(`UPDATE threads SET admin_unread = 0 WHERE id = ?`).run(id);
}

export function setThreadStatus(id: string, status: ThreadStatus) {
  if (!STATUSES.includes(status)) throw new Error(`unknown status: ${status}`);
  db().prepare(`UPDATE threads SET status = ? WHERE id = ?`).run(status, id);
}

/**
 * Elliot's reply from the admin panel: to the visitor, threaded under
 * their last letter, with their private link to the thread in the footer.
 * The copy Proton files in Sent is recognised by the poller and skipped.
 */
export async function adminReply(threadId: string, body: string): Promise<{ ok: true } | { ok: false; error: string }> {
  const t = threadById(threadId);
  if (!t) return { ok: false, error: "notfound" };
  if (!canSend()) return { ok: false, error: "unavailable" };
  const text = cleanBody(body, 50_000);
  if (text == null) return { ok: false, error: "invalid" };
  const prior = messageIdsOf(t.id);
  const msgId = newId();
  const token = decryptToken(t.token_enc);
  const sent = await deliver(adminMail(mailThread(t), { id: msgId, body: text }, prior, token, lastIn(t.id)));
  if (!sent.ok) return { ok: false, error: sent.error };
  try {
    storeAdminReply(t, msgId, text, prior);
  } catch (e) {
    console.error("[mail] sent but not stored:", (e as Error)?.message ?? e);
    return { ok: false, error: "sent, but couldn't be saved on the site" };
  }
  return { ok: true };
}

function storeAdminReply(t: ThreadDb, msgId: string, text: string, prior: string[]) {
  const at = nowIso();
  tx((d) => {
    insertMessage({
      id: msgId,
      thread_id: t.id,
      direction: "out",
      body: text,
      message_id: messageIdFor(msgId),
      in_reply_to: prior[prior.length - 1] ?? null,
      source: "admin",
      created_at: at,
      sent_at: at,
    });
    d.prepare(
      `UPDATE threads SET status = 'answered', last_at = ?, admin_unread = 0, visitor_unread = visitor_unread + 1 WHERE id = ?`
    ).run(at, t.id);
  });
}

export function mailHealth(): { smtp: boolean; imap: boolean; lastSync?: string; lastError?: string } {
  const sync = syncStatus();
  const smtpErr = lastSmtpError();
  const errors = [
    sync.lastError ? { at: sync.lastErrorAt ?? "", message: `imap ${sync.lastError}` } : null,
    smtpErr ? { at: smtpErr.at, message: `smtp: ${smtpErr.message}` } : null,
  ].filter((e): e is { at: string; message: string } => Boolean(e));
  errors.sort((a, b) => b.at.localeCompare(a.at));
  return {
    smtp: canSend(),
    imap: imapReady(),
    ...(sync.lastSync ? { lastSync: sync.lastSync } : {}),
    ...(errors[0] ? { lastError: errors[0].message } : {}),
  };
}

/** a test message to env.mailTo, for the admin panel's System/Mail view */
export async function sendTestEmail(): Promise<{ ok: boolean; error?: string }> {
  if (!canSend()) return { ok: false, error: "SMTP isn't configured (SMTP_HOST, SMTP_USER, SMTP_PASS)" };
  const r = await deliver(testMail());
  return r.ok ? { ok: true } : { ok: false, error: r.error };
}

export { startMailSync } from "./sync";

/** where mail goes, for display in the admin panel */
export const mailAddresses = () => ({ to: env.mailTo, from: env.mailFrom });
