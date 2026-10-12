import "server-only";
import type { SendMailOptions } from "nodemailer";
import { db, nowIso } from "../db";
import { adminMail, visitorMail, type MailThread } from "./compose";
import { decryptToken } from "./crypto";
import { messagesOf, threadById, type MessageDb, type ThreadDb } from "./store";
import { canSend, deliver } from "./transport";

/**
 * The outbox: a letter is stored first (that is when the site says "sent"),
 * then emailed in the background. The moment it is in the database it is
 * certain to go: a send that fails (Bridge restarting, a network blip) is
 * retried with backoff, every minute at first, then every few minutes, for
 * three days, rebuilding the same email (same Message-ID, so a retry can't
 * produce a second, different copy). The admin sees an undelivered letter
 * with its error until it goes.
 *
 * Covers the two letters the site sends: a visitor's (to Elliot) and
 * Elliot's admin reply (to the visitor).
 */

export const mailThread = (t: ThreadDb): MailThread => ({ id: t.id, name: t.name, email: t.email, subject: t.subject, lang: t.lang });

/** the latest letter from the visitor before `before` (an ISO time), quoted under an admin reply */
export function lastIn(threadId: string, before?: string) {
  const m = db()
    .prepare(
      `SELECT body, created_at FROM messages WHERE thread_id = ? AND direction = 'in' ${before ? "AND created_at < ?" : ""} ORDER BY created_at DESC, rowid DESC LIMIT 1`
    )
    .get(...(before ? [threadId, before] : [threadId])) as { body: string; created_at: string } | undefined;
  return m ? { body: m.body, at: m.created_at } : undefined;
}

/** the email for a stored message, as it was (or would have been) sent */
function mailFor(m: MessageDb): SendMailOptions | null {
  const t = threadById(m.thread_id);
  if (!t) return null;
  const all = messagesOf(t.id);
  const idx = all.findIndex((x) => x.id === m.id);
  const prior = (idx < 0 ? all : all.slice(0, idx)).map((x) => x.message_id);
  if (m.direction === "in" && m.source === "site") return visitorMail(mailThread(t), { id: m.id, body: m.body }, prior);
  if (m.direction === "out" && m.source === "admin") {
    return adminMail(mailThread(t), { id: m.id, body: m.body }, prior, decryptToken(t.token_enc), lastIn(t.id, m.created_at));
  }
  return null;
}

type Outbox = {
  started: boolean;
  inflight: Set<string>;
  tries: Map<string, { n: number; at: number }>;
  /** queued sends still running (tests wait on them) */
  running: Set<Promise<boolean>>;
  timer?: ReturnType<typeof setTimeout>;
};
const g = globalThis as unknown as { __emosOutbox?: Outbox };
const box = (g.__emosOutbox ??= { started: false, inflight: new Set(), tries: new Map(), running: new Set() });

const MAX_AGE = 3 * 86_400_000;
/** wait before the nth retry: 1, 2, 5, 10, then 30 minutes */
const backoff = (n: number) => [60_000, 120_000, 300_000, 600_000][n - 1] ?? 1_800_000;

/** email one stored message now; true once it has gone (or needn't) */
export async function deliverStored(id: string): Promise<boolean> {
  if (box.inflight.has(id)) return false;
  box.inflight.add(id);
  try {
    const m = db().prepare(`SELECT * FROM messages WHERE id = ?`).get(id) as MessageDb | undefined;
    if (!m || m.sent_at) return true;
    const mail = mailFor(m);
    if (!mail) {
      db().prepare(`UPDATE messages SET error = ? WHERE id = ?`).run("can't be rebuilt for sending", id);
      return false;
    }
    const r = await deliver(mail);
    if (r.ok) {
      db().prepare(`UPDATE messages SET sent_at = ?, error = NULL WHERE id = ?`).run(nowIso(), id);
      box.tries.delete(id);
      return true;
    }
    db().prepare(`UPDATE messages SET error = ? WHERE id = ?`).run(r.error, id);
    const prev = box.tries.get(id);
    box.tries.set(id, { n: (prev?.n ?? 0) + 1, at: Date.now() });
    schedule(backoff(box.tries.get(id)!.n));
    return false;
  } catch (e) {
    console.error("[mail] outbox:", (e as Error)?.message ?? e);
    return false;
  } finally {
    box.inflight.delete(id);
  }
}

/** queue a freshly stored message: it goes out right away, in the background */
export function queue(id: string) {
  const p = deliverStored(id);
  box.running.add(p);
  void p.finally(() => box.running.delete(p));
}

/** resolves once every queued send has finished (for tests) */
export async function settled() {
  await Promise.allSettled([...box.running]);
}

/** the letters still waiting, oldest first, whose next try is due */
function due(now = Date.now()) {
  const since = new Date(now - MAX_AGE).toISOString();
  const rows = db()
    .prepare(`SELECT id FROM messages WHERE sent_at IS NULL AND source IN ('site', 'admin') AND created_at > ? ORDER BY created_at`)
    .all(since) as { id: string }[];
  return rows
    .map((r) => r.id)
    .filter((id) => {
      const t = box.tries.get(id);
      return !t || now - t.at >= backoff(t.n);
    });
}

async function sweep() {
  if (!canSend()) return schedule(300_000);
  try {
    for (const id of due()) await deliverStored(id);
  } catch (e) {
    console.error("[mail] outbox sweep:", (e as Error)?.message ?? e);
  }
  schedule(60_000);
}

function schedule(ms: number) {
  if (!box.started) return;
  clearTimeout(box.timer);
  box.timer = setTimeout(() => void sweep(), ms);
  box.timer.unref?.();
}

/** boot: resend anything left waiting (a restart mid-send), then keep watch */
export function startOutbox() {
  if (box.started) return;
  box.started = true;
  schedule(10_000);
}
