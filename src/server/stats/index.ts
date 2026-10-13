import "server-only";
import crypto from "node:crypto";
import { db } from "../db";
import { dayKey } from "../mail/crypto";
import { clientIp } from "../mail/http";
import { env } from "../env";
import { countryOfZone } from "./tz";

/**
 * The site's own visitor stats: no cookies, no third party, nothing that
 * follows anyone. Each page view stores the page, the site's language, the
 * site a visit came from, the country its time zone belongs to, and the
 * kind of device and browser. A visitor is an HMAC of IP and browser under
 * a key that changes every day (dayKey), so someone is counted once a day
 * and can't be recognised the next. Bots, Elliot's own signed-in visits,
 * Do Not Track and Global Privacy Control are left out. Rows older than
 * 400 days are dropped.
 */

const TZ = "Europe/Paris";
/** "2026-10-13", the calendar day in Toulouse */
const dayOf = (t: number) => new Intl.DateTimeFormat("en-CA", { timeZone: TZ }).format(t);

const BOT =
  /bot|crawl|spider|slurp|preview|facebookexternalhit|embedly|quora|pinterest|vkshare|whatsapp|telegram|discord|skype|headless|lighthouse|pagespeed|gtmetrix|curl|wget|python|axios|node-fetch|undici|go-http|java\/|okhttp|scrapy|monitor|uptime/i;

export type Hit = { path: string; lang: string; ref: string; country: string; device: string; browser: string; os: string; entry: boolean };

function device(ua: string, touch: boolean) {
  if (/iPad|Tablet|PlayBook|Silk|Android(?!.*Mobile)/i.test(ua)) return "tablet";
  if (/Mobi|iPhone|iPod|Android.*Mobile|Windows Phone/i.test(ua)) return "phone";
  // iPadOS says it's a Mac: a Mac with a touch screen is an iPad
  if (/Macintosh/.test(ua) && touch) return "tablet";
  return "desktop";
}

