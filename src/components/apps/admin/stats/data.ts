import type { StatsBucket, StatsRange } from "../api";

/** what the big chart can show, picked from the figures above it */
export const METRICS = ["visitors", "views", "perVisit", "bounce", "length"] as const;
export type Metric = (typeof METRICS)[number];

/** a metric's value for a stretch of time: counts as they are; per-visit figures from the visits */
export function valueOf(b: StatsBucket, m: Metric): number {
  switch (m) {
    case "visitors":
      return b.visitors;
    case "views":
      return b.views;
    case "perVisit":
      return b.visits ? b.views / b.visits : 0;
    case "bounce":
      return b.visits ? b.bounces / b.visits : 0;
    case "length":
      return b.visits ? b.duration / b.visits : 0;
  }
}

/** fewer bounces is the good direction */
export const upIsGood = (m: Metric) => m !== "bounce";

export const sum = (bs: StatsBucket[]): StatsBucket =>
  bs.reduce((a, b) => ({ visitors: a.visitors + b.visitors, views: a.views + b.views, visits: a.visits + b.visits, bounces: a.bounces + b.bounces, duration: a.duration + b.duration }), {
    visitors: 0,
    views: 0,
    visits: 0,
    bounces: 0,
    duration: 0,
  });

export type Formats = {
  /** 1 284, 12,9 k */
  count: (n: number) => string;
  /** a metric's value, the way it's read: 1.8, 42 %, 1 min 20 s */
  metric: (m: Metric, v: number) => string;
  /** an axis tick: shorter */
  tick: (m: Metric, v: number) => string;
};

export function formats(locale: string): Formats {
  const num = new Intl.NumberFormat(locale, { maximumFractionDigits: 1 });
  const compact = new Intl.NumberFormat(locale, { notation: "compact", maximumFractionDigits: 1 });
  const pct = new Intl.NumberFormat(locale, { style: "percent", maximumFractionDigits: 0 });
  const unit = (u: "minute" | "second") => new Intl.NumberFormat(locale, { style: "unit", unit: u, unitDisplay: "narrow", maximumFractionDigits: 0 });
  const min = unit("minute");
  const sec = unit("second");
  const count = (n: number) => (n >= 10_000 ? compact.format(n) : num.format(Math.round(n)));
  const duration = (ms: number) => {
    const s = Math.round(ms / 1000);
    if (s < 60) return sec.format(s);
    const m = Math.floor(s / 60);
    const r = s % 60;
    return r && m < 10 ? `${min.format(m)} ${sec.format(r)}` : min.format(Math.round(s / 60));
  };
  const metric = (m: Metric, v: number) => (m === "bounce" ? pct.format(v) : m === "length" ? duration(v) : m === "perVisit" ? num.format(v) : count(v));
  const tick = (m: Metric, v: number) => (m === "length" ? (v >= 60_000 ? min.format(v / 60_000) : sec.format(v / 1000)) : metric(m, v));
  return { count, metric, tick };
}

/** round ticks from zero up past `max`: about four of them */
export function ticks(max: number, m: Metric): number[] {
  if (m === "bounce") return [0, 0.25, 0.5, 0.75, 1];
  const base = m === "length" ? (max > 120_000 ? 60_000 : 1000) : 1;
  const top = Math.max(max / base, m === "perVisit" ? 2 : 4);
  const raw = top / 4;
  const pow = 10 ** Math.floor(Math.log10(raw));
  const n = raw / pow;
  const step = (n <= 1 ? 1 : n <= 2 ? 2 : n <= 2.5 ? 2.5 : n <= 5 ? 5 : 10) * pow;
  const out: number[] = [];
  for (let v = 0; v <= top + step * 0.999; v += step) out.push(v * base);
  return out;
}

export type Point = { key: string; label: string; long: string; cur: StatsBucket; prev: StatsBucket | null; future: boolean };

const parse = (day: string) => new Date(`${day}T12:00:00Z`);

