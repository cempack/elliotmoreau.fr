"use client";

import { useEffect, useState, useSyncExternalStore } from "react";

/** A media query as live state; `false` on the server and first paint. */
export function useMedia(query: string) {
  return useSyncExternalStore(
    (cb) => {
      const mq = window.matchMedia(query);
      mq.addEventListener("change", cb);
      return () => mq.removeEventListener("change", cb);
    },
    () => window.matchMedia(query).matches,
    () => false
  );
}

export const useReduced = () => useMedia("(prefers-reduced-motion: reduce)");

/** True once hydrated (server + first client render agree on false). */
export function useMounted() {
  return useSyncExternalStore(
    () => () => {},
    () => true,
    () => false
  );
}

/** Wall clock that ticks every `ms` while `on` (null until mounted). */
export function useNow(ms = 1000, on = true) {
  const [now, setNow] = useState<number | null>(null);
  useEffect(() => {
    const tick = () => setNow(Date.now());
    const first = window.setTimeout(tick, 0);
    if (!on) return () => window.clearTimeout(first);
    const id = window.setInterval(tick, ms);
    return () => {
      window.clearTimeout(first);
      window.clearInterval(id);
    };
  }, [ms, on]);
  return now;
}

/**
 * Whether the boot intro is out of the way: true on repeat visits, under
 * reduced motion, and as soon as IntroGate fires `em:intro-done`.
 */
export function useIntroDone() {
  return useSyncExternalStore(
    (cb) => {
      window.addEventListener("em:intro-done", cb);
      return () => window.removeEventListener("em:intro-done", cb);
    },
    () =>
      document.documentElement.dataset.intro === "done" ||
      window.matchMedia("(prefers-reduced-motion: reduce)").matches,
    () => false
  );
}

/** Deterministic tiny hash → hex, for fake-but-stable commit ids. */
export function hexOf(s: string, len = 7) {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  let out = "";
  let x = h >>> 0;
  while (out.length < len) {
    x = Math.imul(x ^ (x >>> 15), 2246822519) >>> 0;
    out += (x >>> 0).toString(16).padStart(8, "0");
  }
  return out.slice(0, len);
}

/** m:ss from milliseconds. */
export function mmss(ms: number) {
  const s = Math.max(0, Math.floor(ms / 1000));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
}
