"use client";

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
