"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useLang } from "@/lib/i18n";
import { playHeroField, type Bitmap, type GridEffect } from "@/lib/ttfx";

// calm pool only: decrypt, rings, waves. The loud ones (beams, prism,
// fireworks, blackhole…) turn the name into noise instead of presenting
// it — they stay available to TtfxText one-shots, just not the ambient loop.
const CALM_EFFECTS: GridEffect[] = ["grid-decrypt", "grid-rings", "grid-waves"];
import { rasterizePixelLine, GLYPH_H, WORDMARK_LINES } from "@/lib/pixelword";
import { PixelWordmark } from "@/components/PixelWordmark";

/**
 * The name as a giant hand-drawn pixel wordmark in a living field: an
 * ambient lattice drifts behind the letters, the pointer and a wandering
 * sprite lift nearby cells to brass, and full-grid ttfx effects etch the
 * name on a loop. Click the name to restart the loop. First paint is an SSR
 * pixel wordmark (never fallback text); screen readers get the plain heading.
 */
export function HeroNameFx() {
  const { t } = useLang();
  const boxRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const cancelRef = useRef<(() => void) | null>(null);
  const visibleRef = useRef(false);
  const startedRef = useRef(false);
  const stageRef = useRef<HTMLDivElement>(null);
  const pointerRef = useRef({ x: 0, y: 0, active: false });
  const [playing, setPlaying] = useState(false);
  const [showStatic, setShowStatic] = useState(true);
  const [reduced, setReduced] = useState(false);

  const line1 = t("hero.line1");
  const line2 = t("hero.line2");

  const start = useCallback(() => {
    const box = boxRef.current;
    const canvas = canvasRef.current;
    if (!box || !canvas || box.clientWidth < 8) return;
    cancelRef.current?.();
    const cols = Math.max(44, Math.min(150, Math.round(box.clientWidth / 8)));
    const rows = Math.max(30, Math.min(80, Math.round(box.clientHeight / 8)));

    // stamp the pixel wordmark big and centered on the grid
    const l1 = rasterizePixelLine(WORDMARK_LINES[0]);
    const l2 = rasterizePixelLine(WORDMARK_LINES[1]);
    const nativeW = Math.max(l1.cols, l2.cols);
    const gapFor = (s: number) => Math.max(2, Math.round(s * 0.85));
    let s = Math.max(1, Math.floor((cols * 0.97) / nativeW));
    while (s > 1 && 2 * GLYPH_H * s + gapFor(s) > rows) s--;
    const gap = gapFor(s);
    const top = Math.floor((rows - (2 * GLYPH_H * s + gap)) / 2);
    const top2 = top + GLYPH_H * s + gap;
    const bands = [
      { from: top, to: top + GLYPH_H * s - 1 },
      { from: top2, to: top2 + GLYPH_H * s - 1 },
    ];
    const lit = new Uint8Array(cols * rows);
    const stamp = (line: { grid: Uint8Array; cols: number; rows: number }, y0: number) => {
      const x0 = Math.floor((cols - line.cols * s) / 2);
      for (let r = 0; r < line.rows; r++) {
        for (let c = 0; c < line.cols; c++) {
          if (!line.grid[r * line.cols + c]) continue;
          for (let dy = 0; dy < s; dy++) {
            for (let dx = 0; dx < s; dx++) {
              const cc = x0 + c * s + dx;
              const rr = y0 + r * s + dy;
              if (cc >= 0 && cc < cols && rr >= 0 && rr < rows) lit[rr * cols + cc] = 1;
            }
          }
        }
      }
    };
    stamp(l1, top);
    stamp(l2, top2);
    const map: Bitmap = { cols, rows, lit, chars: [] };

    setPlaying(true);
    cancelRef.current = playHeroField(canvas, map, {
      motes: true,
      bands,
      extrude: true,
      effects: CALM_EFFECTS,
      hold: 5500, // the name rests readable; shimmer is the exception
      restFade: 0.85, // frosted glass: translucent, uniform, no dissolve
      restSheen: 1, // the load animation's glow, frozen instead of fading
    });
    // the static wordmark steps aside once effect chaos covers the handoff —
    // delayed so the differently-scaled canvas never double-visions against
    // it; replays never bring it back (the canvas keeps its last frame)
    if (!startedRef.current) {
      startedRef.current = true;
      window.setTimeout(() => {
        if (cancelRef.current) setShowStatic(false);
      }, 550);
    }
  }, []);
  const startRef = useRef(start);
  useEffect(() => {
    startRef.current = start;
  });

  useEffect(() => {
    const rm = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    // reduced motion: never start the canvas, the pixel wordmark stays
    if (rm) {
      queueMicrotask(() => setReduced(true));
      return;
    }
    let dead = false;
    const io = new IntersectionObserver(
      ([entry]) => {
        const now = entry.isIntersecting;
        if (now === visibleRef.current) return;
        visibleRef.current = now;
        if (now) {
          if (!dead) startRef.current();
        } else {
          cancelRef.current?.();
          cancelRef.current = null;
        }
      },
      { threshold: 0.2, rootMargin: "64px" }
    );
    const box = boxRef.current;
    if (box) io.observe(box);
    let resizeTimer = 0;
    const onResize = () => {
      window.clearTimeout(resizeTimer);
      resizeTimer = window.setTimeout(() => {
        if (!dead && visibleRef.current) startRef.current();
      }, 250);
    };
    window.addEventListener("resize", onResize);
    // the footer wordmark replays the entrance on demand
    const onReplay = () => {
      if (!dead && visibleRef.current) startRef.current();
    };
    window.addEventListener("em:replay", onReplay);
    // perpetual cinematic drift: the stage orbits on fast non-repeating
    // sine pairs (depth lives in the canvas extrusion now); the pointer
    // only bends the orbit, never owns it
    const stage = stageRef.current;
    let curX = 0;
    let curY = 0;
    let driftRaf = 0;
    let lastDrift = 0;
    const drift = (now: number) => {
      driftRaf = requestAnimationFrame(drift);
      if (dead || !visibleRef.current || !stage) return;
      // ±13° sine drift reads identically at 30fps — no style churn per frame
      if (now - lastDrift < 33) return;
      lastDrift = now;
      const t = now / 1000;
      const autoY =
        7 * Math.sin((2 * Math.PI * t) / 7 + 1.7) + 2.8 * Math.sin((2 * Math.PI * t) / 4.6 + 0.6);
      const autoX =
        5.6 * Math.sin((2 * Math.PI * t) / 5.8 + 2.9) + 2.2 * Math.sin((2 * Math.PI * t) / 4.1 + 1.2);
      const p = pointerRef.current;
      const targetY = Math.max(-13, Math.min(13, autoY + (p.active ? p.x * 16 : 0)));
      const targetX = Math.max(-11, Math.min(11, autoX + (p.active ? p.y * 14 : 0)));
      curY += (targetY - curY) * 0.085;
      curX += (targetX - curX) * 0.085;
      stage.style.setProperty("--ry", `${curY.toFixed(3)}deg`);
      stage.style.setProperty("--rx", `${curX.toFixed(3)}deg`);
    };
    driftRaf = requestAnimationFrame(drift);
    return () => {
      dead = true;
      cancelAnimationFrame(driftRaf);
      io.disconnect();
      window.clearTimeout(resizeTimer);
      window.removeEventListener("resize", onResize);
      window.removeEventListener("em:replay", onReplay);
      cancelRef.current?.();
      setPlaying(false);
    };
  }, []);

  // pointer feed for the drift loop: normalized offsets that ease back to
  // neutral when the cursor leaves, so the stage never snaps
  const tilt = (e: { clientX: number; clientY: number }) => {
    if (reduced) return;
    const box = boxRef.current;
    if (!box) return;
    const rect = box.getBoundingClientRect();
    pointerRef.current = {
      x: (e.clientX - rect.left) / rect.width - 0.5,
      y: (e.clientY - rect.top) / rect.height - 0.5,
      active: true,
    };
  };
  const untilt = () => {
    pointerRef.current.active = false;
  };

  return (
    <div
      ref={boxRef}
      onClick={() => startRef.current()}
      onPointerMove={tilt}
      onPointerLeave={untilt}
      title={t("hero.replay")}
      className="relative h-[88svh] min-h-[480px] w-full cursor-pointer [perspective:900px]"
    >
      {/* screen-reader heading; sighted users get the pixel wordmark below */}
      <h1 className="sr-only">
        {line1} {line2}
      </h1>
      {/* drifting stage: the canvas carries its own extrusion, so face and
          depth rotate as one rigid solid — no ghost layers */}
      <div
        ref={stageRef}
        aria-hidden
        className="absolute inset-0 [transform:rotateX(var(--rx,0deg))_rotateY(var(--ry,0deg))] [transform-style:preserve-3d]"
      >
        {/* instant pixel wordmark: SSR content and the reduced-motion face —
            it steps aside once the live canvas is raging, never on replay */}
        <div
          className={`absolute inset-0 flex items-center justify-center transition-opacity duration-150 ${
            showStatic ? "opacity-100" : "opacity-0"
          }`}
        >
          <PixelWordmark className="h-full w-full" />
        </div>
        <canvas
          ref={canvasRef}
          className={`absolute inset-0 h-full w-full transition-opacity duration-300 ${
            playing ? "opacity-100" : "pointer-events-none opacity-0"
          }`}
        />
      </div>
    </div>
  );
}
