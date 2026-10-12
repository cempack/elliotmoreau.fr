import "server-only";
import crypto from "node:crypto";
import { cookies } from "next/headers";
import {
  generateAuthenticationOptions,
  generateRegistrationOptions,
  verifyAuthenticationResponse,
  verifyRegistrationResponse,
} from "@simplewebauthn/server";
import type { AuthenticationResponseJSON, RegistrationResponseJSON } from "@simplewebauthn/server";
import { db, nowIso, tx, type DB } from "../db";
import { env } from "../env";
import { saltedHash, safeEqual } from "../mail/crypto";
import { clientIp, json, readJson } from "../mail/http";

/**
 * The admin's front door. One person signs in, with a passkey, and nobody
 * else can: there are no passwords to guess or phish.
 *
 * - The first passkey can only be registered with ADMIN_SETUP_TOKEN (set on
 *   Railway, compared in constant time) while no passkey exists. That
 *   registration hands out 10 one-time recovery codes.
 * - Later passkeys are added from a signed-in session, or with a recovery
 *   code when every device is lost (which also signs out everywhere).
 * - Challenges live in the database: 5 minutes, single use.
 * - Sessions are 32 random bytes in an HttpOnly, SameSite=Strict cookie
 *   (`__Host-` and Secure over HTTPS); only their sha256 is stored. 12 hours
 *   from the last activity, never more than 7 days from sign-in.
 * - Every admin request is a same-origin JSON POST (Origin and
 *   Sec-Fetch-Site checked), failures count toward a per-IP lockout, and
 *   everything that matters lands in the audit log.
 */

const MIN = 60_000;
const HOUR = 60 * MIN;
const SESSION_IDLE = 12 * HOUR;
const SESSION_MAX = 7 * 24 * HOUR;
const CHALLENGE_TTL = 5 * MIN;
const RECOVERY_COUNT = 10;

/* ───────────────────────────── config ───────────────────────────── */

const site = () => new URL(env.siteUrl);
export const rpID = () => site().hostname;
const origin = () => site().origin;
const secure = () => site().protocol === "https:";
const cookieName = () => (secure() ? "__Host-emos_admin" : "emos_admin");

export type AuthError = "forbidden" | "invalid" | "locked" | "setup" | "unavailable" | "failed";

/* ───────────────────────────── small helpers ───────────────────────────── */

const sha256 = (v: string) => crypto.createHash("sha256").update(v, "utf8").digest("hex");
const ipKey = (req: Request) => saltedHash(`admin:${clientIp(req)}`);

function meta(d: DB, key: string, make: () => string) {
  const row = d.prepare(`SELECT value FROM admin_meta WHERE key = ?`).get(key) as { value: string } | undefined;
  if (row) return row.value;
  const value = make();
  d.prepare(`INSERT OR IGNORE INTO admin_meta (key, value) VALUES (?, ?)`).run(key, value);
  return (d.prepare(`SELECT value FROM admin_meta WHERE key = ?`).get(key) as { value: string }).value;
}

const userHandle = (d: DB) => meta(d, "user_handle", () => crypto.randomBytes(32).toString("base64url"));

export function passkeyCount(d: DB = db()) {
  return (d.prepare(`SELECT COUNT(*) AS n FROM admin_passkeys`).get() as { n: number }).n;
}

/** "Mac · Safari" from a user agent: a starting name for a new passkey */
export function deviceName(ua: string) {
  const os = /iPhone/.test(ua)
    ? "iPhone"
    : /iPad/.test(ua)
      ? "iPad"
      : /Android/.test(ua)
        ? "Android"
        : /Mac OS X|Macintosh/.test(ua)
          ? "Mac"
          : /Windows/.test(ua)
            ? "Windows"
            : /Linux|CrOS/.test(ua)
              ? "Linux"
              : "Device";
  const browser = /Edg\//.test(ua)
    ? "Edge"
    : /Firefox\//.test(ua)
      ? "Firefox"
      : /Chrome\//.test(ua)
        ? "Chrome"
        : /Safari\//.test(ua)
          ? "Safari"
          : "";
  return browser ? `${os} · ${browser}` : os;
}

/* ───────────────────────────── audit ───────────────────────────── */