function browser(ua: string) {
  if (/Edg\//.test(ua)) return "Edge";
  if (/OPR\/|Opera/.test(ua)) return "Opera";
  if (/SamsungBrowser/.test(ua)) return "Samsung Internet";
  if (/Firefox\/|FxiOS/.test(ua)) return "Firefox";
  if (/Vivaldi/.test(ua)) return "Vivaldi";
  if (/Chrome\/|CriOS/.test(ua)) return "Chrome";
  if (/Safari\//.test(ua)) return "Safari";
  return "Other";
}

function os(ua: string) {
  if (/iPhone|iPad|iPod/.test(ua)) return "iOS";
  if (/Android/.test(ua)) return "Android";
  if (/CrOS/.test(ua)) return "ChromeOS";
  if (/Mac OS X|Macintosh/.test(ua)) return "macOS";
  if (/Windows/.test(ua)) return "Windows";
  if (/Linux/.test(ua)) return "Linux";
  return "Other";
}

const siteHost = () => {
  try {
    return new URL(env.siteUrl).hostname.replace(/^www\./, "");
  } catch {
    return "";
  }
};

/** "https://www.google.com/search?q=…" → "google.com"; this site, or nothing usable → "" */
function refHost(ref: unknown, source: unknown): string {
  if (typeof source === "string" && /^[a-z0-9._-]{1,40}$/i.test(source)) return source.toLowerCase();
  if (typeof ref !== "string" || !ref) return "";
  try {
    const u = new URL(ref);
    if (!/^https?:$/.test(u.protocol)) return "";
    const host = u.hostname.replace(/^www\./, "").replace(/^m\./, "").toLowerCase();
    if (!host || host === siteHost() || host === "localhost") return "";
    return host.slice(0, 80);
  } catch {
    return "";
  }
}

/** "/fr/blog/a-post?x#y" → { path: "/blog/a-post", lang: "fr" }; null for paths not worth counting */
function pagePath(p: unknown): { path: string; lang: string } | null {
  if (typeof p !== "string" || p.length > 300) return null;
  let path = p.split(/[?#]/)[0] || "/";
  let lang = "en";
  const m = path.match(/^\/(en|fr)(?=\/|$)/);
  if (m) {
    lang = m[1];
    path = path.slice(m[0].length) || "/";
  }
  if (!/^\/[A-Za-z0-9/_.~-]*$/.test(path)) return null;
  if (/^\/(admin|api|_next)(\/|$)/.test(path)) return null;
  path = path.replace(/\/+$/, "") || "/";
  return { path: path.slice(0, 120), lang };
}

let inserts = 0;

/**
 * Count one page view from the beacon (POST /api/hit). Returns false when
 * it isn't counted: a bot, a signed-in admin, a repeat within seconds, or a
 * malformed body.
 */
export function recordHit(req: Request, body: Record<string, unknown>): boolean {
  const ua = req.headers.get("user-agent") ?? "";
  if (!ua || BOT.test(ua)) return false;
  // Elliot looking at his own site
  if (/(?:^|;\s*)(?:__Host-)?emos_admin=/.test(req.headers.get("cookie") ?? "")) return false;
  const page = pagePath(body.p);
  if (!page) return false;
  const now = Date.now();
  const day = dayOf(now);
  const vid = crypto.createHmac("sha256", dayKey(day)).update(`${clientIp(req)}|${ua}`).digest("hex").slice(0, 24);
  const touch = body.t === 1 || body.t === true;
  const tz = typeof body.tz === "string" ? body.tz.slice(0, 64) : "";
  const acceptRegion = (req.headers.get("accept-language") ?? "").match(/^[a-z]{2,3}-([A-Z]{2})/)?.[1] ?? "";
  const lang = body.l === "fr" || body.l === "en" ? body.l : page.lang;
  const entry = body.e === 1 || body.e === true;
  const d = db();
  // the same page twice within ten seconds (a double fire, a reload) counts once
  const last = d.prepare(`SELECT at, path FROM hits WHERE vid = ? ORDER BY id DESC LIMIT 1`).get(vid) as { at: number; path: string } | undefined;
  if (last && last.path === page.path && now - last.at < 10_000) return false;
  d.prepare(
    `INSERT INTO hits (at, day, vid, path, lang, ref, country, device, browser, os, entry) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  ).run(
    now,
    day,
    vid,
    page.path,
    lang,
    entry ? refHost(body.r, body.s) : "",
    countryOfZone(tz) ?? acceptRegion,
    device(ua, touch),
    browser(ua),
    os(ua),
    entry ? 1 : 0
  );
  if (++inserts % 500 === 0) d.prepare(`DELETE FROM hits WHERE at < ?`).run(now - 400 * 86_400_000);
  return true;
}

/* ───────────────────────────── reading ───────────────────────────── */

export type StatsRange = 1 | 7 | 30 | 90 | 365;
/** what the dashboard can be narrowed to, one value each: a page, a source, a country… */
export type StatsDim = "path" | "ref" | "country" | "device" | "browser" | "os" | "lang";
export const STATS_DIMS: readonly StatsDim[] = ["path", "ref", "country", "device", "browser", "os", "lang"];
export type StatsFilter = Partial<Record<StatsDim, string>>;

export type Row = { key: string; visitors: number; views: number };
/** a stretch of time's figures; `duration` is the visits' combined length (ms) */
export type Bucket = { visitors: number; views: number; visits: number; bounces: number; duration: number };
export type Recent = { at: number; path: string; country: string; device: string; ref: string };
export type Stats = {
  range: StatsRange;
  filter: StatsFilter;
  /** one entry per day of the range, oldest first (days without visits included), and the period before, the same length */
  days: (Bucket & { day: string })[];
  previousDays: (Bucket & { day: string })[];
  /** for a one-day range: per hour of today (Toulouse time), and of yesterday */
  hours?: (Bucket & { hour: number })[];
  previousHours?: (Bucket & { hour: number })[];
  totals: Bucket;
  previous: Bucket;
  /** distinct visitors in the last five minutes, and the last page views of the last half hour */
  live: number;
  recent: Recent[];
  pages: Row[];
  /** the first and the last page of each visit (visitors: the visits) */
  entries: Row[];
  exits: Row[];
  referrers: Row[];
  countries: Row[];
  devices: Row[];
  browsers: Row[];
  systems: Row[];
  languages: Row[];
  /** visitors by weekday (Monday first) and hour, Toulouse time: 7 × 24 */
  week: number[];
  /** the first day anything was counted, or null */
  since: string | null;
};

/** a visit ends after half an hour without a page */
const VISIT_GAP = 30 * 60_000;
const COLUMN: Record<Exclude<StatsDim, "ref">, string> = { path: "path", country: "country", device: "device", browser: "browser", os: "os", lang: "lang" };

const shiftDay = (day: string, n: number) => {
  const t = new Date(`${day}T12:00:00Z`);
  t.setUTCDate(t.getUTCDate() + n);
  return t.toISOString().slice(0, 10);
};

/** Toulouse's weekday (Monday 0) and hour for an instant; its offset only changes on the hour, so one lookup per hour */
const zoned = new Map<number, { weekday: number; hour: number }>();
const WEEKDAY: Record<string, number> = { Mon: 0, Tue: 1, Wed: 2, Thu: 3, Fri: 4, Sat: 5, Sun: 6 };
const parts = new Intl.DateTimeFormat("en-GB", { timeZone: TZ, weekday: "short", hour: "2-digit", hourCycle: "h23" });
function zonedHour(t: number) {
  const k = Math.floor(t / 3_600_000);
  let z = zoned.get(k);
  if (!z) {
    const p = parts.formatToParts(k * 3_600_000);
    z = { weekday: WEEKDAY[p.find((x) => x.type === "weekday")?.value ?? "Mon"] ?? 0, hour: Number(p.find((x) => x.type === "hour")?.value ?? 0) };
    if (zoned.size > 20_000) zoned.clear();
    zoned.set(k, z);
  }
  return z;
}

/** the narrowing, as SQL: a plain column, or (for a source) the visits that began there */
function narrow(filter: StatsFilter, from: string, to: string) {
  let sql = "";
  const args: (string | number)[] = [];
  for (const dim of STATS_DIMS) {
    const v = filter[dim];
    if (v == null) continue;
    if (dim === "ref") {
      sql += ` AND vid IN (SELECT vid FROM hits WHERE entry = 1 AND ref = ? AND day >= ? AND day <= ?)`;
      args.push(v, from, to);
    } else {
      sql += ` AND ${COLUMN[dim]} = ?`;
      args.push(v);
    }
  }
  return { sql, args };
}

type PageView = { day: string; vid: string; at: number; path: string };
type Visit = { day: string; vid: string; start: number; last: number; views: number; entry: string; exit: string };
const empty = (): Bucket => ({ visitors: 0, views: 0, visits: 0, bounces: 0, duration: 0 });

/** page views (ordered by visitor, then time) into visits: a visitor's pages, until half an hour passes without one */
export function visitsOf(hits: PageView[]): Visit[] {
  const out: Visit[] = [];
  let v: Visit | null = null;
  for (const h of hits) {
    if (!v || v.vid !== h.vid || h.at - v.last > VISIT_GAP) {
      v = { day: h.day, vid: h.vid, start: h.at, last: h.at, views: 0, entry: h.path, exit: h.path };
      out.push(v);
    }
    v.views++;
    v.last = h.at;
    v.exit = h.path;
  }
  return out;
}

/** visits into figures, by whatever `key` groups them (a day, an hour); visitors counted once per group */
function bucketsOf<K>(visits: Visit[], key: (v: Visit) => K) {
  const m = new Map<K, Bucket & { seen: Set<string> }>();
  for (const v of visits) {
    const k = key(v);
    let b = m.get(k);
    if (!b) m.set(k, (b = { ...empty(), seen: new Set() }));
    b.seen.add(v.vid);
    b.visits++;
    b.views += v.views;
    if (v.views === 1) b.bounces++;
    b.duration += v.last - v.start;
  }
  const out = new Map<K, Bucket>();
  for (const [k, b] of m) out.set(k, { visitors: b.seen.size, views: b.views, visits: b.visits, bounces: b.bounces, duration: b.duration });
  return out;
}

function totalOf(visits: Visit[]): Bucket {
  return bucketsOf(visits, () => 0).get(0) ?? empty();
}

function rank(counts: Map<string, number>, limit: number): Row[] {
  return [...counts]
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .slice(0, limit)
    .map(([key, n]) => ({ key, visitors: n, views: n }));
}

export function getStats(range: StatsRange, filter: StatsFilter = {}, now = Date.now()): Stats {
  const d = db();
  const today = dayOf(now);
  const from = shiftDay(today, -(range - 1));
  const prevFrom = shiftDay(from, -range);
  const prevTo = shiftDay(from, -1);

  const hitsIn = (a: string, b: string) => {
    const n = narrow(filter, a, b);
    return d.prepare(`SELECT day, vid, at, path FROM hits WHERE day >= ? AND day <= ?${n.sql} ORDER BY vid, at`).all(a, b, ...n.args) as PageView[];
  };
  const visits = visitsOf(hitsIn(from, today));
  const before = visitsOf(hitsIn(prevFrom, prevTo));

  const series = (vs: Visit[], start: string) => {
    const by = bucketsOf(vs, (v) => v.day);
    return Array.from({ length: range }, (_, i) => {
      const day = shiftDay(start, i);
      return { day, ...(by.get(day) ?? empty()) };
    });
  };
  const hourly = (vs: Visit[]) => {
    const by = bucketsOf(vs, (v) => zonedHour(v.start).hour);
    return Array.from({ length: 24 }, (_, hour) => ({ hour, ...(by.get(hour) ?? empty()) }));
  };

  // visitors by weekday and hour: each visitor once per cell
  const week = Array.from({ length: 7 * 24 }, () => new Set<string>());
  for (const v of visits) {
    const z = zonedHour(v.start);
    week[z.weekday * 24 + z.hour].add(v.vid);
  }

  const entries = new Map<string, number>();
  const exits = new Map<string, number>();
  for (const v of visits) {
    entries.set(v.entry, (entries.get(v.entry) ?? 0) + 1);
    exits.set(v.exit, (exits.get(v.exit) ?? 0) + 1);
  }

  const scope = narrow(filter, from, today);
  const where = `day >= ? AND day <= ?${scope.sql}`;
  const args = [from, today, ...scope.args];
  const top = (col: string, extra = "", limit = 10) =>
    d
      .prepare(
        `SELECT ${col} AS key, COUNT(DISTINCT vid) AS visitors, COUNT(*) AS views FROM hits WHERE ${where} ${extra} GROUP BY ${col} ORDER BY visitors DESC, views DESC, key LIMIT ${limit}`
      )
      .all(...args) as Row[];

  // right now: the whole site unless narrowed (a filter on a source looks back over today)
  const live = narrow(filter, today, today);
  const liveCount = (d.prepare(`SELECT COUNT(DISTINCT vid) AS n FROM hits WHERE at > ? AND at <= ?${live.sql}`).get(now - 5 * 60_000, now, ...live.args) as { n: number }).n;
  const recent = d
    .prepare(
      `SELECT at, path, country, device,
        COALESCE((SELECT ref FROM hits e WHERE e.vid = hits.vid AND e.entry = 1 AND e.id <= hits.id ORDER BY e.id DESC LIMIT 1), '') AS ref
       FROM hits WHERE at > ? AND at <= ?${live.sql} ORDER BY at DESC, id DESC LIMIT 12`
    )
    .all(now - 30 * 60_000, now, ...live.args) as Recent[];

  const since = (d.prepare(`SELECT MIN(day) AS day FROM hits`).get() as { day: string | null }).day;

  return {
    range,
    filter,
    days: series(visits, from),
    previousDays: series(before, prevFrom),
    hours: range === 1 ? hourly(visits) : undefined,
    previousHours: range === 1 ? hourly(before) : undefined,
    totals: totalOf(visits),
    previous: totalOf(before),
    live: liveCount,
    recent,
    pages: top("path", "", 12),
    entries: rank(entries, 12),
    exits: rank(exits, 12),
    // where visits began: the first page of each visit
    referrers: top("ref", "AND entry = 1", 12),
    countries: top("country", "AND country <> ''", 250),
    devices: top("device"),
    browsers: top("browser"),
    systems: top("os"),
    languages: top("lang"),
    week: week.map((s) => s.size),
    since,
  };
}

/** a filter from the panel, kept to known dimensions and short strings */
export function parseFilter(raw: unknown): StatsFilter {
  const out: StatsFilter = {};
  if (!raw || typeof raw !== "object") return out;
  for (const dim of STATS_DIMS) {
    const v = (raw as Record<string, unknown>)[dim];
    if (typeof v === "string" && v.length <= 120) out[dim] = v;
  }
  return out;
}
