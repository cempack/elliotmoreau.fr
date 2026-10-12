import { PIXEL_GLYPHS } from "@/components/PixelLabel";
import type { CurrentAway } from "@/lib/content";
import { clock, readEstimate, type Estimate, type MailStatus } from "./hours";
import { fill } from "./mail";
import { textWidth } from "./postmark";

/**
 * La levée: what Elliot's letterbox prints, read the way the French post
 * prints it. The collection plate is his working hours, the window tab the
 * next time he's likely to read his mail (readEstimate, with the trip
 * resolved from the Atlas too), and a FAIRE SUIVRE slip covers the plate
 * while he's away. The object is French in both languages, in 3 × 5 caps
 * with the accents folded; the caption and the label translate it. Pure,
 * so the box, the card and the tests agree.
 */

export type Tab = { word: string; digits: string; key: string };
export type Slip = { place: string; until: string | null };
export type Levee = { est: Estimate; plate: [string, string, string]; tab: Tab; slip: Slip | null };

/** the strings readSentence needs (t.contact.when) */
export type WhenStrings = {
  desk: string;
  later: string;
  next: string;
  away: string;
  awayOpen: string;
  local: string;
  tomorrow: string;
  onDay: string;
};
/** t.contact.box */
export type BoxStrings = { label: string; labelAway: string; labelAwayOpen: string; range: string; inBox: string };

const WD3 = ["LUN", "MAR", "MER", "JEU", "VEN", "SAM", "DIM"];
const WD2 = ["LU", "MA", "ME", "JE", "VE", "SA", "DI"];
const WD_LONG = ["LUNDI", "MARDI", "MERCREDI", "JEUDI", "VENDREDI", "SAMEDI", "DIMANCHE"];
const EN_SHORT = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

/** "9:00" → "09:00" */
const pad = (hhmm: string) => {
  const m = /^(\d{1,2}):(\d{2})$/.exec(hhmm.trim());
  return m ? `${m[1].padStart(2, "0")}:${m[2]}` : hhmm.trim();
};

/** the ISO weekday (1 = Monday) and dd, mm of an instant in a zone */
function dayIn(d: Date, tz: string) {
  const parts = new Intl.DateTimeFormat("en-GB", { timeZone: tz, weekday: "short", day: "2-digit", month: "2-digit" }).formatToParts(d);
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? "";
  return { wd: EN_SHORT.indexOf(get("weekday")) + 1 || 1, dd: get("day"), mm: get("month") };
}

/** "2026-10-20" → "20.10" */
const ddmm = (iso: string) => {
  const [, mo, d] = iso.split("-");
  return mo && d ? `${d}.${mo}` : "";
};

/** sorted ISO days as runs of consecutive days */
function runs(days: number[]) {
  const sorted = [...new Set(days)].filter((d) => d >= 1 && d <= 7).sort((a, b) => a - b);
  const out: number[][] = [];
  for (const d of sorted) {
    const last = out[out.length - 1];
    if (last && d === last[last.length - 1] + 1) last.push(d);
    else out.push([d]);
  }
  return out;
}

/** "LUN-VEN", "LUN-MER VEN", "LUN MER VEN"; two-letter names when three don't fit */
export function daysPlate(days: number[], maxCells: number) {
  const line = (names: string[]) =>
    runs(days)
      .map((r) => (r.length >= 2 ? `${names[r[0] - 1]}-${names[r[r.length - 1] - 1]}` : r.map((d) => names[d - 1]).join(" ")))
      .join(" ");
  const long = line(WD3);
  return textWidth(long) > maxCells ? line(WD2) : long;
}

/** caps the pixel font can print: accents folded, anything else a space */
export function toCaps(s: string) {
  const up = s
    .toLocaleUpperCase("fr")
    .replace(/Œ/g, "OE")
    .replace(/Æ/g, "AE")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "");
  return [...up]
    .map((ch) => (ch !== " " && PIXEL_GLYPHS[ch] ? ch : " "))
    .join("")
    .replace(/ {2,}/g, " ")
    .trim();
}

/** the whole line if it fits; else up to the last space or hyphen that fits; else whole glyphs, no ellipsis */
export function fitCaps(s: string, max: number) {
  if (textWidth(s) <= max) return s;
  for (let i = s.length - 1; i > 0; i--) {
    if (s[i] !== " " && s[i] !== "-") continue;
    const head = s.slice(0, i).trim();
    if (head && textWidth(head) <= max) return head;
  }
  let out = s;
  while (out.length > 1 && textWidth(out) > max) out = out.slice(0, -1).trim();
  return out;
}

