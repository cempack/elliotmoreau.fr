"use client";

import type { Rect } from "./physics";

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
 * when there is none. Its corner (html[data-pip-corner]) and the safe area
 * it snaps inside (.os-pip-safe) say where it is going, not where a fling
 * has it right now, so icons can make room before it lands.
 */
export function pipRect(): Rect | null {
  const corner = document.documentElement.dataset.pipCorner;
  const pip = document.querySelector<HTMLElement>(".os-pip");
  const safe = document.querySelector<HTMLElement>(".os-pip-safe");
  if (!corner || !pip || !safe || corner.length !== 2) return null;
  const r = safe.getBoundingClientRect();
  const w = pip.offsetWidth;
  const h = pip.offsetHeight;
  if (!w || !h) return null;
  const left = corner[1] === "l" ? r.left : Math.max(r.left, r.right - w);
  const top = corner[0] === "t" ? r.top : Math.max(r.top, r.bottom - h);
  return { left, top, right: left + w, bottom: top + h };
}

/**
 * Calls `cb` (once per frame at most) whenever the mini player appears,
 * leaves, is flung to another corner, or collapses / expands.
 */
export function watchPip(cb: () => void) {
  let raf = 0;
  const fire = () => {
    cancelAnimationFrame(raf);
    raf = requestAnimationFrame(cb);
  };
  let watched: HTMLElement | null = null;
  const ro = new ResizeObserver(fire);
  const attach = () => {
    const el = document.querySelector<HTMLElement>(".os-pip");
    if (el === watched) return;
    if (watched) ro.unobserve(watched);
    watched = el;
    if (el) ro.observe(el);
  };
  const mo = new MutationObserver(() => {
    attach();
    fire();
  });
  mo.observe(document.documentElement, { attributes: true, attributeFilter: ["data-pip-corner"] });
  attach();
  return () => {
    cancelAnimationFrame(raf);
    mo.disconnect();
    ro.disconnect();
  };
}
