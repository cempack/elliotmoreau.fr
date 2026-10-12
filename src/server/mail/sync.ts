import "server-only";
import { ImapFlow, type FetchMessageObject, type MessageAddressObject } from "imapflow";
import { simpleParser } from "mailparser";
import { db, nowIso } from "../db";
import { env, imapReady } from "../env";
import { tlsFor } from "./config";
import { ingest, toIncoming, worthFetching, type Outcome } from "./match";
import { pruneRates } from "./rate";

/**
 * The IMAP poller: every IMAP_POLL_SECONDS (120 s by default) it signs in
 * to Proton Mail Bridge, reads what is new in Sent (Elliot's replies) and
 * the inbox (visitors answering by email), hands each candidate to
 * `ingest`, and signs out. Its position per mailbox (UIDVALIDITY + last
 * UID) is kept in mail_sync, so a restart picks up where it left off.
 *
 * It must never take the site down: every run is wrapped, the client's
 * 'error' events are handled, and failures back off exponentially (up to
 * 30 minutes) before trying again. startMailSync() is idempotent; boot
 * calls it once (see src/server/boot.ts / src/instrumentation.ts).
 */

type SyncState = { started: boolean; running: boolean; failures: number; timer?: ReturnType<typeof setTimeout> };
const g = globalThis as unknown as { __emosMailSync?: SyncState };
const state = (g.__emosMailSync ??= { started: false, running: false, failures: 0 });

const MAX_BACKOFF = 30 * 60_000;
/** the first look at a mailbox reaches back to the oldest thread, but never further than this */
const FIRST_LOOK_DAYS = 30;
/** larger messages are read only in part (their text comes first) */
const MAX_SOURCE = 4_000_000;

export function startMailSync() {
  if (state.started) return;
  state.started = true;
  if (!imapReady()) {
    console.info("[mail] IMAP isn't configured: replies written in Proton won't appear on the site");
    return;
  }
  schedule(5_000);
}

function schedule(ms: number) {
  clearTimeout(state.timer);
  state.timer = setTimeout(() => void tick(), ms);
  // never keep the process alive just for this
  state.timer.unref?.();
}

async function tick() {
  if (state.running) return;
  state.running = true;
  let ok = false;
  try {
    ok = await syncOnce();
  } catch (e) {
    console.error("[mail] sync failed:", (e as Error)?.message ?? e);
  } finally {
    state.running = false;
  }
  state.failures = ok ? 0 : state.failures + 1;
  const base = env.imap.pollSeconds * 1000;
  const delay = ok ? base : Math.min(MAX_BACKOFF, base * 2 ** Math.min(state.failures, 6));
  // a little jitter so a restart loop doesn't hammer Bridge in lockstep
  schedule(Math.round(delay * (0.9 + Math.random() * 0.2)));
}

type SyncRow = { mailbox: string; uidvalidity: number | null; last_uid: number; last_run: string | null; last_error: string | null };

function syncRow(mailbox: string) {
  return db().prepare(`SELECT * FROM mail_sync WHERE mailbox = ?`).get(mailbox) as SyncRow | undefined;
}

function saveRow(mailbox: string, patch: { uidvalidity?: number; last_uid?: number; error?: string | null }) {
  const cur = syncRow(mailbox);
  db()
    .prepare(
      `INSERT INTO mail_sync (mailbox, uidvalidity, last_uid, last_run, last_error) VALUES (@mailbox, @uidvalidity, @last_uid, @last_run, @last_error)
       ON CONFLICT (mailbox) DO UPDATE SET uidvalidity = excluded.uidvalidity, last_uid = excluded.last_uid, last_run = excluded.last_run, last_error = excluded.last_error`
    )
    .run({
      mailbox,
      uidvalidity: patch.uidvalidity ?? cur?.uidvalidity ?? null,
      last_uid: patch.last_uid ?? cur?.last_uid ?? 0,
      last_run: nowIso(),
      last_error: patch.error === undefined ? (cur?.last_error ?? null) : patch.error,
    });
}

/** "References: <a> <b>" and our X-Emos-* lines, from a FETCH of selected header fields */
export function parseHeaderBlock(buf?: Buffer) {
  const out = new Map<string, string>();
  if (!buf) return out;
  const unfolded = buf.toString("utf8").replace(/\r?\n[ \t]+/g, " ");
  for (const line of unfolded.split(/\r?\n/)) {
    const i = line.indexOf(":");
    if (i > 0) out.set(line.slice(0, i).trim().toLowerCase(), line.slice(i + 1).trim());
  }
  return out;
}

const addr = (list?: MessageAddressObject[]) => (list ?? []).map((a) => (a.address ?? "").toLowerCase()).filter(Boolean);
const ids = (s?: string) => (s ? s.match(/<[^<>\s]+>/g) ?? [] : []);

async function readSource(client: ImapFlow, uid: number, size = 0): Promise<Buffer | null> {
  if (size && size <= MAX_SOURCE) {
    const msg = await client.fetchOne(String(uid), { source: true }, { uid: true });
    return msg && msg.source ? msg.source : null;
  }
  const dl = await client.download(String(uid), undefined, { uid: true, maxBytes: MAX_SOURCE });
  if (!dl.content) return null;
  const chunks: Buffer[] = [];
  for await (const c of dl.content) chunks.push(c as Buffer);
  return Buffer.concat(chunks);
}

/** the oldest thread still worth matching, so a first look doesn't read years of mail */
function firstLookSince() {
  const floor = Date.now() - FIRST_LOOK_DAYS * 86_400_000;
  const row = db().prepare(`SELECT MIN(created_at) AS at FROM threads WHERE status != 'spam'`).get() as { at: string | null };
  const oldest = row.at ? new Date(row.at).getTime() - 86_400_000 : Date.now() - 86_400_000;
  return new Date(Math.max(floor, oldest));
}