/** what the box prints right now */
export function leveeView(now: Date, status: MailStatus, away: CurrentAway | null): Levee {
  const wh = status.workHours;
  const tz = wh.tz || "Europe/Paris";
  const est = readEstimate(now, { ...status, away });
  const plate: [string, string, string] = ["LEVEES", daysPlate(wh.days, 46), `${pad(wh.start)}-${pad(wh.end)}`];

  let word = "";
  let digits = "--:--";
  const at = est.readAt;
  switch (est.state) {
    case "desk":
      word = "JUSQU'A";
      digits = pad(wh.end);
      break;
    case "later":
      word = "AUJOURD'HUI";
      digits = clock(at!, tz, "fr");
      break;
    case "next":
      word = est.dayOffset === 1 ? "DEMAIN" : WD_LONG[dayIn(at!, tz).wd - 1];
      digits = clock(at!, tz, "fr");
      break;
    case "away": {
      const d = dayIn(at!, tz);
      word = `${WD3[d.wd - 1]} ${d.dd}.${d.mm}`;
      digits = clock(at!, tz, "fr");
      break;
    }
  }
  const tab = { word, digits, key: `${est.state}|${word}|${digits}` };

  const slip =
    away && (est.state === "away" || est.state === "awayOpen")
      ? {
          place: toCaps(away.place?.name.fr ?? away.place?.name.en ?? away.city ?? ""),
          until: est.awayUntil ? `JUSQU'AU ${ddmm(est.awayUntil)}` : null,
        }
      : null;
  return { est, plate, tab, slip };
}

/** "He’s online in Toulouse: likely read today." (and the card's line), with the visitor's time when it differs */
export function readSentence(est: Estimate, { lang, tz, mine, w }: { lang: string; tz: string; mine: string; w: WhenStrings }) {
  const loc = lang === "fr" ? "fr-FR" : "en-GB";
  const at = (d: Date) => {
    const there = clock(d, tz, lang);
    const here = clock(d, mine, lang);
    return here === there ? there : `${there} (${fill(w.local, { time: here })})`;
  };
  const weekday = (d: Date) => new Intl.DateTimeFormat(loc, { weekday: "long", timeZone: tz }).format(d);
  const day = est.dayOffset === 1 ? w.tomorrow : est.readAt ? fill(w.onDay, { day: weekday(est.readAt) }) : "";
  switch (est.state) {
    case "desk":
      return w.desk;
    case "later":
      return fill(w.later, { time: at(est.readAt!) });
    case "next":
      return fill(w.next, { day, time: at(est.readAt!) });
    case "away":
      return fill(w.away, { date: longDay(est.awayUntil ?? "", loc), day, time: at(est.readAt!) });
    default:
      return w.awayOpen;
  }
}

/** "20 October" / "20 octobre" from "2026-10-20" */
function longDay(iso: string, loc: string) {
  const [y, mo, d] = iso.split("-").map(Number);
  if (!y || !mo || !d) return iso;
  return new Intl.DateTimeFormat(loc, { day: "numeric", month: "long", timeZone: "UTC" }).format(new Date(Date.UTC(y, mo - 1, d)));
}

/** "Monday to Friday", "du lundi au vendredi", or a list */
export function daysLong(days: number[], lang: string, b: Pick<BoxStrings, "range">) {
  const loc = lang === "fr" ? "fr-FR" : "en-GB";
  const name = (d: number) => new Intl.DateTimeFormat(loc, { weekday: "long", timeZone: "UTC" }).format(new Date(Date.UTC(2024, 0, d)));
  const rs = runs(days);
  if (rs.length === 1 && rs[0].length >= 2) return fill(b.range, { a: name(rs[0][0]), b: name(rs[0][rs[0].length - 1]) });
  return new Intl.ListFormat(loc, { type: "conjunction" }).format(rs.flat().map(name));
}

/** the box's accessible name, saying in words what it prints (the home label until the time is known) */
export function boxLabel(
  view: Levee | null,
  { lang, b, away, hours }: { lang: "en" | "fr"; b: BoxStrings; away: CurrentAway | null; hours: Pick<MailStatus["workHours"], "days" | "start" | "end"> }
) {
  const loc = lang === "fr" ? "fr-FR" : "en-GB";
  const place = away?.place?.name[lang] ?? away?.place?.name.en ?? away?.city;
  if (place && view?.est.state === "away") return fill(b.labelAway, { place, date: longDay(view.est.awayUntil ?? "", loc) });
  if (place && view?.est.state === "awayOpen") return fill(b.labelAwayOpen, { place });
  return fill(b.label, { days: daysLong(hours.days, lang, b), start: pad(hours.start), end: pad(hours.end) });
}
