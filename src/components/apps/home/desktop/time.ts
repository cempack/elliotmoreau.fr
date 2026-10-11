"use client";

import { useEffect, useState, useSyncExternalStore } from "react";
import type { Locale } from "@/i18n/config";

export const PARIS = "Europe/Paris";

/**
 * Current time, `null` until mounted (hydration-safe), re-rendering on each
 * minute boundary (aligned, so the clock flips on the minute). Pauses
 * while the tab is hidden and resyncs when it comes back.
 */
export function useMinute() {
  const [now, setNow] = useState<Date | null>(null);
  useEffect(() => {
    let id = 0;
    const tick = () => {
      setNow(new Date());
      if (!document.hidden) id = window.setTimeout(tick, 60_000 - (Date.now() % 60_000) + 12);
    };
    const onVis = () => {
      window.clearTimeout(id);
      if (!document.hidden) tick();
    };
    id = window.setTimeout(tick, 0);
    document.addEventListener("visibilitychange", onVis);
    return () => {
      window.clearTimeout(id);
      document.removeEventListener("visibilitychange", onVis);
    };
  }, []);
  return now;
}

const noop = () => () => {};
const zone = () => Intl.DateTimeFormat().resolvedOptions().timeZone || PARIS;
/** The visitor's IANA zone; Toulouse on the server and during hydration. */
export function useVisitorZone() {
  return useSyncExternalStore(noop, zone, () => PARIS);
}

/** Wall-clock hour and minute of `d` in a zone. */
export function zoned(d: Date, timeZone: string) {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).formatToParts(d);
  const get = (t: string) => Number(parts.find((p) => p.type === t)?.value ?? 0);
  return { y: get("year"), mo: get("month"), d: get("day"), h: get("hour") % 24, m: get("minute") };
}

/** Minutes a zone is ahead of UTC at instant `d`. */
export function offsetMinutes(d: Date, timeZone: string) {
  const p = zoned(d, timeZone);
  const asUtc = Date.UTC(p.y, p.mo - 1, p.d, p.h, p.m);
  return Math.round((asUtc - Math.floor(d.getTime() / 60_000) * 60_000) / 60_000);
}

export function hhmm(d: Date, lang: Locale, timeZone = PARIS) {
  return new Intl.DateTimeFormat(lang === "fr" ? "fr-FR" : "en-GB", {
    timeZone,
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(d);
}

/** "+5 h", "−6 h", "+5 h 30". */
export function fmtOffset(mins: number) {
  const sign = mins >= 0 ? "+" : "−";
  const a = Math.abs(mins);
  const m = a % 60;
  return `${sign}${Math.floor(a / 60)} h${m ? ` ${String(m).padStart(2, "0")}` : ""}`;
}

/** "America/New_York" → "New York". */
export const zoneCity = (tz: string) => (tz.split("/").pop() ?? tz).replace(/_/g, " ");
