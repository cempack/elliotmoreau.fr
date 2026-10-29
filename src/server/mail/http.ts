import "server-only";
import { BlockList, isIPv4, isIPv6 } from "node:net";
import { env } from "../env";

/**
 * Guards shared by the /api/mail route handlers: same-origin POSTs only,
 * JSON only, small bodies, and the client's IP as Cloudflare saw it.
 * Errors are generic on purpose.
 */

const MAX_BODY = 32 * 1024;

export function json(data: unknown, status = 200) {
  return Response.json(data, { status, headers: { "Cache-Control": "no-store" } });
}

/** the page's origin, or (outside production) whatever host the request came to */
function allowedOrigins(req: Request) {
  const out = new Set<string>();
  try {
    out.add(new URL(env.siteUrl).origin);
  } catch {}
  if (process.env.NODE_ENV !== "production") {
    const host = req.headers.get("host");
    if (host) {
      out.add(`http://${host}`);
      out.add(`https://${host}`);
    }
  }
  return out;
}

/**
 * Reads a same-origin JSON POST. Returns the parsed object, or a Response
 * to send back as is (403 foreign origin, 415 not JSON, 413 too big, 400
 * unreadable).
 */
export async function readJson(req: Request): Promise<Record<string, unknown> | Response> {
  const origin = req.headers.get("origin");
  if (!origin || !allowedOrigins(req).has(origin)) return json({ ok: false, error: "forbidden" }, 403);
  const type = (req.headers.get("content-type") ?? "").split(";")[0].trim().toLowerCase();
  if (type !== "application/json") return json({ ok: false, error: "invalid" }, 415);
  const declared = Number(req.headers.get("content-length") ?? 0);
  if (declared > MAX_BODY) return json({ ok: false, error: "invalid" }, 413);
  let text: string;
  try {
    text = await req.text();
  } catch {
    return json({ ok: false, error: "invalid" }, 400);
  }
  if (text.length > MAX_BODY) return json({ ok: false, error: "invalid" }, 413);
  try {
    const v = JSON.parse(text) as unknown;
    if (!v || typeof v !== "object" || Array.isArray(v)) return json({ ok: false, error: "invalid" }, 400);
    return v as Record<string, unknown>;
  } catch {
    return json({ ok: false, error: "invalid" }, 400);
  }
}

/**
 * Cloudflare's edge (cloudflare.com/ips), and the private networks a
 * Cloudflare Tunnel or the Coolify proxy's Docker network reach the app from.
 */
const CLOUDFLARE = new BlockList();
for (const c of [
  "173.245.48.0/20", "103.21.244.0/22", "103.22.200.0/22", "103.31.4.0/22", "141.101.64.0/18",
  "108.162.192.0/18", "190.93.240.0/20", "188.114.96.0/20", "197.234.240.0/22", "198.41.128.0/17",
  "162.158.0.0/15", "104.16.0.0/13", "104.24.0.0/14", "172.64.0.0/13", "131.0.72.0/22",
]) CLOUDFLARE.addSubnet(c.split("/")[0], Number(c.split("/")[1]), "ipv4");
for (const c of ["2400:cb00::/32", "2606:4700::/32", "2803:f800::/32", "2405:b500::/32", "2405:8100::/32", "2a06:98c0::/29", "2c0f:f248::/32"]) {
  CLOUDFLARE.addSubnet(c.split("/")[0], Number(c.split("/")[1]), "ipv6");
}
const PRIVATE = new BlockList();
for (const c of ["10.0.0.0/8", "172.16.0.0/12", "192.168.0.0/16", "127.0.0.0/8", "100.64.0.0/10"]) {
  PRIVATE.addSubnet(c.split("/")[0], Number(c.split("/")[1]), "ipv4");
}
for (const c of ["fc00::/7", "fe80::/10", "::1/128"]) PRIVATE.addSubnet(c.split("/")[0], Number(c.split("/")[1]), "ipv6");

