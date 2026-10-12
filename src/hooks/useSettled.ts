"use client";

import { useSyncExternalStore } from "react";

/**
 * True when no view transition is running: an app window has finished
 * growing out of the Dock (or there was no transition: a hard load).
 * Heavy, decorative work (painting pixel canvases, decoding art) waits for
 * it, so it never lands in the frames of an opening animation.
 */
/** a view transition is running right now */
export function viewTransitionActive() {
  try {
    return document.documentElement.matches(":active-view-transition");
  } catch {
    // a browser without the pseudo-class has no transitions to wait for
    return false;
  }
}

/**
 * Run `fn` now, or, while a view transition plays, in the first frame after
 * it has finished. For effects: a component mounting with a window renders
 * before the transition starts (so `useSettled()` still reads true), but
 * its effects run inside it. Returns a cancel for the effect's cleanup.
 */
export function afterTransition(fn: () => void): () => void {
  if (!viewTransitionActive()) {
    fn();
    return () => {};
  }
  let raf = 0;
  const tick = () => {
    if (viewTransitionActive()) raf = requestAnimationFrame(tick);
    else fn();
  };
  raf = requestAnimationFrame(tick);
  return () => cancelAnimationFrame(raf);
}

function subscribe(notify: () => void) {
  let raf = 0;
  let was = viewTransitionActive();
  const tick = () => {
    const now = viewTransitionActive();
    if (now !== was) {
      was = now;
      notify();
    }
    // only poll while one runs; a new one starts from a commit, which re-reads the snapshot
    if (now) raf = requestAnimationFrame(tick);
  };
  if (was) raf = requestAnimationFrame(tick);
  return () => cancelAnimationFrame(raf);
}

export function useSettled() {
  return useSyncExternalStore(subscribe, () => !viewTransitionActive(), () => true);
}
