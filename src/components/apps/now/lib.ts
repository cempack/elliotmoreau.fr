"use client";

import { Fragment, createElement, useEffect, useState, useSyncExternalStore } from "react";
import type { TrackInfo } from "@/lib/spotify";

/** "{a} and {b}" → string, for plain-text templates (aria labels). */
export function fill(template: string, vars: Record<string, string | number>) {
  return template.replace(/\{(\w+)\}/g, (_, k: string) => (k in vars ? String(vars[k]) : `{${k}}`));
}

/** "{a} and {b}" → React nodes, for templates with live tokens in them. */
export function fillNodes(template: string, nodes: Record<string, React.ReactNode>): React.ReactNode[] {
  return template.split(/(\{\w+\})/g).map((part, i) => {
    const m = part.match(/^\{(\w+)\}$/);
    return createElement(Fragment, { key: i }, m && m[1] in nodes ? nodes[m[1]] : part);
  });
}

const subscribeVisibility = (cb: () => void) => {
  document.addEventListener("visibilitychange", cb);
  return () => document.removeEventListener("visibilitychange", cb);
};
/** True while the tab is hidden (false on the server). */
export function useTabHidden() {
  return useSyncExternalStore(
    subscribeVisibility,
    () => document.hidden,
    () => false
  );
}

/**
 * The current time, ticking every `ms`. Null on the server and on the
 * first client render (hydration-safe); skips ticks while the tab is
 * hidden and catches up when it comes back.
 */
export function useNow(ms = 1000) {
  const [now, setNow] = useState<Date | null>(null);
  useEffect(() => {
    const tick = () => {
      if (!document.hidden) setNow(new Date());
    };
    const first = window.setTimeout(tick, 0);
    const id = window.setInterval(tick, ms);
    document.addEventListener("visibilitychange", tick);
    return () => {
      window.clearTimeout(first);
      window.clearInterval(id);
      document.removeEventListener("visibilitychange", tick);
    };
  }, [ms]);
  return now;
}

/**
 * A formatted clock string, checked every `ms` but re-rendering only when
 * the string changes (a minute clock polled each second renders once a
 * minute). `format` must be stable (module scope). Null until mounted.
 */
export function useClock(format: (d: Date) => string, ms = 1000) {
  const [value, setValue] = useState<string | null>(null);
  useEffect(() => {
    const tick = () => {
      if (!document.hidden) setValue(format(new Date()));
    };
    const first = window.setTimeout(tick, 0);
    const id = window.setInterval(tick, ms);
    document.addEventListener("visibilitychange", tick);
    return () => {
      window.clearTimeout(first);
      window.clearInterval(id);
      document.removeEventListener("visibilitychange", tick);
    };
  }, [format, ms]);
  return value;
}

const PARIS_HM = new Intl.DateTimeFormat("en-GB", { timeZone: "Europe/Paris", hour: "2-digit", minute: "2-digit", hourCycle: "h23" });
/** "14:22" in Toulouse */
export const parisHM = (d: Date) => PARIS_HM.format(d);

/** Whether an element is on screen (for pausing loops). */
export function useOnScreen(ref: React.RefObject<Element | null>, margin = "0px") {
  const [on, setOn] = useState(false);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const io = new IntersectionObserver(([e]) => setOn(e.isIntersecting), { rootMargin: margin });
    io.observe(el);
    return () => io.disconnect();
  }, [ref, margin]);
  return on;
}

/** m:ss */
export const fmtMs = (ms: number) => {
  const s = Math.max(0, Math.floor(ms / 1000));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
};

/**
 * Live playback position: the server's progress plus the time since it
 * arrived, while playing. Null until mounted. Holds at the end of the
 * track until the next poll brings the next one. Ticks once a second, and
 * only while `active` (on screen) and the tab is visible; the arrival time
 * is kept per poll, so pausing the tick never rewinds the position.
 */
export function useTrackProgress(track: TrackInfo | null, playing: boolean, active = true) {
  const key = track ? `${track.title}|${track.artist}|${track.progressMs}|${playing}` : "";
  const [anchor, setAnchor] = useState<{ key: string; at: number } | null>(null);
  const [now, setNow] = useState(0);
  useEffect(() => {
    if (!key) return;
    const id = window.setTimeout(() => {
      const t = Date.now();
      setAnchor((a) => (a?.key === key ? a : { key, at: t }));
      setNow(t);
    }, 0);
    return () => window.clearTimeout(id);
  }, [key]);
  useEffect(() => {
    if (!key || !playing || !active) return;
    const tick = () => {
      if (!document.hidden) setNow(Date.now());
    };
    const first = window.setTimeout(tick, 0);
    const id = window.setInterval(tick, 1000);
    return () => {
      window.clearTimeout(first);
      window.clearInterval(id);
    };
  }, [key, playing, active]);
  if (!track || !anchor || anchor.key !== key) return null;
  const elapsed = track.progressMs + (playing ? Math.max(0, now - anchor.at) : 0);
  return Math.min(track.durationMs || elapsed, Math.max(0, elapsed));
}

/** UTC offset (minutes) of an IANA zone at a given instant. */
export function tzOffset(tz: string, d: Date) {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: tz,
    hourCycle: "h23",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).formatToParts(d);
  const get = (t: string) => Number(parts.find((p) => p.type === t)?.value ?? 0);
  const asUTC = Date.UTC(get("year"), get("month") - 1, get("day"), get("hour") % 24, get("minute"));
  return Math.round((asUTC - Math.floor(d.getTime() / 60000) * 60000) / 60000);
}

/** Tiny deterministic PRNG (mulberry32) for pixel art: no Math.random in render. */
export function seeded(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function hashString(s: string) {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619);
  return h >>> 0;
}