/** a bare IP address ("::ffff:1.2.3.4" read as 1.2.3.4), or undefined */
function ipOf(raw: string | null | undefined) {
  const v = raw?.trim().replace(/^::ffff:(?=\d+\.\d+\.\d+\.\d+$)/i, "");
  return v && (isIPv4(v) || isIPv6(v)) ? v : undefined;
}
const inList = (list: BlockList, ip: string) => list.check(ip, isIPv4(ip) ? "ipv4" : "ipv6");

/** an address on the internet (not a private, loopback or link-local one): worth looking up */
export function isPublicIp(raw: string) {
  const ip = ipOf(raw);
  return Boolean(ip && !inList(PRIVATE, ip));
}

/**
 * What connected to the app: the Coolify proxy (Traefik) puts it in
 * X-Real-IP and last in X-Forwarded-For, replacing any copy a client sends.
 */
function peerIp(req: Request) {
  return ipOf(req.headers.get("x-real-ip")) ?? ipOf(req.headers.get("x-forwarded-for")?.split(",").pop());
}

/**
 * Whether the request came through Cloudflare, so its CF-* headers can be
 * believed: the peer is one of its edge addresses (or a private one: a
 * tunnel). Someone reaching the server directly can't fake that.
 */
function throughCloudflare(req: Request) {
  const peer = peerIp(req);
  return Boolean(peer && (inList(CLOUDFLARE, peer) || inList(PRIVATE, peer)));
}

/**
 * The visitor's IP. Behind Cloudflare the peer is Cloudflare's edge, and
 * the visitor is CF-Connecting-IP; otherwise the peer itself.
 */
export function clientIp(req: Request) {
  if (throughCloudflare(req)) {
    const cf = ipOf(req.headers.get("cf-connecting-ip"));
    if (cf) return cf;
  }
  return peerIp(req) ?? "unknown";
}

/** what the browser said about itself and the visit (contact/api clues), as the server keeps it */
export type Clues = {
  languages?: string[];
  platform?: string;
  mobile?: boolean;
  brands?: string[];
  screen?: string;
  window?: string;
  dpr?: number;
  colorDepth?: number;
  cores?: number;
  memory?: number;
  touch?: number;
  dark?: boolean;
  reducedMotion?: boolean;
  connection?: string;
  saveData?: boolean;
  cookies?: boolean;
  webdriver?: boolean;
  dnt?: boolean;
  /** the site the visit came from, the page it landed on, the pages since (paths), how long it lasted */
  ref?: string;
  landing?: string;
  pages?: string[];
  onSiteMs?: number;
  /** how long the letter took to write, and whether its message was pasted in */
  writingMs?: number;
  pasted?: boolean;
};

/** what a visitor's request says about who sent it, kept with their letter (store: senders.ts) */
export type SenderInfo = {
  ip: string;
  /** Cloudflare's guesses, from the IP: two-letter country (T1 = Tor, XX = unknown); with the
      "Add visitor location headers" managed transform on, the rest of the place too */
  country?: string;
  continent?: string;
  region?: string;
  city?: string;
  postal?: string;
  latitude?: string;
  longitude?: string;
  ipTimeZone?: string;
  userAgent?: string;
  acceptLanguage?: string;
  /** the browser's own time zone, as the page reported it */
  timeZone?: string;
  /** Cloudflare's id for the request (Security → Events finds it), and the data centre that took it */
  ray?: string;
  colo?: string;
  viaCloudflare: boolean;
  /** every request header but cookies and credentials, as sent */
  headers?: Record<string, string>;
  clues?: Clues;
};

const cut = (v: string | null | undefined, n: number) => {
  const s = v?.replace(/[\u0000-\u001f\u007f]/g, "").trim();
  return s ? s.slice(0, n) : undefined;
};
/** headers carry Latin-1; Cloudflare sends city names as UTF-8 bytes in it */
const utf8 = (v: string | undefined) => {
  if (!v) return v;
  try {
    return new TextDecoder("utf-8", { fatal: true }).decode(Uint8Array.from(v, (ch) => ch.charCodeAt(0) & 0xff));
  } catch {
    return v;
  }
};

/** never kept: the visitor's cookies, credentials, and what only the server's own proxies add */
const SECRET_HEADERS = /^(cookie|authorization|proxy-authorization|x-middleware-.*|x-invoke-.*|next-.*|x-nextjs-.*)$/;

