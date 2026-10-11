"use client";

/**
 * When the Desktop becomes an iOS home screen: narrow screens, and short
 * touch screens (a phone held sideways is wide but has no room for a desk).
 * desktop.css spells out the same condition; keep the two in step.
 */
export const PHONE = "(max-width: 767px), (pointer: coarse) and (max-height: 520px)";
export const isPhone = () => window.matchMedia(PHONE).matches;

/** Where the shell's menu bar ends, in px: its height plus any top inset (a home-screen app runs under the status bar). */
export function menubarPx() {
  const bar = document.querySelector(".os-menubar");
  if (bar) return bar.getBoundingClientRect().bottom;
  const root = getComputedStyle(document.documentElement);
  const rem = parseFloat(root.fontSize) || 16;
  return (parseFloat(root.getPropertyValue("--menubar-h")) || 2.75) * rem;
}

/** The top inset alone (0 in a browser tab), as the menu bar measures it. */
export function safeTopPx() {
  const root = getComputedStyle(document.documentElement);
  const rem = parseFloat(root.fontSize) || 16;
  return Math.max(0, menubarPx() - (parseFloat(root.getPropertyValue("--menubar-h")) || 2.75) * rem);
}
