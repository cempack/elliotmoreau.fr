"use client";

import { useRef } from "react";
import { m, useScroll, useTransform, type MotionStyle, type MotionValue } from "motion/react";
import { useI18n } from "@/i18n/client";
import { clamp01, useMedia, useReduced } from "@/hooks/env";
import { PixelLabel } from "@/components/PixelLabel";
import { words } from "./util";

/**
 * Chapter 2, the manifesto: three short lines in huge type, read word by
 * word with the scroll. Each word brightens and its weight swells from
 * hairline to semibold; accent words land in signal lime with a pixel
 * dithered underline that fills in pixel steps, and a block cursor
 * follows the reading like a terminal's. Pinned on wide screens; phones read it in normal flow with
 * the same scrub; reduced motion shows it finished and still.
 */
export function Manifesto() {
  const reduced = useReduced();
  const wide = useMedia("(min-width: 768px) and (min-height: 600px)");
  const mode = reduced ? "still" : wide ? "pin" : "flow";
  // offsets differ per mode; remount so useScroll starts clean
  return <ManifestoScene key={mode} mode={mode} />;
}

function ManifestoScene({ mode }: { mode: "pin" | "flow" | "still" }) {
  const { t } = useI18n();
  const s = t.story.manifesto;
  const ref = useRef<HTMLElement>(null);
  const { scrollYProgress: p } = useScroll({
    target: ref,
    offset: mode === "pin" ? ["start start", "end end"] : ["start 70%", "end 50%"],
  });
  const lines = s.lines.map(words);
  const total = lines.reduce((n, l) => n + l.length, 0);
  let index = 0;
  const startOf = (i: number) => (i >= total ? Infinity : 0.04 + (i / total) * 0.72);

  return (
    <section ref={ref} className="app-story-mf" data-mode={mode} data-veil="0.86" aria-labelledby="story-mf-title">
      <div className="app-story-mf-stage">
        <h2 id="story-mf-title" className="app-story-kicker app-story-mf-kicker">
          <span aria-hidden className="app-story-kicker-n">
            <PixelLabel text="02" cell={2} />
          </span>
          <span>{s.kicker}</span>
        </h2>
        <div className="app-story-mf-lines">
          {lines.map((line, li) => (
            <p key={li} className="app-story-mf-line">
              {line.map((w, wi) => {
                const i = index++;
                return (
                  <ScrubWord
                    key={wi}
                    p={p}
                    a={startOf(i)}
                    next={startOf(i + 1)}
                    accent={w.accent}
                    still={mode === "still"}
                    last={i === total - 1}
                    first={wi === 0}
                  >
                    {w.text}
                  </ScrubWord>
                );
              })}
            </p>
          ))}
        </div>
      </div>
    </section>
  );
}

function ScrubWord({
  p,
  a,
  next,
  accent,
  still,
  last,
  first,
  children,
}: {
  p: MotionValue<number>;
  /** where this word starts lighting up (scene progress) */
  a: number;
  /** where the next one does (Infinity for the last word) */
  next: number;
  accent: boolean;
  still: boolean;
  last: boolean;
  first: boolean;
  children: string;
}) {
  // reading runs over the first ~80% of the scene; each word takes a beat
  const b = a + 0.1;
  const k = useTransform(p, (v) => (still ? 1 : clamp01((v - a) / (b - a))));
  const opacity = useTransform(k, (v) => 0.16 + 0.84 * v);
  const w = useTransform(k, (v) => Math.round((accent ? 280 : 260) + (accent ? 480 : 360) * v));
  // the underline fills in eight pixel steps
  const line = useTransform(k, (v) => Math.round(v * 8) / 8);
  // a terminal block cursor sits after the word being read
  const caret = useTransform(p, (v) => (still ? (last ? 1 : 0) : v >= a + 0.05 && v < next + 0.05 ? 1 : 0));
  return (
    <>
      {!first && " "}
      <span className="app-story-mf-word" data-accent={accent || undefined} data-first={first || undefined}>
        <span className="app-story-mf-ghost" aria-hidden>
          {children}
        </span>
        <m.span className="app-story-mf-live" style={{ opacity, "--app-story-w": w } as MotionStyle}>
          {children}
        </m.span>
        {accent && <m.span aria-hidden className="app-story-mf-under" style={{ scaleX: line }} />}
        <m.span aria-hidden className="app-story-mf-caret" data-last={last || undefined} style={{ opacity: caret }} />
      </span>
    </>
  );
}
