"use client";

import { PixelGlyph, type Cells } from "@/components/glyphs";
import { PixelPlanet } from "@/components/PixelPlanet";
import { useParisTime } from "@/hooks/useParisTime";

/** 7×7 pixel moon (crescent) and sun, in the same grid as the shared glyphs. */
export const GLYPH_MOON: Cells = [
  [2, 0], [3, 0], [4, 0],
  [1, 1], [2, 1],
  [0, 2], [1, 2],
  [0, 3], [1, 3],
  [0, 4], [1, 4],
  [1, 5], [2, 5], [5, 5],
  [2, 6], [3, 6], [4, 6],
];
export const GLYPH_SUN: Cells = [
  [3, 0],
  [1, 1], [5, 1],
  [2, 2], [3, 2], [4, 2],
  [0, 3], [2, 3], [3, 3], [4, 3], [6, 3],
  [2, 4], [3, 4], [4, 4],
  [1, 5], [5, 5],
  [3, 6],
];

export function SkyGlyph({ hour, size = 14 }: { hour: number | null; size?: number }) {
  const day = hour != null && hour >= 7 && hour < 20;
  return <PixelGlyph cells={day ? GLYPH_SUN : GLYPH_MOON} size={size} className={day ? "g-sun" : "g-moon"} />;
}

/** Four bars that dance only while something is actually playing. */
export function Eq({ playing, className = "" }: { playing: boolean; className?: string }) {
  return (
    <span className={`g-eq ${className}`} data-playing={playing || undefined} aria-hidden>
      {[0, 1, 2, 3].map((i) => (
        <span key={i} style={{ animationDelay: `${-i * 0.23}s`, animationDuration: `${0.9 + (i % 3) * 0.17}s` }} />
      ))}
    </span>
  );
}

/** Album art, or a seeded pixel planet on a dithered tile when there is none. */
export function Cover({ image, seed, className = "" }: { image?: string; seed: string; className?: string }) {
  if (image) {
    return (
      <span className={`g-cover ${className}`}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={image} alt="" loading="lazy" />
      </span>
    );
  }
  return (
    <span className={`g-cover g-cover--pixel ${className}`} aria-hidden>
      <PixelPlanet seed={seed} className="g-cover-planet" />
    </span>
  );
}

/** Paris clock, tabular, with a stable placeholder until mounted. */
export function ParisClock({ seconds = false, className = "" }: { seconds?: boolean; className?: string }) {
  const { time } = useParisTime({ seconds });
  return (
    <span className={`g-tnum ${className}`} suppressHydrationWarning>
      {time ?? (seconds ? "--:--:--" : "--:--")}
    </span>
  );
}

export function Arrow({ className = "" }: { className?: string }) {
  return (
    <svg className={className} width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden>
      <path d="M4 10 10 4M5 4h5v5" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export function ExpandIcon({ className = "" }: { className?: string }) {
  return (
    <svg className={className} width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden>
      <path d="M8.5 2.5h3v3M5.5 11.5h-3v-3M11.5 2.5 8 6M2.5 11.5 6 8" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export function CloseIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden>
      <path d="m3.5 3.5 7 7m0-7-7 7" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" />
    </svg>
  );
}
