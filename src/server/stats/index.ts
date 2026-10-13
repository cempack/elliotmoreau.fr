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

/** "/fr/writing/a-post?x#y" → { path: "/writing/a-post", lang: "fr" }; null for paths not worth counting */
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
export type Row = { key: string; visitors: number; views: number };
export type Stats = {
  range: StatsRange;
  /** one entry per day of the range, oldest first (days without visits included) */
  days: { day: string; visitors: number; views: number }[];
  /** for a one-day range: per hour of today, Toulouse time */
  hours?: { hour: number; visitors: number; views: number }[];
  totals: { visitors: number; views: number; pagesPerVisit: number };
  previous: { visitors: number; views: number };
  /** distinct visitors in the last five minutes */
  live: number;
  pages: Row[];
  referrers: Row[];
  countries: Row[];
  devices: Row[];
  browsers: Row[];
  systems: Row[];
  languages: Row[];
  /** the first day anything was counted, or null */
  since: string | null;
};

const shiftDay = (day: string, n: number) => {
  const t = new Date(`${day}T12:00:00Z`);
  t.setUTCDate(t.getUTCDate() + n);
  return t.toISOString().slice(0, 10);
};

export function getStats(range: StatsRange): Stats {
  const d = db();
  const now = Date.now();
  const today = dayOf(now);
  const from = shiftDay(today, -(range - 1));
  const prevFrom = shiftDay(from, -range);
  const prevTo = shiftDay(from, -1);
  const where = `day >= ? AND day <= ?`;
  const args = [from, today];

  const byDay = new Map(
    (d.prepare(`SELECT day, COUNT(DISTINCT vid) AS visitors, COUNT(*) AS views FROM hits WHERE ${where} GROUP BY day`).all(...args) as {
      day: string;
      visitors: number;
      views: number;
    }[]).map((r) => [r.day, r])
  );
  const days: Stats["days"] = [];
  for (let i = 0; i < range; i++) {
    const day = shiftDay(from, i);
    const r = byDay.get(day);
    days.push({ day, visitors: r?.visitors ?? 0, views: r?.views ?? 0 });
  }

  let hours: Stats["hours"];
  if (range === 1) {
    const hourOf = (t: number) => Number(new Intl.DateTimeFormat("en-GB", { timeZone: TZ, hour: "2-digit", hourCycle: "h23" }).format(t));
    const rows = d.prepare(`SELECT at, vid FROM hits WHERE day = ?`).all(today) as { at: number; vid: string }[];
    const bins = Array.from({ length: 24 }, (_, hour) => ({ hour, visitors: new Set<string>(), views: 0 }));
    for (const r of rows) {
      const b = bins[hourOf(r.at)];
      b.views++;
      b.visitors.add(r.vid);
    }
    hours = bins.map((b) => ({ hour: b.hour, visitors: b.visitors.size, views: b.views }));
  }

  const total = (a: string, b: string) =>
    d.prepare(`SELECT COUNT(DISTINCT vid) AS visitors, COUNT(*) AS views FROM hits WHERE ${where}`).get(a, b) as { visitors: number; views: number };
  const t = total(from, today);
  const previous = total(prevFrom, prevTo);
  const live = (d.prepare(`SELECT COUNT(DISTINCT vid) AS n FROM hits WHERE at > ?`).get(now - 5 * 60_000) as { n: number }).n;

  const top = (col: string, extra = "", limit = 10) =>
    d
      .prepare(
        `SELECT ${col} AS key, COUNT(DISTINCT vid) AS visitors, COUNT(*) AS views FROM hits WHERE ${where} ${extra} GROUP BY ${col} ORDER BY visitors DESC, views DESC LIMIT ${limit}`
      )
      .all(...args) as Row[];

  const since = (d.prepare(`SELECT MIN(day) AS day FROM hits`).get() as { day: string | null }).day;

  return {
    range,
    days,
    hours,
    totals: { visitors: t.visitors, views: t.views, pagesPerVisit: t.visitors ? Math.round((t.views / t.visitors) * 10) / 10 : 0 },
    previous,
    live,
    pages: top("path", "", 12),
    // where visits began: the first page of each visit
    referrers: top("ref", "AND entry = 1", 12),
    countries: top("country", "AND country <> ''", 12),
    devices: top("device"),
    browsers: top("browser"),
    systems: top("os"),
    languages: top("lang"),
    since,
  };
}
