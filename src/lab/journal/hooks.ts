"use client";

import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import type { MotionValue } from "motion/react";

/** Live media query; `fallback` on the server and during hydration. */
export function useMedia(query: string, fallback = false) {
  return useSyncExternalStore(
    (cb) => {
      const mq = window.matchMedia(query);
      mq.addEventListener("change", cb);
      return () => mq.removeEventListener("change", cb);
    },
    () => window.matchMedia(query).matches,
    () => fallback,
  );
}

/**
 * Reduced-motion preference that is `false` during SSR and hydration, then
 * live (motion's own hook reads the real value on the first client render,
 * which mismatches the server HTML when the two trees differ).
 */
export const useReduced = () => useMedia("(prefers-reduced-motion: reduce)");

/** Fine pointer that can hover: a mouse or trackpad. */
export const useFinePointer = () => useMedia("(hover: hover) and (pointer: fine)");

export type Issue = { vol: number; season: number; month: number; year: number };

/**
 * Issue metadata from today's date, only after mount (the server's clock
 * and the reader's may disagree around midnight or New Year).
 */
export function useIssue(): Issue | null {
  const [issue, setIssue] = useState<Issue | null>(null);
  useEffect(() => {
    const t = window.setTimeout(() => {
      const d = new Date();
      const m = d.getMonth();
      // meteorological seasons: Dec–Feb winter, Mar–May spring…
      const season = m === 11 || m < 2 ? 0 : m < 5 ? 1 : m < 8 ? 2 : 3;
      setIssue({ vol: d.getFullYear() - 2000, season, month: m + 1, year: d.getFullYear() });
    }, 0);
    return () => window.clearTimeout(t);
  }, []);
  return issue;
}

/** True once the component has mounted on the client. */
export function useMounted() {
  return useSyncExternalStore(
    () => () => {},
    () => true,
    () => false,
  );
}

/**
 * A discrete value picked from a motion value (e.g. "scrolled past 24px"),
 * re-rendering only when the pick changes. Subscribes after mount, so a
 * value that moves during the first commit never updates an unmounted
 * component.
 */
export function useMotionPick<T>(mv: MotionValue<number>, pick: (v: number) => T, initial: T): T {
  const [state, setState] = useState(initial);
  const pickRef = useRef(pick);
  useEffect(() => {
    pickRef.current = pick;
  });
  useEffect(() => {
    const update = (v: number) => {
      const next = pickRef.current(v);
      setState((prev) => (Object.is(prev, next) ? prev : next));
    };
    queueMicrotask(() => update(mv.get()));
    return mv.on("change", update);
  }, [mv]);
  return state;
}