/** the chart's points: hours today, days, or weeks over a year; each with the same moment of the period before */
export function pointsOf(
  s: { range: StatsRange; days: (StatsBucket & { day: string })[]; previousDays: (StatsBucket & { day: string })[]; hours?: (StatsBucket & { hour: number })[]; previousHours?: (StatsBucket & { hour: number })[] },
  locale: string,
  nowHour: number
): Point[] {
  if (s.range === 1 && s.hours) {
    const hm = (h: number) => `${String(h).padStart(2, "0")}:00`;
    return s.hours.map((h, i) => ({
      key: `h${h.hour}`,
      label: hm(h.hour),
      long: `${hm(h.hour)}–${hm((h.hour + 1) % 24)}`,
      cur: h,
      prev: s.previousHours?.[i] ?? null,
      future: h.hour > nowHour,
    }));
  }
  const short = new Intl.DateTimeFormat(locale, { day: "numeric", month: "short", timeZone: "UTC" });
  const long = new Intl.DateTimeFormat(locale, { weekday: "long", day: "numeric", month: "long", timeZone: "UTC" });
  if (s.range !== 365)
    return s.days.map((d, i) => ({ key: d.day, label: short.format(parse(d.day)), long: long.format(parse(d.day)), cur: d, prev: s.previousDays[i] ?? null, future: false }));
  // a year: one point per week, the last one ending today
  const out: Point[] = [];
  for (let end = s.days.length; end > 0; end -= 7) {
    const start = Math.max(0, end - 7);
    const w = s.days.slice(start, end);
    const p = s.previousDays.slice(start, end);
    out.unshift({
      key: w[0].day,
      label: short.format(parse(w[0].day)),
      long: short.formatRange(parse(w[0].day), parse(w[w.length - 1].day)),
      cur: sum(w),
      prev: p.length ? sum(p) : null,
      future: false,
    });
  }
  return out;
}

/** a few well-known sources by name; the rest by their address */
const SOURCE_NAMES: [RegExp, string][] = [
  [/^google\./, "Google"],
  [/^(bing\.com|cn\.bing\.com)$/, "Bing"],
  [/^duckduckgo\.com$/, "DuckDuckGo"],
  [/^(search\.)?yahoo\./, "Yahoo"],
  [/^ecosia\.org$/, "Ecosia"],
  [/^qwant\.com$/, "Qwant"],
  [/^search\.brave\.com$/, "Brave Search"],
  [/^github\.com$/, "GitHub"],
  [/^gitlab\.com$/, "GitLab"],
  [/^news\.ycombinator\.com$/, "Hacker News"],
  [/^(t\.co|x\.com|twitter\.com)$/, "X"],
  [/^(linkedin\.com|lnkd\.in)$/, "LinkedIn"],
  [/^(reddit\.com|old\.reddit\.com|out\.reddit\.com)$/, "Reddit"],
  [/^(l\.|lm\.)?facebook\.com$/, "Facebook"],
  [/^(l\.)?instagram\.com$/, "Instagram"],
  [/^(youtube\.com|youtu\.be)$/, "YouTube"],
  [/^bsky\.app$/, "Bluesky"],
  [/^discord\.com$/, "Discord"],
  [/^chatgpt\.com$/, "ChatGPT"],
  [/^claude\.ai$/, "Claude"],
  [/^perplexity\.ai$/, "Perplexity"],
];
/** utm_source / ref= words that stand for a site */
const SOURCE_WORDS: Record<string, string> = {
  github: "github.com",
  linkedin: "linkedin.com",
  twitter: "x.com",
  x: "x.com",
  reddit: "reddit.com",
  hn: "news.ycombinator.com",
  hackernews: "news.ycombinator.com",
  google: "google.com",
  instagram: "instagram.com",
  facebook: "facebook.com",
  youtube: "youtube.com",
  bluesky: "bsky.app",
  discord: "discord.com",
};

/** the sites those words stand for: their icons may be asked for even before one shows up as an address */
export const KNOWN_SOURCE_HOSTS: readonly string[] = [...new Set(Object.values(SOURCE_WORDS))];

/** a source's address, for its icon (a utm word mapped to its site); null for Direct or a word we don't know */
export function sourceHost(key: string): string | null {
  if (!key) return null;
  if (key.includes(".")) return key;
  return SOURCE_WORDS[key] ?? null;
}

export function sourceName(key: string): string {
  const host = sourceHost(key) ?? key;
  for (const [re, name] of SOURCE_NAMES) if (re.test(host)) return name;
  return key;
}
