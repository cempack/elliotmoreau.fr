"use client";

import type { Rect } from "./physics";
import { PIP_ATTRS, readPip } from "../../pip";

/**
 * When the Desktop becomes an iOS home screen: narrow screens, and short
 * touch screens (a phone held sideways is wide but has no room for a desk).
 * desktop.css spells out the same condition; keep the two in step.
 */
export const PHONE = "(max-width: 767px), (pointer: coarse) and (max-height: 520px)";
export const isPhone = () => window.matchMedia(PHONE).matches;

/** The shell's menu bar height in px. */
export function menubarPx() {
  const root = getComputedStyle(document.documentElement);
  const rem = parseFloat(root.fontSize) || 16;
  return (parseFloat(root.getPropertyValue("--menubar-h")) || 2.75) * rem;
}

/**
 * Where the shell's mini player is coming to rest, in viewport px, or null
 * when there is none. The shell publishes its resting rect on <html>
 * (contract B), so this is where it is going, not where a fling has it
 * right now: icons can make room before it lands.
 */
export function pipRect(): Rect | null {
  const pip = readPip();
  return pip && { left: pip.left, top: pip.top, right: pip.right, bottom: pip.bottom };
}

/**
 * Calls `cb` (once per frame at most) whenever the mini player appears,
 * leaves, is flung to another corner, or collapses / expands: each time,
 * it republishes its rect on <html>.
 */
export function watchPip(cb: () => void) {
  let raf = 0;
  let last = "";
  const fire = () => {
    // inline style changes for other reasons too: only a new rect counts
    const r = pipRect();
    const key = r ? `${r.left},${r.top},${r.right},${r.bottom}` : "";
    if (key === last) return;
    last = key;
    cancelAnimationFrame(raf);
    raf = requestAnimationFrame(cb);
  };
  last = (() => {
    const r = pipRect();
    return r ? `${r.left},${r.top},${r.right},${r.bottom}` : "";
  })();
  const mo = new MutationObserver(fire);
  mo.observe(document.documentElement, { attributes: true, attributeFilter: PIP_ATTRS });
  return () => {
    cancelAnimationFrame(raf);
    mo.disconnect();
  };
}
