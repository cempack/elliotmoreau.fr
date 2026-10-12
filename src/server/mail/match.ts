import "server-only";
import type { AddressObject, ParsedMail } from "mailparser";
import { db, tx } from "../db";
import { elliotAddresses } from "./config";
import { mailSubject } from "./compose";
import { newId } from "./crypto";
import { addRef, insertMessage, latestNamed, messageByMessageId, threadForRefs, threadsByEmail, type ThreadDb } from "./store";
import { normalizeBody, normalizeSubject, stripQuoted } from "./strip";

/**
 * What the IMAP poller does with one message read back from Proton.
 *
 * From Sent ("sent"): Elliot's replies, written in Proton (or the copies
 * of the ones the admin panel sent). From the inbox ("inbox"): visitors
 * answering Elliot's emails, and the copies of our own notifications.
 *
 * A message joins a thread when its In-Reply-To/References name one of the
 * thread's Message-IDs (mail_refs), or failing that, when it goes to (Sent)
 * or comes from (inbox) the thread's address with the same subject. It is
 * stored only if it really is that conversation: from Sent it must be
 * addressed to the visitor; from the inbox it must come from the visitor.
 * Copies of our own mail (X-Emos-Message, or a Message-ID we know) only
 * teach us the id Proton gave them. The same letter seen twice (the admin
 * reply and its Sent copy) is caught by Message-ID, then by the same
 * normalised text in the same thread within 15 minutes of each other.
 */

export type Incoming = {
  messageId: string;
  inReplyTo?: string;
  references: string[];
  /** lowercased addresses */
  from?: string;
  to: string[];
  subject: string;
  date: Date;
  text: string;
  emosThread?: string;
  emosMessage?: string;
};

export type Outcome = "stored" | "duplicate" | "ours" | "ignored";

const DEDUPE_MS = 15 * 60_000;

const bracket = (id: string) => {
  const s = id.trim();
  if (!s) return "";
  return s.startsWith("<") ? s : `<${s}>`;
};

function addresses(a?: AddressObject | AddressObject[]) {
  const list = Array.isArray(a) ? a : a ? [a] : [];
  return list
    .flatMap((o) => o.value)
    .flatMap((v) => (v.group ? v.group : [v]))
    .map((v) => (v.address ?? "").trim().toLowerCase())
    .filter(Boolean);
}

/** mailparser's result → what `ingest` needs; `fallbackId` stands in for a missing Message-ID */
export function toIncoming(p: ParsedMail, fallbackId: string, internalDate?: Date): Incoming {
  const refs = Array.isArray(p.references) ? p.references : p.references ? p.references.split(/\s+/) : [];
  const header = (k: string) => {
    const v = p.headers.get(k);
    return typeof v === "string" && v.trim() ? v.trim() : undefined;
  };
  const date = p.date && !Number.isNaN(p.date.getTime()) ? p.date : (internalDate ?? new Date());
  return {
    messageId: bracket(p.messageId ?? "") || bracket(fallbackId),
    inReplyTo: p.inReplyTo ? bracket(p.inReplyTo.split(/\s+/)[0]) : undefined,
    references: refs.map(bracket).filter(Boolean),
    from: addresses(p.from)[0],
    to: [...addresses(p.to), ...addresses(p.cc)],
    subject: p.subject ?? "",
    date,
    text: p.text ?? "",
    emosThread: header("x-emos-thread"),
    emosMessage: header("x-emos-message") ? bracket(header("x-emos-message")!) : undefined,
  };
}

/** same address, same subject, the most recent conversation that started before this message */
function bySubject(email: string, subject: string, date: Date) {
  const want = normalizeSubject(subject);
  if (!want) return undefined;
  return threadsByEmail(email).find(
    (t) => t.status !== "spam" && normalizeSubject(mailSubject(t)) === want && new Date(t.created_at).getTime() <= date.getTime() + 60_000
  );
}