export function audit(action: string, ok = true, detail = "", ipHash = "") {
  try {
    const d = db();
    d.prepare(`INSERT INTO admin_audit (at, action, ok, detail, ip_hash) VALUES (?, ?, ?, ?, ?)`).run(
      nowIso(),
      action,
      ok ? 1 : 0,
      detail.slice(0, 500),
      ipHash
    );
    // keep the last 2000 entries
    if (Math.random() < 0.05) d.prepare(`DELETE FROM admin_audit WHERE id <= (SELECT MAX(id) - 2000 FROM admin_audit)`).run();
  } catch (err) {
    console.error("[admin] audit failed", err instanceof Error ? err.message : err);
  }
}

export type AuditRow = { id: number; at: string; action: string; ok: boolean; detail: string };

export function listAudit(limit = 100, before?: number): AuditRow[] {
  const rows = db()
    .prepare(
      `SELECT id, at, action, ok, detail FROM admin_audit WHERE (? IS NULL OR id < ?) ORDER BY id DESC LIMIT ?`
    )
    .all(before ?? null, before ?? null, Math.min(Math.max(limit, 1), 500)) as {
    id: number;
    at: string;
    action: string;
    ok: number;
    detail: string;
  }[];
  return rows.map((r) => ({ ...r, ok: r.ok === 1 }));
}

/* ───────────────────────────── lockout ───────────────────────────── */

/** ms until `key` may try again (0: go ahead) */
function lockedFor(key: string, now = Date.now()) {
  const row = db().prepare(`SELECT locked_until FROM admin_rate WHERE key = ?`).get(key) as
    | { locked_until: number }
    | undefined;
  return row && row.locked_until > now ? row.locked_until - now : 0;
}

/**
 * Count a failure. Five are free; after that each one locks the key for
 * twice as long as the last (1 minute, 2, 4 … up to an hour). Counters
 * forget after a quiet day.
 */
function fail(key: string, now = Date.now()) {
  tx((d) => {
    const row = d.prepare(`SELECT failures, updated_at FROM admin_rate WHERE key = ?`).get(key) as
      | { failures: number; updated_at: number }
      | undefined;
    const failures = (row && now - row.updated_at < 24 * HOUR ? row.failures : 0) + 1;
    const lock = failures > 5 ? Math.min(HOUR, MIN * 2 ** (failures - 6)) : 0;
    d.prepare(
      `INSERT INTO admin_rate (key, failures, locked_until, updated_at) VALUES (?, ?, ?, ?)
       ON CONFLICT (key) DO UPDATE SET failures = excluded.failures, locked_until = excluded.locked_until, updated_at = excluded.updated_at`
    ).run(key, failures, now + lock, now);
  });
}

function clearFailures(key: string) {
  db().prepare(`DELETE FROM admin_rate WHERE key = ?`).run(key);
}

/* ───────────────────────────── challenges ───────────────────────────── */

function storeChallenge(challenge: string, kind: "register" | "login", grant = "") {
  const now = Date.now();
  tx((d) => {
    d.prepare(`DELETE FROM admin_challenges WHERE expires_at < ?`).run(now);
    // nobody needs more than a few open ceremonies at once
    d.prepare(
      `DELETE FROM admin_challenges WHERE id NOT IN (SELECT id FROM admin_challenges ORDER BY expires_at DESC LIMIT 50)`
    ).run();
    d.prepare(`INSERT INTO admin_challenges (id, challenge, kind, grant_kind, expires_at) VALUES (?, ?, ?, ?, ?)`).run(
      challenge,
      challenge,
      kind,
      grant,
      now + CHALLENGE_TTL
    );
  });
}

/** take a challenge out (single use); null when unknown, expired or of another kind */
function takeChallenge(challenge: string, kind: "register" | "login"): { grant: string } | null {
  return tx((d) => {
    const row = d.prepare(`SELECT kind, grant_kind, expires_at FROM admin_challenges WHERE id = ?`).get(challenge) as
      | { kind: string; grant_kind: string; expires_at: number }
      | undefined;
    if (!row) return null;
    d.prepare(`DELETE FROM admin_challenges WHERE id = ?`).run(challenge);
    if (row.kind !== kind || row.expires_at < Date.now()) return null;
    return { grant: row.grant_kind };
  });
}

