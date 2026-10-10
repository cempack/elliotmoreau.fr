"use client";

/**
 * CONTRACT (owner: shell/visual agent)
 * Fixed, full-viewport pixel landscape behind everything (z-index 0),
 * painted ONCE per (viewport size, sky phase) — never a continuous loop,
 * so Liquid Glass can refract it cheaply. Reads `useSky()`; until the
 * Paris hour is known it must still look right (html[data-sky] is set
 * pre-paint; a CSS gradient per phase is the instant fallback).
 * Sparse life (a few twinkling pixels, a slow shooting star) only via
 * tiny CSS-animated elements, off under reduced motion.
 */
export function Wallpaper() {
  return <div aria-hidden className="os-wallpaper" />;
}