async function syncMailbox(client: ImapFlow, kind: "sent" | "inbox", path: string) {
  const counts: Record<Outcome, number> = { stored: 0, duplicate: 0, ours: 0, ignored: 0 };
  const lock = await client.getMailboxLock(path, { readOnly: true });
  try {
    const mb = client.mailbox;
    if (!mb) throw new Error(`couldn't open ${path}`);
    const uidValidity = Number(mb.uidValidity);
    const row = syncRow(path);
    const fresh = !row || row.uidvalidity !== uidValidity;
    let lastUid = fresh ? 0 : row.last_uid;

    let range: string | number[] | false | undefined;
    if (fresh) {
      const found = await client.search({ since: firstLookSince() }, { uid: true });
      range = found && found.length ? found : false;
    } else range = `${lastUid + 1}:*`;

    const metas: FetchMessageObject[] = [];
    if (range) {
      for await (const msg of client.fetch(
        range,
        { uid: true, envelope: true, internalDate: true, size: true, headers: ["references", "x-emos-thread", "x-emos-message"] },
        { uid: true }
      )) {
        // "n:*" always returns the newest message, even one we've seen
        if (msg.uid > lastUid) metas.push(msg);
      }
    }
    metas.sort((a, b) => a.uid - b.uid);

    for (const meta of metas) {
      const h = parseHeaderBlock(meta.headers);
      const env_ = meta.envelope;
      const refs = [...ids(h.get("references")), ...ids(env_?.inReplyTo)];
      const quick = {
        from: addr(env_?.from)[0],
        to: [...addr(env_?.to), ...addr(env_?.cc)],
        emos: h.has("x-emos-message") || h.has("x-emos-thread"),
        refs,
      };
      if (worthFetching(kind, quick)) {
        const source = await readSource(client, meta.uid, meta.size);
        if (source) {
          const parsed = await simpleParser(source, { skipImageLinks: true, skipTextToHtml: true });
          const internal = meta.internalDate ? new Date(meta.internalDate) : undefined;
          const outcome = ingest(kind, toIncoming(parsed, `<imap.${uidValidity}.${meta.uid}@${encodeURIComponent(path)}>`, internal));
          counts[outcome]++;
        }
      } else counts.ignored++;
      lastUid = Math.max(lastUid, meta.uid);
      // progress is saved as it goes: a crash mid-way doesn't read the same mail twice
      saveRow(path, { uidvalidity: uidValidity, last_uid: lastUid });
    }
    // nothing new (or a first look that found nothing): start after what's there now
    if (!metas.length && fresh) lastUid = Math.max(0, (mb.uidNext ?? 1) - 1);
    saveRow(path, { uidvalidity: uidValidity, last_uid: lastUid, error: null });
  } finally {
    lock.release();
  }
  return counts;
}

/**
 * One pass over Sent, then the inbox (so an id learnt from Elliot's reply
 * is known when the visitor's answer to it is read). True when at least
 * one mailbox synced; each mailbox's own error is kept for mailHealth().
 */
export async function syncOnce(): Promise<boolean> {
  if (!imapReady()) return false;
  const { host, port, user, pass, secure, sent, inbox } = env.imap;
  const client = new ImapFlow({
    host: host!,
    port,
    secure,
    auth: { user: user!, pass: pass! },
    tls: tlsFor(host!),
    logger: false,
    disableAutoIdle: true,
    connectionTimeout: 20_000,
    greetingTimeout: 15_000,
    socketTimeout: 120_000,
    clientInfo: { name: "emOS", version: "1" },
  });
  // an unhandled 'error' event would crash the process
  client.on("error", (err: Error) => console.error("[mail] imap connection error:", err?.message ?? err));

  try {
    await client.connect();
  } catch (e) {
    const message = `connect: ${(e as Error)?.message ?? e}`.slice(0, 300);
    for (const m of [sent, inbox]) saveRow(m, { error: message });
    throw e;
  }
  let anyOk = false;
  try {
    for (const [kind, path] of [
      ["sent", sent],
      ["inbox", inbox],
    ] as const) {
      try {
        const c = await syncMailbox(client, kind, path);
        anyOk = true;
        if (c.stored) console.info(`[mail] ${path}: ${c.stored} new`);
      } catch (e) {
        // imapflow puts the server's own words ("Mailbox doesn't exist") in responseText
        const err = e as Error & { responseText?: string };
        const message = [err?.message ?? String(e), err?.responseText].filter(Boolean).join(": ").slice(0, 300);
        console.error(`[mail] ${path}:`, message);
        saveRow(path, { error: message });
      }
    }
  } finally {
    await client.logout().catch(() => client.close());
  }
  try {
    pruneRates();
  } catch {}
  return anyOk;
}

/** when the poller last ran, and the latest error it hit (for mailHealth) */
export function syncStatus() {
  try {
    const rows = db().prepare(`SELECT * FROM mail_sync`).all() as SyncRow[];
    const lastSync = rows.map((r) => r.last_run).filter(Boolean).sort().pop() ?? undefined;
    const withError = rows.filter((r) => r.last_error).sort((a, b) => String(b.last_run).localeCompare(String(a.last_run)))[0];
    return { lastSync, lastError: withError ? `${withError.mailbox}: ${withError.last_error}` : undefined, lastErrorAt: withError?.last_run ?? undefined };
  } catch {
    return { lastSync: undefined, lastError: undefined, lastErrorAt: undefined };
  }
}
