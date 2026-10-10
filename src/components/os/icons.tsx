"use client";

import type { AppId } from "./apps";

/**
 * CONTRACT (owner: dock agent)
 * Pixel app icons: hand-drawn 16×16 cell maps rendered as crisp SVG rects
 * (shapeRendering crispEdges), sitting on a glass squircle tile tinted by
 * the app accent. `size` in CSS px. Decorative (aria-hidden) — labels
 * live on the button/link.
 */
export function AppIcon({ app, size = 48 }: { app: AppId | "terminal"; size?: number }) {
  return (
    <span
      aria-hidden
      className="grid place-items-center rounded-[28%] glass-thin font-mono text-[10px] text-label-2"
      style={{ width: size, height: size }}
    >
      {app.slice(0, 2)}
    </span>
  );
}
