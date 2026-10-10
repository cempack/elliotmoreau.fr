"use client";

import { useCallback, useSyncExternalStore } from "react";

const noopSubscribe = () => () => {};

/** False on the server and during hydration, true after mount. */
export function useHydrated() {
  return useSyncExternalStore(
    noopSubscribe,
    () => true,
    () => false
  );
}

/** Live media query, `serverValue` until hydrated. */
export function useMedia(query: string, serverValue = false) {
  const subscribe = useCallback(
    (cb: () => void) => {
      const mq = window.matchMedia(query);
      mq.addEventListener("change", cb);
      return () => mq.removeEventListener("change", cb);
    },
    [query]
  );
  return useSyncExternalStore(
    subscribe,
    () => window.matchMedia(query).matches,
    () => serverValue
  );
}

/**
 * Reduced-motion preference that is false on the server and during
 * hydration (motion's own hook reads the real value during hydration and
 * mismatches the server HTML).
 */
export function useReduced() {
  return useMedia("(prefers-reduced-motion: reduce)");
}

/** Fine pointer with hover (mouse/trackpad), false on touch and during hydration. */
export function useFinePointer() {
  return useMedia("(hover: hover) and (pointer: fine)");
}

type UAData = { brands?: { brand: string }[] };

/**
 * Real refraction (SVG displacement inside backdrop-filter) only renders in
 * Chromium. Everything else gets frosted glass.
 */
function detectChromium() {
  const ua = (navigator as Navigator & { userAgentData?: UAData }).userAgentData;
  return !!ua?.brands?.some((b) => b.brand === "Chromium");
}

export function useChromium() {
  return useSyncExternalStore(noopSubscribe, detectChromium, () => false);
}

function detectMac() {
  return /Mac|iPhone|iPad/.test(navigator.platform || navigator.userAgent);
}

export function useIsMac() {
  return useSyncExternalStore(noopSubscribe, detectMac, () => true);
}

export const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
export const clamp01 = (v: number) => Math.min(1, Math.max(0, v));