/** the challenge a WebAuthn response answers, read from its clientDataJSON */
function challengeOf(response: { response?: { clientDataJSON?: unknown } }) {
  try {
    const raw = response.response?.clientDataJSON;
    if (typeof raw !== "string" || raw.length > 4096) return null;
    const c = JSON.parse(Buffer.from(raw, "base64url").toString("utf8")) as { challenge?: unknown };
    return typeof c.challenge === "string" && c.challenge.length <= 200 ? c.challenge : null;
  } catch {
    return null;
  }
}

/* ───────────────────────────── recovery codes ───────────────────────────── */

const CODE_ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789"; // no 0/O, 1/I/L
const normCode = (v: string) => v.toUpperCase().replace(/[^A-Z0-9]/g, "");

function newCode() {
  const bytes = crypto.randomBytes(12);
  const chars = Array.from(bytes, (b) => CODE_ALPHABET[b % CODE_ALPHABET.length]).join("");
  return `${chars.slice(0, 4)}-${chars.slice(4, 8)}-${chars.slice(8, 12)}`;
}

/** replace every recovery code; returns the new ones (shown once, stored hashed) */
export function regenerateRecovery(d: DB = db()): string[] {
  const codes = Array.from({ length: RECOVERY_COUNT }, newCode);
  const at = nowIso();
  d.prepare(`DELETE FROM admin_recovery`).run();
  const ins = d.prepare(`INSERT INTO admin_recovery (code_hash, created_at) VALUES (?, ?)`);
  for (const c of codes) ins.run(sha256(normCode(c)), at);
  return codes;
}

export function recoveryLeft(d: DB = db()) {
  return (d.prepare(`SELECT COUNT(*) AS n FROM admin_recovery WHERE used_at IS NULL`).get() as { n: number }).n;
}

function recoveryValid(code: string) {
  const n = normCode(code);
  if (n.length !== 12) return null;
  const h = sha256(n);
  const row = db().prepare(`SELECT code_hash FROM admin_recovery WHERE code_hash = ? AND used_at IS NULL`).get(h) as
    | { code_hash: string }
    | undefined;
  return row ? h : null;
}

/* ───────────────────────────── sessions ───────────────────────────── */

export type Session = { idHash: string; passkeyId: string | null; createdAt: string; expiresAt: number; hardExpiresAt: number };

async function setCookie(token: string, maxAgeMs: number) {
  (await cookies()).set(cookieName(), token, {
    httpOnly: true,
    secure: secure(),
    sameSite: "strict",
    path: "/",
    maxAge: Math.max(0, Math.floor(maxAgeMs / 1000)),
  });
}

async function clearCookie() {
  (await cookies()).set(cookieName(), "", { httpOnly: true, secure: secure(), sameSite: "strict", path: "/", maxAge: 0 });
}

