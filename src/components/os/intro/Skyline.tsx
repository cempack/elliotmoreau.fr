"use client";

import { useArtPalette } from "@/hooks/useTheme";
import type { ArtPalette } from "@/lib/theme";

/**
 * A city skyline for the lock screen while Elliot is away: no art per
 * city, a row of pixel buildings grown from the city's name (the same name
 * always gives the same skyline) in a tint picked from the palette by that
 * name, with a few lit windows.
 */

const TINTS: (keyof ArtPalette)[] = ["ion", "lilac", "ember", "flare", "signal"];
const W = 360;
const H = 40;

function rng(seed: string) {
  let h = 2166136261;
  for (let i = 0; i < seed.length; i++) h = Math.imul(h ^ seed.charCodeAt(i), 16777619);
  return () => {
    h = Math.imul(h ^ (h >>> 15), 2246822507);
    h = Math.imul(h ^ (h >>> 13), 3266489909);
    return ((h ^= h >>> 16) >>> 0) / 4294967296;
  };
}

export function Skyline({ city }: { city: string }) {
  const P = useArtPalette();
  const r = rng(city.toLowerCase());
  const tint = P[TINTS[Math.floor(r() * TINTS.length)]];
  const blocks: { x: number; w: number; h: number; spire: boolean }[] = [];
  for (let x = 0; x < W; ) {
    const w = 3 + Math.floor(r() * 7);
    const tall = r() < 0.12;
    const h = tall ? 22 + Math.floor(r() * 14) : 6 + Math.floor(r() * 14);
    blocks.push({ x, w, h, spire: tall && r() < 0.6 });
    x += w + (r() < 0.25 ? 1 : 0);
  }
  const windows: { x: number; y: number }[] = [];
  for (const b of blocks)
    for (let y = H - b.h + 2; y < H - 2; y += 3)
      for (let x = b.x + 1; x < b.x + b.w - 1; x += 2) if (r() < 0.09) windows.push({ x, y });

  return (
    <svg className="os-lock-skyline" viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="xMidYMax slice" shapeRendering="crispEdges" aria-hidden>
      <defs>
        <linearGradient id="os-skyline-fade" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor={tint} stopOpacity="0.55" />
          <stop offset="1" stopColor={tint} stopOpacity="0.18" />
        </linearGradient>
      </defs>
      {blocks.map((b, i) => (
        <g key={i}>
          <rect x={b.x} y={H - b.h} width={b.w} height={b.h} fill="url(#os-skyline-fade)" />
          {b.spire && <rect x={b.x + Math.floor(b.w / 2)} y={H - b.h - 5} width="1" height="5" fill={tint} fillOpacity="0.5" />}
        </g>
      ))}
      {windows.map((w, i) => (
        <rect key={`w${i}`} x={w.x} y={w.y} width="1" height="1" fill={P.emberLight} fillOpacity="0.8" />
      ))}
    </svg>
  );
}
