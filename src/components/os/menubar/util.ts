"use client";

import { useEffect, useState } from "react";
import type { Locale } from "@/i18n/config";
import { resetWorkspaces } from "../workspaces";

export const PARIS_TZ = "Europe/Paris";
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

/** "Sat 10 Oct" / "sam. 10 oct." (Toulouse unless a zone is given). */
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

/**
 * Restart emOS: forget that this session already booted, fade the screen
 * to ink like a display powering down, and load the Desktop, where the
 * boot plays (its text, the old way: the note tells the gate it's a restart).
 */
/** Watch the arrival again: back to the Desktop, down from space. Unlike
    Restart, nothing closes: the open windows wait in their workspaces. */
export function replayArrival() {
  try {
    sessionStorage.removeItem("em-intro");
    sessionStorage.setItem("em-boot", "arrival");
  } catch {}
  window.location.assign(/^\/fr(\/|$)/.test(window.location.pathname) ? "/fr" : "/");
}

export function restartOS() {
  try {
    sessionStorage.removeItem("em-intro");
    sessionStorage.setItem("em-boot", "restart");
  } catch {}
  // a reboot closes every app: no workspace survives it
  resetWorkspaces();
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
