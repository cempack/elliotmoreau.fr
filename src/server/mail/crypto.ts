import "server-only";
import crypto from "node:crypto";
import { db } from "../db";
import { env } from "../env";

/**
 * Secrets for the mail module: the visitor's thread token (random, looked
 * up by its sha256, kept AES-256-GCM encrypted for admin replies) and the
 * salted IP hash used by the rate limits. Keys come from SESSION_SECRET
 * through HKDF, one per purpose. Without SESSION_SECRET (local dev), a
 * random secret is generated once and kept in the database, so nothing
 * breaks; setting SESSION_SECRET later only means older admin replies
 * can't repeat the visitor's link (the token itself keeps working).
 */

const g = globalThis as unknown as { __emosMailSecret?: Buffer; __emosMailWarned?: boolean };

function rootSecret(): Buffer {
  if (env.sessionSecret) return Buffer.from(env.sessionSecret, "utf8");
  if (g.__emosMailSecret) return g.__emosMailSecret;
  const d = db();
  const row = d.prepare(`SELECT value FROM mail_kv WHERE key = 'secret'`).get() as { value: string } | undefined;
  let value = row?.value;
  if (!value) {
    value = crypto.randomBytes(32).toString("base64");
    d.prepare(`INSERT OR IGNORE INTO mail_kv (key, value) VALUES ('secret', ?)`).run(value);
    value = (d.prepare(`SELECT value FROM mail_kv WHERE key = 'secret'`).get() as { value: string }).value;
  }
  if (!g.__emosMailWarned) {
    g.__emosMailWarned = true;
    console.warn("[mail] SESSION_SECRET is not set; using a generated key stored in the database");
  }
  g.__emosMailSecret = Buffer.from(value, "base64");
  return g.__emosMailSecret;
}

const keys = new Map<string, Buffer>();
/** a 32-byte key for one purpose, derived from the root secret */
function key(info: string): Buffer {
  const root = rootSecret();
  const cacheKey = `${info}:${crypto.createHash("sha256").update(root).digest("hex").slice(0, 16)}`;
  let k = keys.get(cacheKey);
  if (!k) {
    k = Buffer.from(crypto.hkdfSync("sha256", root, Buffer.from("emos-mail-v1"), Buffer.from(info), 32));
    keys.set(cacheKey, k);
  }
  return k;
}

/** 32 random bytes, base64url (43 characters): the visitor's private thread link */
export function newToken() {
  return crypto.randomBytes(32).toString("base64url");
}

export const TOKEN_RE = /^[A-Za-z0-9_-]{43}$/;

export function hashToken(token: string) {
  return crypto.createHash("sha256").update(token, "utf8").digest("hex");
}

/** random hex id for rows and Message-IDs */
export function newId(bytes = 10) {
  return crypto.randomBytes(bytes).toString("hex");
}

/** "v1.<iv>.<ciphertext>.<tag>", all base64url */
export function encryptToken(token: string) {
  const iv = crypto.randomBytes(12);
  const c = crypto.createCipheriv("aes-256-gcm", key("thread-token"), iv);
  const ct = Buffer.concat([c.update(token, "utf8"), c.final()]);
  return ["v1", iv.toString("base64url"), ct.toString("base64url"), c.getAuthTag().toString("base64url")].join(".");
}

/** null when it can't be read (wrong key, tampered) */
export function decryptToken(enc: string): string | null {
  try {
    const [v, iv, ct, tag] = enc.split(".");
    if (v !== "v1" || !iv || !ct || !tag) return null;
    const d = crypto.createDecipheriv("aes-256-gcm", key("thread-token"), Buffer.from(iv, "base64url"));
    d.setAuthTag(Buffer.from(tag, "base64url"));
    return Buffer.concat([d.update(Buffer.from(ct, "base64url")), d.final()]).toString("utf8");
  } catch {
    return null;
  }
}

/** The stats' visitor-of-the-day key: a new one every calendar day, never stored, so a
    visitor can be counted once per day and never followed from one day to the next. */
export function dayKey(day: string) {
  return crypto.createHmac("sha256", key("stats-day")).update(day).digest();
}

/** HMAC of an IP (or an email, for its rate limit): never stored in the clear */
export function saltedHash(value: string) {
  return crypto.createHmac("sha256", key("ip-hash")).update(value.toLowerCase()).digest("hex").slice(0, 32);
}

/** constant-time string comparison (lengths may differ) */
export function safeEqual(a: string, b: string) {
  const ha = crypto.createHash("sha256").update(a).digest();
  const hb = crypto.createHash("sha256").update(b).digest();
  return crypto.timingSafeEqual(ha, hb) && a.length === b.length;
}