async function startSession(req: Request, passkeyId: string | null) {
  const token = crypto.randomBytes(32).toString("base64url");
  const now = Date.now();
  const d = db();
  d.prepare(`DELETE FROM admin_sessions WHERE expires_at < ? OR hard_expires_at < ?`).run(now, now);
  d.prepare(
    `INSERT INTO admin_sessions (id_hash, passkey_id, created_at, last_seen_at, expires_at, hard_expires_at, ua, ip_hash)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
  ).run(
    sha256(token),
    passkeyId,
    nowIso(),
    nowIso(),
    now + SESSION_IDLE,
    now + SESSION_MAX,
    (req.headers.get("user-agent") ?? "").slice(0, 300),
    ipKey(req)
  );
  await setCookie(token, SESSION_IDLE);
}

/**
 * The signed-in session for this request, or null. Slides the 12-hour
 * window forward (at most every five minutes, never past the 7-day cap).
 */
export async function currentSession(): Promise<Session | null> {
  const token = (await cookies()).get(cookieName())?.value;
  if (!token || !/^[A-Za-z0-9_-]{43}$/.test(token)) return null;
  const idHash = sha256(token);
  const d = db();
  const row = d
    .prepare(`SELECT passkey_id, created_at, last_seen_at, expires_at, hard_expires_at FROM admin_sessions WHERE id_hash = ?`)
    .get(idHash) as
    | { passkey_id: string | null; created_at: string; last_seen_at: string; expires_at: number; hard_expires_at: number }
    | undefined;
  const now = Date.now();
  if (!row || row.expires_at < now || row.hard_expires_at < now) {
    if (row) d.prepare(`DELETE FROM admin_sessions WHERE id_hash = ?`).run(idHash);
    return null;
  }
  let expiresAt = row.expires_at;
  if (now - Date.parse(row.last_seen_at) > 5 * MIN) {
    expiresAt = Math.min(now + SESSION_IDLE, row.hard_expires_at);
    d.prepare(`UPDATE admin_sessions SET last_seen_at = ?, expires_at = ? WHERE id_hash = ?`).run(nowIso(), expiresAt, idHash);
    try {
      await setCookie(token, expiresAt - now);
    } catch {
      // read-only context (a page render): the database window still slid
    }
  }
  return { idHash, passkeyId: row.passkey_id, createdAt: row.created_at, expiresAt, hardExpiresAt: row.hard_expires_at };
}

export type SessionRow = { id: string; createdAt: string; lastSeenAt: string; device: string; current: boolean; passkey?: string };

export function listSessions(current?: string): SessionRow[] {
  const now = Date.now();
  const rows = db()
    .prepare(
      `SELECT s.id_hash, s.created_at, s.last_seen_at, s.ua, p.name AS passkey
       FROM admin_sessions s LEFT JOIN admin_passkeys p ON p.id = s.passkey_id
       WHERE s.expires_at >= ? AND s.hard_expires_at >= ? ORDER BY s.last_seen_at DESC`
    )
    .all(now, now) as { id_hash: string; created_at: string; last_seen_at: string; ua: string; passkey: string | null }[];
  return rows.map((r) => ({
    // a short public id: enough to revoke, useless as a cookie
    id: r.id_hash.slice(0, 16),
    createdAt: r.created_at,
    lastSeenAt: r.last_seen_at,
    device: deviceName(r.ua),
    current: r.id_hash === current,
    ...(r.passkey ? { passkey: r.passkey } : {}),
  }));
}

export function revokeSession(shortId: string) {
  if (!/^[a-f0-9]{16}$/.test(shortId)) return 0;
  return db().prepare(`DELETE FROM admin_sessions WHERE substr(id_hash, 1, 16) = ?`).run(shortId).changes;
}

/* ───────────────────────────── passkeys ───────────────────────────── */

export type PasskeyRow = { id: string; name: string; createdAt: string; lastUsedAt?: string; synced: boolean };

export function listPasskeys(): PasskeyRow[] {
  const rows = db()
    .prepare(`SELECT id, name, created_at, last_used_at, backed_up FROM admin_passkeys ORDER BY created_at`)
    .all() as { id: string; name: string; created_at: string; last_used_at: string | null; backed_up: number }[];
  return rows.map((r) => ({
    id: r.id,
    name: r.name,
    createdAt: r.created_at,
    ...(r.last_used_at ? { lastUsedAt: r.last_used_at } : {}),
    synced: r.backed_up === 1,
  }));
}

export function renamePasskey(id: string, name: string) {
  const clean = name.replace(/[\u0000-\u001f\u007f]/g, "").trim().slice(0, 60);
  if (!clean) return false;
  return db().prepare(`UPDATE admin_passkeys SET name = ? WHERE id = ?`).run(clean, id).changes > 0;
}

/** never removes the last passkey (that would lock everyone out, Elliot included) */
export function revokePasskey(id: string): "ok" | "last" | "notfound" {
  return tx((d) => {
    if (!d.prepare(`SELECT 1 FROM admin_passkeys WHERE id = ?`).get(id)) return "notfound";
    if (passkeyCount(d) <= 1) return "last";
    d.prepare(`DELETE FROM admin_passkeys WHERE id = ?`).run(id);
    d.prepare(`DELETE FROM admin_sessions WHERE passkey_id = ?`).run(id);
    return "ok";
  });
}

/* ───────────────────────────── the ceremonies ───────────────────────────── */

type Result<T> = ({ ok: true } & T) | { ok: false; error: AuthError; retryIn?: number };

export function authState(session: Session | null) {
  const d = db();
  const count = passkeyCount(d);
  return {
    signedIn: Boolean(session),
    /** no passkey yet: the first one needs the setup token */
    setup: count === 0,
    /** the setup token is configured on the server */
    setupReady: Boolean(env.adminSetupToken),
  };
}

/**
 * Options to register a passkey. Allowed with a session, with the setup
 * token while none exists, or with an unused recovery code.
 */
export async function registerOptions(
  req: Request,
  session: Session | null,
  input: { setupToken?: unknown; recoveryCode?: unknown }
): Promise<Result<{ options: unknown }>> {
  const ip = ipKey(req);
  const wait = lockedFor(ip);
  if (wait) return { ok: false, error: "locked", retryIn: wait };
  const d = db();
  let grant = "";
  if (session) grant = "session";
  else if (passkeyCount(d) === 0) {
    if (!env.adminSetupToken) return { ok: false, error: "setup" };
    const given = typeof input.setupToken === "string" ? input.setupToken.trim() : "";
    if (!given || !safeEqual(given, env.adminSetupToken)) {
      fail(ip);
      audit("setup.denied", false, "wrong setup token", ip);
      return { ok: false, error: "forbidden" };
    }
    grant = "setup";
  } else {
    // codes can be guessed at; every wrong one, from anywhere, slows the next
    const all = lockedFor("recovery:all");
    if (all) return { ok: false, error: "locked", retryIn: all };
    const code = typeof input.recoveryCode === "string" ? recoveryValid(input.recoveryCode) : null;
    if (!code) {
      fail(ip);
      fail("recovery:all");
      audit("recovery.denied", false, "wrong recovery code", ip);
      return { ok: false, error: "forbidden" };
    }
    grant = `recovery:${code}`;
  }

  const existing = d.prepare(`SELECT id, transports FROM admin_passkeys`).all() as { id: string; transports: string }[];
  const options = await generateRegistrationOptions({
    rpName: "emOS",
    rpID: rpID(),
    userName: "elliot",
    userDisplayName: "Elliot Moreau",
    userID: Buffer.from(userHandle(d), "base64url"),
    attestationType: "none",
    excludeCredentials: existing.map((p) => ({ id: p.id, transports: JSON.parse(p.transports) as string[] })),
    authenticatorSelection: { residentKey: "required", userVerification: "required" },
    timeout: CHALLENGE_TTL,
  });
  storeChallenge(options.challenge, "register", grant);
  return { ok: true, options };
}

/** finish a registration; the first one (or a recovery) returns fresh recovery codes */
export async function registerVerify(
  req: Request,
  session: Session | null,
  response: unknown
): Promise<Result<{ recoveryCodes?: string[] }>> {
  const ip = ipKey(req);
  if (lockedFor(ip)) return { ok: false, error: "locked", retryIn: lockedFor(ip) };
  const res = response as RegistrationResponseJSON;
  const challenge = res && typeof res === "object" ? challengeOf(res) : null;
  const taken = challenge ? takeChallenge(challenge, "register") : null;
  if (!taken) {
    fail(ip);
    return { ok: false, error: "invalid" };
  }
  // the grant must still hold now
  if (taken.grant === "session" && !session) return { ok: false, error: "forbidden" };

  let info;
  try {
    const v = await verifyRegistrationResponse({
      response: res,
      expectedChallenge: challenge!,
      expectedOrigin: origin(),
      expectedRPID: rpID(),
      requireUserVerification: true,
    });
    if (!v.verified) throw new Error("not verified");
    info = v.registrationInfo;
  } catch (err) {
    fail(ip);
    audit("passkey.add", false, err instanceof Error ? err.message : "verification failed", ip);
    return { ok: false, error: "failed" };
  }

  const ua = req.headers.get("user-agent") ?? "";
  const name = deviceName(ua) + (info.credentialBackedUp ? "" : " (this device)");
  const outcome = tx((d): { ok: true; codes?: string[] } | { ok: false } => {
    if (taken.grant === "setup" && passkeyCount(d) > 0) return { ok: false };
    if (taken.grant.startsWith("recovery:")) {
      const used = d
        .prepare(`UPDATE admin_recovery SET used_at = ? WHERE code_hash = ? AND used_at IS NULL`)
        .run(nowIso(), taken.grant.slice("recovery:".length)).changes;
      if (!used) return { ok: false };
      // whoever holds the old sessions, they're out
      d.prepare(`DELETE FROM admin_sessions`).run();
    }
    d.prepare(
      `INSERT INTO admin_passkeys (id, public_key, counter, transports, device_type, backed_up, name, created_at, last_used_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
    ).run(
      info.credential.id,
      Buffer.from(info.credential.publicKey),
      info.credential.counter,
      JSON.stringify(info.credential.transports ?? []),
      info.credentialDeviceType,
      info.credentialBackedUp ? 1 : 0,
      name,
      nowIso(),
      nowIso()
    );
    return { ok: true, codes: taken.grant === "setup" ? regenerateRecovery(d) : undefined };
  });
  if (!outcome.ok) {
    audit("passkey.add", false, `grant no longer valid (${taken.grant.split(":")[0]})`, ip);
    return { ok: false, error: "forbidden" };
  }
  clearFailures(ip);
  audit("passkey.add", true, `${name} via ${taken.grant.split(":")[0]}`, ip);
  if (!session) await startSession(req, info.credential.id);
  return { ok: true, ...(outcome.codes ? { recoveryCodes: outcome.codes } : {}) };
}

