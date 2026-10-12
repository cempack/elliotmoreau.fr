/**
 * "When it'll be read": an honest estimate from Elliot's working hours,
 * how long his replies usually take, and whether he's away, all in his
 * time zone (Toulouse). Pure functions, so the card and the tests agree.
 */

export type WorkHours = { start: string; end: string; days: number[]; tz: string };
export type Away = { placeId?: string; city?: string; tz?: string; from?: string; to?: string };
export type MailStatus = { away: Away | null; workHours: WorkHours; replyDays: number };

/** the defaults the content module seeds (status.workHours, status.replyDays) */
export const DEFAULT_STATUS: MailStatus = {
  away: null,
  workHours: { start: "09:00", end: "18:30", days: [1, 2, 3, 4, 5], tz: "Europe/Paris" },
  replyDays: 3,
};

/**
 * Elliot's status, for the Mail app. Until the content module's
 * useStatus() lands in SiteData, the seeded defaults; swapping is one line:
 * `export const useMailStatus = (): MailStatus => useStatus();`
 */
export function useMailStatus(): MailStatus {
  return DEFAULT_STATUS;
}

const fmts = new Map<string, Intl.DateTimeFormat>();
function partsIn(d: Date, tz: string) {
  let f = fmts.get(tz);
  if (!f) {
    f = new Intl.DateTimeFormat("en-GB", {
      timeZone: tz,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
      hourCycle: "h23",
    });
    fmts.set(tz, f);
  }
  const o: Record<string, number> = {};
  for (const p of f.formatToParts(d)) if (p.type !== "literal") o[p.type] = Number(p.value);
  return { y: o.year, mo: o.month, d: o.day, h: o.hour % 24, mi: o.minute, s: o.second };
}

/** minutes the zone is ahead of UTC at an instant */
function offsetMin(t: number, tz: string) {
  const p = partsIn(new Date(t), tz);
  return Math.round((Date.UTC(p.y, p.mo - 1, p.d, p.h, p.mi, p.s) - Math.floor(t / 1000) * 1000) / 60_000);
}

/** the instant of a wall-clock time (minutes after midnight) on a calendar date in a zone */
export function zonedInstant(y: number, mo: number, d: number, minutes: number, tz: string) {
  const guess = Date.UTC(y, mo - 1, d) + minutes * 60_000;
  let t = guess - offsetMin(guess, tz) * 60_000;
  // across a DST change the first guess can be an hour out
  t = guess - offsetMin(t, tz) * 60_000;
  return new Date(t);
}

const toMin = (hhmm: string) => {
  const m = /^(\d{1,2}):(\d{2})$/.exec(hhmm.trim());
  if (!m) return null;
  const v = Number(m[1]) * 60 + Number(m[2]);
  return v >= 0 && v <= 24 * 60 ? v : null;
};

/** calendar date k days after (y, mo, d), with its ISO weekday (1 = Monday) */
function dayAfter(y: number, mo: number, d: number, k: number) {
  const u = new Date(Date.UTC(y, mo - 1, d + k));
  return { y: u.getUTCFullYear(), mo: u.getUTCMonth() + 1, d: u.getUTCDate(), wd: u.getUTCDay() || 7 };
}

const isoDay = (x: { y: number; mo: number; d: number }) => `${x.y}-${String(x.mo).padStart(2, "0")}-${String(x.d).padStart(2, "0")}`;

export type Estimate = {
  /** at his desk now / later today / a later day / away until a date / away, no end date */
  state: "desk" | "later" | "next" | "away" | "awayOpen";
  /** when it's likely read (now, when at his desk); null when away with no end date */
  readAt: Date | null;
  /** readAt plus the usual reply time */
  replyBy: Date | null;
  /** the readAt day relative to Toulouse's today: 0 today, 1 tomorrow, … */
  dayOffset: number;
  awayUntil?: string;
  /** 24 values for Toulouse's hours today: the share of each hour he works (0 on a day off) */
  cells: number[];
  /** Toulouse's time now, in fractional hours */
  nowHour: number;
  start: string;
  end: string;
};

export function readEstimate(now: Date, s: MailStatus): Estimate {
  const wh = s.workHours;
  const tz = wh.tz || "Europe/Paris";
  const startMin = toMin(wh.start) ?? 9 * 60;
  let endMin = toMin(wh.end) ?? 18 * 60 + 30;
  if (endMin <= startMin) endMin = 24 * 60;
  const days = wh.days?.length ? wh.days : [1, 2, 3, 4, 5];
  const p = partsIn(now, tz);
  const today = dayAfter(p.y, p.mo, p.d, 0);
  const t = now.getTime();

  // away: from an explicit "from" (or already), until the end of "to" (or no end)
  const away = s.away;
  let awayEnd: number | null = null;
  if (away?.to && /^\d{4}-\d{2}-\d{2}$/.test(away.to)) {
    const [y, mo, d] = away.to.split("-").map(Number);
    const next = dayAfter(y, mo, d, 1);
    awayEnd = zonedInstant(next.y, next.mo, next.d, 0, tz).getTime();
  }
  const awayActive = Boolean(away) && (!away?.from || isoDay(today) >= away.from) && (awayEnd == null || awayEnd > t);
  if (!awayActive) awayEnd = null;

  const worksToday = days.includes(today.wd) && !awayActive;
  const cells = Array.from({ length: 24 }, (_, h) => {
    if (!worksToday) return 0;
    const a = Math.max(h * 60, startMin);
    const b = Math.min(h * 60 + 60, endMin);
    return b > a ? (b - a) / 60 : 0;
  });
  const base = { cells, nowHour: p.h + p.mi / 60, start: wh.start, end: wh.end };
  const reply = (at: Date) => new Date(at.getTime() + Math.max(1, s.replyDays || 3) * 86_400_000);

  if (awayActive && awayEnd == null) return { ...base, state: "awayOpen", readAt: null, replyBy: null, dayOffset: 0 };

  for (let k = 0; k < 21; k++) {
    const day = dayAfter(p.y, p.mo, p.d, k);
    if (!days.includes(day.wd)) continue;
    const open = zonedInstant(day.y, day.mo, day.d, startMin, tz).getTime();
    const close = zonedInstant(day.y, day.mo, day.d, endMin, tz).getTime();
    if (close <= t) continue;
    if (awayEnd != null && open < awayEnd) continue;
    const readAt = new Date(Math.max(open, t));
    const state = awayActive ? "away" : t >= open ? "desk" : k === 0 ? "later" : "next";
    return { ...base, state, readAt, replyBy: reply(readAt), dayOffset: k, awayUntil: state === "away" ? away?.to : undefined };
  }
  return { ...base, state: "awayOpen", readAt: null, replyBy: null, dayOffset: 0 };
}

/** "09:00" in a zone */
export function clock(d: Date, tz: string, lang: string) {
  return new Intl.DateTimeFormat(lang === "fr" ? "fr-FR" : "en-GB", { timeZone: tz, hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).format(d);
}
