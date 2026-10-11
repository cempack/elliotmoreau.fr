"use client";

import { useRef } from "react";
import { AnimatePresence, m } from "motion/react";
import { PixelPlanet } from "@/components/PixelPlanet";
import { useReduced } from "@/hooks/env";
import { springFrom } from "@/lib/motion";
import type { Cells } from "@/components/glyphs";
import { useOnScreen, useTabHidden } from "./lib";

/* 7×7 pixel glyphs for the widget headers */
export const G_NOTE: Cells = [
  [3, 0], [4, 0], [5, 0], [6, 0],
  [3, 1], [6, 1],
  [3, 2], [6, 2],
  [3, 3], [6, 3],
  [1, 4], [2, 4], [3, 4], [5, 4], [6, 4],
  [0, 5], [1, 5], [2, 5], [3, 5], [4, 5], [5, 5], [6, 5],
  [1, 6], [2, 6], [4, 6], [5, 6],
];
export const G_CLOCK: Cells = [
  [2, 0], [3, 0], [4, 0],
  [1, 1], [5, 1],
  [0, 2], [3, 2], [6, 2],
  [0, 3], [3, 3], [4, 3], [6, 3],
  [0, 4], [6, 4],
  [1, 5], [5, 5],
  [2, 6], [3, 6], [4, 6],
];
export const G_BUILD: Cells = [
  [2, 1], [1, 2], [0, 3], [1, 4], [2, 5],
  [4, 1], [5, 2], [6, 3], [5, 4], [4, 5],
  [3, 0], [3, 2], [3, 4], [3, 6],
];
export const G_PULSE: Cells = [
  [0, 3], [1, 3],
  [2, 0], [2, 1], [2, 2],
  [3, 4], [3, 5], [3, 6],
  [4, 3], [5, 3], [6, 3],
];
export const G_FETCH: Cells = [
  [0, 0], [1, 0], [2, 0], [3, 0], [4, 0], [5, 0], [6, 0],
  [0, 1], [6, 1],
  [0, 2], [1, 2], [6, 2],
  [0, 3], [2, 3], [6, 3],
  [0, 4], [1, 4], [3, 4], [4, 4], [6, 4],
  [0, 5], [6, 5],
  [0, 6], [1, 6], [2, 6], [3, 6], [4, 6], [5, 6], [6, 6],
];
export const G_BOOK: Cells = [
  [1, 0], [2, 0], [4, 0], [5, 0],
  [0, 1], [3, 1], [6, 1],
  [0, 2], [3, 2], [6, 2],
  [0, 3], [3, 3], [6, 3],
  [0, 4], [3, 4], [6, 4],
  [0, 5], [1, 5], [2, 5], [4, 5], [5, 5], [6, 5],
  [3, 6],
];
export const G_PEN: Cells = [
  [5, 0],
  [4, 1], [6, 1],
  [3, 2], [5, 2],
  [2, 3], [4, 3],
  [1, 4], [3, 4],
  [0, 5], [2, 5],
  [0, 6], [1, 6],
];
export const G_ARROW: Cells = [
  [2, 0], [3, 0], [4, 0], [5, 0], [6, 0],
  [6, 1], [6, 2], [6, 3], [6, 4],
  [5, 1], [4, 2], [3, 3], [2, 4], [1, 5], [0, 6],
];
export const G_RESET: Cells = [
  [2, 0], [3, 0], [4, 0],
  [1, 1], [5, 1],
  [0, 2], [6, 2],
  [0, 3], [6, 3],
  [0, 4], [5, 4], [6, 4], [4, 4],
  [1, 5], [5, 5],
  [2, 6], [3, 6],
];
export const G_NEXT: Cells = [
  [2, 0], [3, 1], [4, 2], [5, 3], [4, 4], [3, 5], [2, 6],
  [0, 3], [1, 3], [2, 3], [3, 3], [4, 3],
];

export const G_CHECK: Cells = [
  [6, 1],
  [5, 2],
  [0, 3], [4, 3],
  [1, 4], [3, 4],
  [2, 5],
];

/**
 * The flare live dot. Lit only when `live`; it breathes unless `still`
 * (one breathing dot per screen: the headline's; the rest hold a steady
 * lit pixel).
 */
export function LiveDot({ live = true, still = false, className = "" }: { live?: boolean; still?: boolean; className?: string }) {
  return <span aria-hidden className={`app-now-dot ${className}`} data-live={live || undefined} data-still={still || undefined} />;
}

/**
 * Pixel cava: columns of 4px cells stepping through their own patterns
 * while music plays. Decorative; it isn't the audio, and it doesn't claim
 * to be. Holds still when paused, off screen, hidden or under reduced
 * motion.
 */
export function PixelCava({
  playing,
  still = false,
  cols = 24,
  className = "",
}: {
  playing: boolean;
  /** lit while playing, but never animated (a glyph, not a meter) */
  still?: boolean;
  cols?: number;
  className?: string;
}) {
  const ref = useRef<HTMLSpanElement>(null);
  const on = useOnScreen(ref, "80px");
  const hidden = useTabHidden();
  const reduced = useReduced();
  return (
    <span
      ref={ref}
      aria-hidden
      className={`app-now-cava ${className}`}
      data-playing={playing || undefined}
      data-still={still || undefined}
      data-paused={!playing || !on || hidden || reduced || undefined}
    >
      {Array.from({ length: cols }, (_, i) => {
        // a deterministic spread of resting heights, durations and phases
        const h = 2 + ((i * 7 + 3) % 5) + (i % 3 === 0 ? 1 : 0);
        return (
          <span
            key={i}
            className={`app-now-cava-col app-now-cava-col--${i % 4}`}
            style={
              {
                "--rest": h,
                "--dur": `${0.78 + ((i * 37) % 9) * 0.07}s`,
                "--delay": `${-((i * 53) % 11) * 0.09}s`,
              } as React.CSSProperties
            }
          />
        );
      })}
    </span>
  );
}

/** Album art, or a seeded pixel planet when there is none. */
export function Art({ image, seed, className = "" }: { image: string; seed: string; className?: string }) {
  return (
    <span className={`app-now-art ${className}`}>
      {image ? (
        // remote album art from Spotify's CDN, already sized
        // eslint-disable-next-line @next/next/no-img-element
        <img src={image} alt="" draggable={false} loading="lazy" decoding="async" />
      ) : (
        <PixelPlanet seed={seed} className="app-now-art-planet" />
      )}
    </span>
  );
}

/**
 * A time string whose characters roll like a split-flap when they change
 * (just a cross-fade under reduced motion). Fixed-width tabular digits so
 * nothing around it moves.
 */
/** a digit rolls on the house curve, a touch slower than default */
const ROLL = springFrom(0.42);

export function RollText({ text, className = "" }: { text: string; className?: string }) {
  const reduced = useReduced();
  return (
    <span className={`app-now-roll tabular ${className}`} aria-hidden>
      {Array.from(text).map((ch, i) => (
        <span key={i} className="app-now-roll-cell" data-sep={/\d/.test(ch) ? undefined : ""}>
          <AnimatePresence initial={false} mode="popLayout">
            <m.span
              key={ch}
              className="app-now-roll-ch"
              initial={reduced ? { opacity: 0 } : { y: "-70%", opacity: 0 }}
              animate={{ y: "0%", opacity: 1 }}
              exit={reduced ? { opacity: 0 } : { y: "70%", opacity: 0 }}
              transition={reduced ? { duration: 0.15 } : ROLL}
            >
              {ch}
            </m.span>
          </AnimatePresence>
        </span>
      ))}
    </span>
  );
}
