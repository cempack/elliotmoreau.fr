"use client";

import { useI18n } from "@/i18n/client";
import { loc } from "@/lib/content";
import { elliotsDay, type Day } from "@/lib/day";
import { readEstimate, clock } from "@/components/apps/contact/hours";
import { useAway, useStatus } from "../SiteData";
import { useNow } from "./util";

const fill = (s: string, v: Record<string, string>) => s.replace(/\{(\w+)\}/g, (_, k: string) => v[k] ?? "");

/**
 * Elliot's day for this minute (see lib/day.ts), and the one sentence that
 * says it: where he probably is, and when a message sent now gets read.
 * null until mounted (times are the browser's to compute).
 */
export function useElliotsDay(playing: boolean): { day: Day; sentence: string } | null {
  const { t, lang } = useI18n();
  const d = t.shell.day;
  const status = useStatus();
  const away = useAway();
  const now = useNow("minute");
  if (!now) return null;
  const awayName = away ? (away.place ? loc(away.place.name, lang) : away.city) : undefined;
  const day = elliotsDay(status, { at: now, away, awayName, playing });

  const read = () => {
    const est = readEstimate(now, status);
    if (!est.readAt) return d.readLater;
    const time = clock(est.readAt, status.workHours.tz, lang);
    if (est.dayOffset === 0) return fill(d.readToday, { time });
    if (est.dayOffset === 1) return fill(d.readTomorrow, { time });
    const weekday = new Intl.DateTimeFormat(lang === "fr" ? "fr-FR" : "en-GB", { weekday: "long", timeZone: status.workHours.tz }).format(est.readAt);
    return fill(d.readDay, { day: weekday, time });
  };

  const v = { time: day.time, start: day.start };
  const sentence =
    day.phase === "away"
      ? day.away?.time
        ? fill(d.away, { ...v, city: day.away.city, local: day.away.time })
        : fill(d.awayNoTime, { ...v, city: day.away?.city ?? "" })
      : day.phase === "desk"
        ? fill(day.bolt ? d.deskMusic : d.desk, v)
        : day.phase === "morning"
          ? fill(d.morning, v)
          : fill(d[day.phase], { ...v, read: read() });
  return { day, sentence };
}

/** A pixel battery, 15×8 cells: five bars, a nub, a bolt when charging or at the desk with music. */
export function Battery({ day }: { day: Day }) {
  const bars = Math.max(1, Math.round(day.level * 5));
  const tone = day.phase === "away" ? "away" : day.level > 0.5 ? "high" : day.level > 0.25 ? "mid" : "low";
  return (
    <svg className="os-battery" data-tone={tone} width="19" height="10" viewBox="0 0 19 10" shapeRendering="crispEdges" aria-hidden>
      <path className="os-battery-shell" d="M0 0h16v1H0zM0 9h16v1H0zM0 1h1v8H0zM15 1h1v8h-1zM16 3h2v4h-2z" />
      {Array.from({ length: 5 }, (_, i) => (
        <rect key={i} className="os-battery-bar" data-on={i < bars || undefined} x={2 + i * 2.6} y="2" width="2" height="6" />
      ))}
      {(day.charging || day.bolt) && <path className="os-battery-bolt" d="M8 1h2v3h2v1h-1v1h-1v1h-1v2H8V6H6V5h1V4h1z" />}
      {day.phase === "away" && <path className="os-battery-bolt" d="M5 4h7v2H5zM8 2h1v6H8z" />}
    </svg>
  );
}
