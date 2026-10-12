import type { CurrentAway, Status } from "./content";
import { clockIn, tzForAway } from "./tz";

/**
 * Elliot's day, as a battery: charging overnight, full in the morning,
 * draining through the working day and the evening. Pure: the menu bar
 * and the battery's sentence read the same answer for the same minute. Hours are Toulouse's (the working-hours zone).
 */

export type DayPhase = "asleep" | "morning" | "desk" | "evening" | "weekend" | "away";

export type Day = {
  phase: DayPhase;
  /** 0–1 */
  level: number;
  charging: boolean;
  /** at the desk with music on */
  bolt: boolean;
  /** "02:14", Toulouse */
  time: string;
  /** "09:00": when the desk opens next (today or the next working day) */
  start: string;
  /** travelling: where, and the time there */
  away?: { city: string; time?: string };
};

const SLEEP = 23.5 * 60; // 23:30
const WAKE = 7.5 * 60; // 07:30

const toMin = (hhmm: string) => {
  const m = /^(\d{1,2}):(\d{2})$/.exec(hhmm);
  return m ? Number(m[1]) * 60 + Number(m[2]) : null;
};

function partsIn(tz: string, at: Date) {
  const p = new Intl.DateTimeFormat("en-GB", { timeZone: tz, hourCycle: "h23", hour: "2-digit", minute: "2-digit", weekday: "short" }).formatToParts(at);
  const get = (t: string) => p.find((x) => x.type === t)?.value ?? "";
  const wd = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"].indexOf(get("weekday")) + 1;
  return { min: Number(get("hour")) * 60 + Number(get("minute")), wd: wd || 1 };
}

const lerp = (a: number, b: number, t: number) => a + (b - a) * Math.max(0, Math.min(1, t));

export function elliotsDay(
  status: Status,
  opts: { at?: Date; away?: CurrentAway | null; awayName?: string; playing?: boolean } = {}
): Day {
  const at = opts.at ?? new Date();
  const tz = status.workHours.tz || "Europe/Paris";
  let parts;
  try {
    parts = partsIn(tz, at);
  } catch {
    parts = partsIn("Europe/Paris", at);
  }
  const { min, wd } = parts;
  const start = toMin(status.workHours.start) ?? 9 * 60;
  let end = toMin(status.workHours.end) ?? 18 * 60 + 30;
  if (end <= start) end = 24 * 60;
  const workday = (status.workHours.days?.length ? status.workHours.days : [1, 2, 3, 4, 5]).includes(wd);
  const time = clockIn(tz, at);
  const base = { time, start: status.workHours.start };

  if (opts.away) {
    const awayTz = tzForAway(opts.away);
    return {
      ...base,
      phase: "away",
      level: 0.6,
      charging: false,
      bolt: false,
      away: { city: opts.awayName ?? opts.away.city ?? "", time: awayTz ? clockIn(awayTz, at) : undefined },
    };
  }

  // the night, wrapping midnight: charging from 15% to full
  const asleep = min >= SLEEP || min < WAKE;
  if (asleep) {
    const into = min >= SLEEP ? min - SLEEP : min + (24 * 60 - SLEEP);
    const span = 24 * 60 - SLEEP + WAKE;
    return { ...base, phase: "asleep", level: lerp(0.15, 1, into / span), charging: true, bolt: false };
  }
  if (!workday) return { ...base, phase: "weekend", level: lerp(1, 0.55, (min - WAKE) / (SLEEP - WAKE)), charging: false, bolt: false };
  if (min < start) return { ...base, phase: "morning", level: 1, charging: false, bolt: false };
  if (min < end) {
    return { ...base, phase: "desk", level: lerp(1, 0.35, (min - start) / (end - start)), charging: false, bolt: Boolean(opts.playing) };
  }
  return { ...base, phase: "evening", level: lerp(0.35, 0.15, (min - end) / Math.max(1, SLEEP - end)), charging: false, bolt: false };
}