export async function loginOptions(req: Request): Promise<Result<{ options: unknown }>> {
  const ip = ipKey(req);
  const wait = lockedFor(ip);
  if (wait) return { ok: false, error: "locked", retryIn: wait };
  if (passkeyCount() === 0) return { ok: false, error: "setup" };
  // discoverable credentials: no list of ids goes to an anonymous caller
  const options = await generateAuthenticationOptions({ rpID: rpID(), userVerification: "required", timeout: CHALLENGE_TTL });
  storeChallenge(options.challenge, "login");
  return { ok: true, options };
}

export async function loginVerify(req: Request, response: unknown): Promise<Result<object>> {
  const ip = ipKey(req);
  if (lockedFor(ip)) return { ok: false, error: "locked", retryIn: lockedFor(ip) };
  const res = response as AuthenticationResponseJSON;
  const challenge = res && typeof res === "object" ? challengeOf(res) : null;
  if (!challenge || !takeChallenge(challenge, "login") || typeof res.id !== "string") {
    fail(ip);
    return { ok: false, error: "invalid" };
  }
  const d = db();
  const pk = d.prepare(`SELECT id, public_key, counter, transports, name FROM admin_passkeys WHERE id = ?`).get(res.id) as
    | { id: string; public_key: Buffer; counter: number; transports: string; name: string }
    | undefined;
  if (!pk) {
    fail(ip);
    audit("signin", false, "unknown passkey", ip);
    return { ok: false, error: "failed" };
  }
  try {
    const v = await verifyAuthenticationResponse({
      response: res,
      expectedChallenge: challenge,
      expectedOrigin: origin(),
      expectedRPID: rpID(),
      requireUserVerification: true,
      credential: {
        id: pk.id,
        publicKey: new Uint8Array(pk.public_key),
        counter: pk.counter,
        transports: JSON.parse(pk.transports) as string[],
      },
    });
    if (!v.verified) throw new Error("not verified");
    d.prepare(`UPDATE admin_passkeys SET counter = ?, last_used_at = ?, backed_up = ? WHERE id = ?`).run(
      v.authenticationInfo.newCounter,
      nowIso(),
      v.authenticationInfo.credentialBackedUp ? 1 : 0,
      pk.id
    );
  } catch (err) {
    fail(ip);
    audit("signin", false, `${pk.name}: ${err instanceof Error ? err.message : "verification failed"}`, ip);
    return { ok: false, error: "failed" };
  }
  clearFailures(ip);
  await startSession(req, pk.id);
  audit("signin", true, pk.name, ip);
  return { ok: true };
}

