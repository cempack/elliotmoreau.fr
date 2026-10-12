"use client";

import { useSyncExternalStore } from "react";

/**
 * The current quarter hour (ms since epoch / 15 min, floored): one shared
 * 60s check for every view that re-reads the sky in step with the
 * wallpaper (the dock's Desktop icon, the Atlas horizon). 0 on the server.
 */
export const QUARTER = 900_000;

let now = 0;
const subs = new Set<() => void>();
let timer = 0;

function subscribe(cb: () => void) {
  subs.add(cb);
  if (!timer)
    timer = window.setInterval(() => {
      const q = Math.floor(Date.now() / QUARTER);
      if (q !== now) {
        now = q;
        subs.forEach((f) => f());
      }
    }, 60_000);
  return () => {
    subs.delete(cb);
    if (!subs.size) {
      window.clearInterval(timer);
      timer = 0;
    }
  };
}

const get = () => now || (now = Math.floor(Date.now() / QUARTER));

export function useQuarterHour() {
  return useSyncExternalStore(subscribe, get, () => 0);
}
