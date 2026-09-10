"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  playHeroField,
  textBitmap,
  type GridEffect,
  type TtfxTone,
} from "@/lib/ttfx";

const SINGLE: Record<string, GridEffect> = {
  decrypt: "grid-decrypt",
  matrix: "grid-matrix",
  sweep: "grid-beams",
};

type OldEffect = "decrypt" | "matrix" | "sweep";

/**
 * Short label under a continuous disturbance: the mono text stays put while
 * fronts wash over it, then rests readable — forever. Pauses off-screen.
 * Screen readers and SSR only ever see the plain text.
 */
export function TtfxText({
  text,
  effect = "decrypt",
  tone = "bone",
  delay = 0,
  hold = 2600,
  loop = true,
  className = "",
}: {
  text: string;
  effect?: OldEffect;
  tone?: TtfxTone;
  delay?: number;
  hold?: number;
  /** loop forever (default) or decrypt once, then hand back plain text */
  loop?: boolean;
  className?: string;
}) {
  const boxRef = useRef<HTMLSpanElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [playing, setPlaying] = useState(false);
  // stable finish handler for one-shot mode — handed straight to the engine
  const handleDone = useCallback(() => setPlaying(false), []);

  useEffect(() => {
    const box = boxRef.current;
    const canvas = canvasRef.current;
    if (!box || !canvas) return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    let cancel: (() => void) | null = null;
    let timer = 0;
    let visible = false;
    let started = false;
    let dead = false;

    const cycle = () => {
      if (!visible || dead || box.clientWidth < 4) return;
      cancel?.();
      setPlaying(true);
      cancel = playHeroField(canvas, textBitmap(text), {
        ambient: false,
        sprite: false,
        effects: [SINGLE[effect]],
        dur: 1100,
        hold: loop ? hold : 700,
        restTone: tone,
        restGlyph: "char",
        once: !loop,
        onDone: loop ? undefined : handleDone,
      });
    };
    const io = new IntersectionObserver(
      (entries) => {
        const now = entries.some((e) => e.isIntersecting);
        if (now === visible) return;
        visible = now;
        if (visible) {
          timer = window.setTimeout(cycle, started ? 0 : delay);
          started = true;
        } else {
          window.clearTimeout(timer);
          cancel?.();
          cancel = null;
        }
      },
      { threshold: 0.4 }
    );
    io.observe(box);
    return () => {
      dead = true;
      io.disconnect();
      window.clearTimeout(timer);
      cancel?.();
      setPlaying(false);
    };
  }, [text, effect, tone, delay, hold, loop, handleDone]);

  return (
    <span ref={boxRef} aria-label={text} className={`relative inline-block ${className}`}>
      <span aria-hidden className={playing ? "text-transparent" : undefined}>
        {text}
      </span>
      <canvas
        ref={canvasRef}
        aria-hidden
        className={`absolute inset-0 h-full w-full transition-opacity duration-200 ${
          playing ? "opacity-100" : "opacity-0"
        }`}
      />
    </span>
  );
}
