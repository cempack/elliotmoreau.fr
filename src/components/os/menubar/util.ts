"use client";

import { useEffect, useState } from "react";
import type { Locale } from "@/i18n/config";

export const PARIS_TZ = "Europe/Paris";
/** The repository's first commit: emOS uptime counts from here. */
export const FIRST_COMMIT = "2026-03-21T04:59:03+01:00";
export const SITE_REPO = "https://github.com/cempack/elliotmoreau.fr";
export const BLOG_URL = "https://blog.elliotmoreau.fr";
export const BLOG_RSS = "https://blog.elliotmoreau.fr/rss/";

/** "{repo} pushed" + { repo: "x" } → "x pushed". */
export function fill(template: string, vars: Record<string, string | number>) {
  return template.replace(/\{(\w+)\}/g, (_, k: string) => String(vars[k] ?? ""));
}

const intlLocale = (lang: Locale) => (lang === "fr" ? "fr-FR" : "en-GB");

/**
 * Current time, `null` until mounted (hydration-safe), re-rendering on
 * every `step` boundary (aligned, so a minute clock flips on the minute,
 * not up to a minute late). Ticks pause while the tab is hidden and
 * resync when it returns.
 */
export function useNow(step: "second" | "minute" = "minute") {
  const [now, setNow] = useState<Date | null>(null);
  useEffect(() => {
    const ms = step === "second" ? 1000 : 60_000;
    let id = 0;
    const schedule = () => {
      const t = Date.now();
      id = window.setTimeout(tick, ms - (t % ms) + 8);
    };
    const tick = () => {
      setNow(new Date());
      if (!document.hidden) schedule();
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
  }, [step]);
  return now;
}

/** Wall-clock parts of `d` in a time zone. */
export function zonedParts(d: Date, timeZone: string) {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  }).formatToParts(d);
  const get = (t: string) => Number(parts.find((p) => p.type === t)?.value ?? 0);
  return {
    year: get("year"),
    month: get("month"),
    day: get("day"),
    hour: get("hour") % 24,
    minute: get("minute"),
    second: get("second"),
  };
}

/** Minutes a zone is ahead of UTC at instant `d`. */
export function zoneOffset(d: Date, timeZone: string) {
  const p = zonedParts(d, timeZone);
  const asUtc = Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, p.second);
  return Math.round((asUtc - Math.floor(d.getTime() / 1000) * 1000) / 60_000);
}

export function fmtTime(d: Date, lang: Locale, timeZone = PARIS_TZ, seconds = false) {
  return new Intl.DateTimeFormat(intlLocale(lang), {
    timeZone,
    hour: "2-digit",
    minute: "2-digit",
    ...(seconds ? { second: "2-digit" } : {}),
    hour12: false,
  }).format(d);
}

/** "Sat 10 Oct" / "sam. 10 oct." (Paris unless a zone is given). */
export function fmtShortDate(d: Date, lang: Locale, timeZone = PARIS_TZ) {
  return new Intl.DateTimeFormat(intlLocale(lang), {
    timeZone,
    weekday: "short",
    day: "numeric",
    month: "short",
  })
    .format(d)
    .replace(",", "");
}

export function fmtLongDate(d: Date, lang: Locale) {
  const s = new Intl.DateTimeFormat(intlLocale(lang), {
    timeZone: PARIS_TZ,
    weekday: "long",
    day: "numeric",
    month: "long",
  })
    .format(d)
    .replace(",", "");
  return s.charAt(0).toUpperCase() + s.slice(1);
}

export function fmtMonth(d: Date, lang: Locale) {
  const s = new Intl.DateTimeFormat(intlLocale(lang), { timeZone: PARIS_TZ, month: "long" }).format(d);
  return s.charAt(0).toUpperCase() + s.slice(1);
}

/** Weekday initials, Monday first (France), in the UI language. */
export function weekdayInitials(lang: Locale) {
  const fmt = new Intl.DateTimeFormat(intlLocale(lang), { weekday: "narrow", timeZone: "UTC" });
  // 2024-01-01 was a Monday
  return Array.from({ length: 7 }, (_, i) => fmt.format(new Date(Date.UTC(2024, 0, 1 + i))).toUpperCase());
}

/** "+5 h", "−6 h", "+5 h 30" relative offset in minutes. */
export function fmtOffset(mins: number) {
  if (mins === 0) return "±0 h";
  const sign = mins > 0 ? "+" : "−";
  const a = Math.abs(mins);
  const h = Math.floor(a / 60);
  const m = a % 60;
  return `${sign}${h} h${m ? ` ${String(m).padStart(2, "0")}` : ""}`;
}

/** "America/New_York" → "New York". */
export function zoneCity(tz: string) {
  const last = tz.split("/").pop() ?? tz;
  return last.replace(/_/g, " ");
}

/**
 * Restart emOS: forget that this session already booted, fade the screen
 * to ink like a display powering down, and load the Desktop, where the
 * boot plays.
 */
export function restartOS() {
  try {
    sessionStorage.removeItem("em-intro");
  } catch {}
  const home = /^\/fr(\/|$)/.test(window.location.pathname) ? "/fr" : "/";
  const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  if (reduced) {
    window.location.assign(home);
    return;
  }
  const veil = document.createElement("div");
  veil.className = "os-menubar-restart";
  veil.setAttribute("aria-hidden", "true");
  document.body.appendChild(veil);
  window.setTimeout(() => window.location.assign(home), 520);
}
