"use client";

import { animate, type AnimationPlaybackControls } from "motion/react";
import { rubberband, springFrom } from "@/lib/motion";
import { sunScrub } from "./sunClock";

/**
 * Holding the sun: the gesture behind the desktop's sun handle. While
 * held, the hour follows the hand (sunScrub, so the whole city relights
 * and the clock widget reads that hour); past sunrise or sunset it
 * resists (rubber band); on release it springs back to now carrying the
 * hand's speed, and can be caught again mid-flight. Values are minutes
 * from now, so the spring works on small numbers.
 */

const MIN = 60_000;
let flight: AnimationPlaybackControls | null = null;

/** What the sky shows right now, as minutes from now. */
function shownOffset() {
  const v = sunScrub.get();
  return v == null ? 0 : (v - Date.now()) / MIN;
}

/** Catch the sun (stops a return in flight); returns the instant on screen. */
export function grabSun() {
  flight?.stop();
  flight = null;
  return Date.now() + shownOffset() * MIN;
}

/** Hold it at an instant, banded between `min` and `max` (ms). */
export function holdSun(ms: number, min: number, max: number) {
  const span = 90 * MIN;
  const v = ms < min ? min - rubberband(min - ms, span) : ms > max ? max + rubberband(ms - max, span) : ms;
  sunScrub.set(v);
  return v;
}

/**
 * Let go: back to now. `velocity` in minutes per second (the hand's speed
 * in sky time), `thrown` allows the one bounce a throw earns.
 */
export function releaseSun(velocity = 0, thrown = false) {
  flight?.stop();
  const from = shownOffset();
  if (Math.abs(from) < 0.5 || window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
    sunScrub.set(null);
    flight = null;
    return;
  }
  flight = animate(from, 0, {
    ...springFrom(0.4, thrown ? 0.18 : 0),
    velocity,
    restDelta: 0.2,
    restSpeed: 2,
    onUpdate: (v) => sunScrub.set(Date.now() + v * MIN),
    onComplete: () => {
      sunScrub.set(null);
      flight = null;
    },
  });
}