export async function logout(session: Session | null, req: Request) {
  if (session) {
    db().prepare(`DELETE FROM admin_sessions WHERE id_hash = ?`).run(session.idHash);
    audit("signout", true, "", ipKey(req));
  }
  await clearCookie();
}

/* ───────────────────────────── the guard ───────────────────────────── */

export type AdminCtx = { session: Session; ip: string; body: Record<string, unknown> };

/** same-origin by the browser's own account, when it gives one */
function crossSite(req: Request) {
  const site = req.headers.get("sec-fetch-site");
  return Boolean(site && site !== "same-origin");
}

/**
 * Parse an admin API request: same-origin JSON POST only. Returns the body
 * or the Response to send as is.
 */
export async function readAdminJson(req: Request): Promise<Record<string, unknown> | Response> {
  if (crossSite(req)) return json({ ok: false }, 403);
  return readJson(req);
}

/**
 * Every admin read and write goes through here: a same-origin JSON POST
 * from a live session, or a bare 401 / 403.
 */
export async function requireAdmin(req: Request): Promise<AdminCtx | Response> {
  const body = await readAdminJson(req);
  if (body instanceof Response) return body;
  const session = await currentSession();
  if (!session) return json({ ok: false }, 401);
  return { session, ip: ipKey(req), body };
}