/** the stored letter this one is a copy of, if any */
function sameLetter(threadId: string, direction: "in" | "out", body: string, date: Date) {
  const want = normalizeBody(body);
  const rows = db()
    .prepare(`SELECT id, body, created_at FROM messages WHERE thread_id = ? AND direction = ?`)
    .all(threadId, direction) as { id: string; body: string; created_at: string }[];
  return rows.find((r) => Math.abs(new Date(r.created_at).getTime() - date.getTime()) <= DEDUPE_MS && normalizeBody(r.body) === want)?.id;
}

export function ingest(kind: "sent" | "inbox", m: Incoming, now = new Date()): Outcome {
  if (!m.messageId) return "ignored";
  if (messageByMessageId(m.messageId)) return "duplicate";

  // a copy of our own mail: remember the id Proton gave it, nothing else
  if (m.emosMessage) {
    const ours = messageByMessageId(m.emosMessage);
    if (ours) {
      addRef(m.messageId, ours.thread_id, ours.id);
      return "ours";
    }
    return "ignored";
  }

  const refs = [...new Set([...m.references, ...(m.inReplyTo ? [m.inReplyTo] : [])])];
  const viaRefs = threadForRefs(refs);
  let thread: ThreadDb | undefined = viaRefs;
  if (!thread) {
    if (kind === "sent") {
      for (const to of m.to) {
        thread = bySubject(to, m.subject, m.date);
        if (thread) break;
      }
    } else if (m.from) thread = bySubject(m.from, m.subject, m.date);
  }
  if (!thread || thread.status === "spam") return "ignored";

  const email = thread.email.toLowerCase();
  const elliot = elliotAddresses();
  if (kind === "sent") {
    // Elliot's reply goes to the visitor (our notifications go to Elliot, and are skipped here)
    if (!m.to.includes(email)) return "ignored";
  } else {
    if (m.from !== email || elliot.has(m.from)) return "ignored";
  }

  const direction = kind === "sent" ? "out" : "in";
  const body = stripQuoted(m.text);
  if (!body) {
    addRef(m.messageId, thread.id);
    return "ignored";
  }

  // a date in the future is a wrong clock; never let it jump ahead of now
  const at = m.date.getTime() > now.getTime() + 5 * 60_000 ? now : m.date;
  const copyOf = sameLetter(thread.id, direction, body, at);
  if (copyOf) {
    addRef(m.messageId, thread.id, copyOf);
    return "duplicate";
  }

  const t = thread;
  tx(() => {
    // a reply never sorts before the letter it answers (Date headers only have whole seconds)
    const parent = latestNamed(t.id, refs);
    const createdAt = parent && parent >= at.toISOString() ? new Date(new Date(parent).getTime() + 1).toISOString() : at.toISOString();
    insertMessage({
      id: newId(),
      thread_id: t.id,
      direction,
      body: body.slice(0, 50_000),
      message_id: m.messageId,
      in_reply_to: m.inReplyTo ?? null,
      source: "imap",
      created_at: createdAt,
      sent_at: createdAt,
    });
    for (const r of refs) addRef(r, t.id);
    const lastAt = createdAt > t.last_at ? createdAt : t.last_at;
    if (direction === "out") {
      db()
        .prepare(`UPDATE threads SET status = 'answered', last_at = ?, visitor_unread = visitor_unread + 1, admin_unread = 0 WHERE id = ?`)
        .run(lastAt, t.id);
    } else {
      db().prepare(`UPDATE threads SET status = 'open', last_at = ?, admin_unread = admin_unread + 1 WHERE id = ?`).run(lastAt, t.id);
    }
  });
  return "stored";
}

/** quick check on headers alone: is this message worth downloading? */
export function worthFetching(kind: "sent" | "inbox", meta: { from?: string; to: string[]; emos: boolean; refs: string[] }) {
  if (meta.emos) return true;
  if (meta.refs.length && threadForRefs(meta.refs)) return true;
  const known = db().prepare(`SELECT 1 FROM threads WHERE email = ? COLLATE NOCASE AND status != 'spam' LIMIT 1`);
  if (kind === "sent") return meta.to.some((a) => known.get(a));
  return Boolean(meta.from && known.get(meta.from));
}