function headersOf(req: Request) {
  const out: Record<string, string> = {};
  let n = 0;
  req.headers.forEach((value, name) => {
    if (SECRET_HEADERS.test(name) || n >= 60) return;
    const v = cut(value, 600);
    if (v) {
      out[name] = v;
      n++;
    }
  });
  return out;
}

const STR: Partial<Record<keyof Clues, number>> = { platform: 40, screen: 24, window: 24, connection: 12, ref: 500, landing: 300 };
const LIST: Partial<Record<keyof Clues, [items: number, length: number]>> = { languages: [8, 35], brands: [6, 60], pages: [30, 200] };
const NUM: (keyof Clues)[] = ["dpr", "colorDepth", "cores", "memory", "touch", "onSiteMs"];
const BOOL: (keyof Clues)[] = ["mobile", "dark", "reducedMotion", "saveData", "cookies", "webdriver", "dnt", "pasted"];

/** the browser's clues, keeping only known fields of the right kind and size (it's the visitor's word) */
export function cleanClues(raw: unknown, writingMs?: number): Clues | undefined {
  const out: Record<string, unknown> = {};
  if (raw && typeof raw === "object" && !Array.isArray(raw)) {
    const r = raw as Record<string, unknown>;
    for (const [k, n] of Object.entries(STR)) {
      const v = typeof r[k] === "string" ? cut(r[k] as string, n!) : undefined;
      if (v) out[k] = v;
    }
    for (const [k, [items, n]] of Object.entries(LIST) as [string, [number, number]][]) {
      if (!Array.isArray(r[k])) continue;
      const v = (r[k] as unknown[]).filter((x): x is string => typeof x === "string").slice(0, items).map((x) => cut(x, n)).filter(Boolean);
      if (v.length) out[k] = v;
    }
    for (const k of NUM) if (typeof r[k] === "number" && Number.isFinite(r[k]) && (r[k] as number) >= 0) out[k] = Math.round((r[k] as number) * 100) / 100;
    for (const k of BOOL) if (typeof r[k] === "boolean") out[k] = r[k];
  }
  if (writingMs != null && Number.isFinite(writingMs) && writingMs > 0) out.writingMs = Math.round(writingMs);
  return Object.keys(out).length ? (out as Clues) : undefined;
}

export function senderOf(req: Request, body: { tz?: unknown; clues?: unknown; elapsed?: unknown } = {}): SenderInfo {
  const h = req.headers;
  const cf = throughCloudflare(req);
  const pick = (name: string, n = 80) => (cf ? utf8(cut(h.get(name), n)) : undefined);
  const country = pick("cf-ipcountry", 2)?.toUpperCase();
  const ray = pick("cf-ray", 40);
  const info: SenderInfo = {
    ip: clientIp(req),
    country: country && /^[A-Z][A-Z0-9]$/.test(country) ? country : undefined,
    continent: pick("cf-ipcontinent", 2),
    region: pick("cf-region"),
    city: pick("cf-ipcity"),
    postal: pick("cf-postal-code", 16),
    latitude: pick("cf-iplatitude", 16),
    longitude: pick("cf-iplongitude", 16),
    ipTimeZone: pick("cf-timezone", 64),
    userAgent: cut(h.get("user-agent"), 512),
    acceptLanguage: cut(h.get("accept-language"), 200),
    timeZone: typeof body.tz === "string" && /^[A-Za-z0-9_+\-/]{1,64}$/.test(body.tz) ? body.tz : undefined,
    ray,
    colo: ray?.match(/-([A-Z]{3})$/)?.[1],
    viaCloudflare: cf,
    headers: headersOf(req),
    clues: cleanClues(body.clues, typeof body.elapsed === "number" ? body.elapsed : undefined),
  };
  // leave out what isn't known, so the stored JSON stays small
  for (const k of Object.keys(info) as (keyof SenderInfo)[]) if (info[k] === undefined) delete info[k];
  return info;
}

/** HTTP status for each error the mail API can return */
export const STATUS: Record<string, number> = { invalid: 400, verify: 403, notfound: 404, rate: 429, unavailable: 503, failed: 502 };
