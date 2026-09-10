"use client";

import { useEffect, useRef } from "react";

// ordered-dither dissolve, dark bark → forest greens, bone for hot cells
const GREENS = ["#425047", "#4f6240", "#A7C080", "#83C092", "#CFE3B8"];
const BONE = "#EDEAD8";

// 4x4 Bayer matrix
const BAYER = [
  0, 8, 2, 10,
  12, 4, 14, 6,
  3, 11, 1, 9,
  15, 7, 13, 5,
];

function hash(x: number, y: number) {
  let h = (x * 374761393 + y * 668265263) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

// smaller cells on narrow screens keep the field dense, not chunky
const cellFor = (w: number) => (w < 480 ? 7 : w < 1024 ? 8 : 9);

/**
 * Pixel-dissolve separator: a full-bleed ordered-dither ribbon that melts
 * out top and bottom, finished like frosted glass — merged translucent cells with brushed
 * column streaks and additive strikes, the same material as the hero
 * wordmark. Two shimmer fronts cross the band, sparse cells twinkle, your
 * pointer carries a lantern light (tap to flash it), and scrolling fast
 * makes the whole field glow a little hotter.
 *
 * Perf: the field is baked once per resize into an offscreen layer. Per
 * frame the canvas does one drawImage plus only the living cells — sweep
 * bands, pointer light, twinkles, sparkles. Paused off-screen; static
 * (pointer light only) under reduced motion.
 */
export function PixelDivider() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const wrapRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const cvs = canvasRef.current;
    const wrap = wrapRef.current;
    if (!cvs || !wrap) return;
    const ctx = cvs.getContext("2d");
    if (!ctx) return;
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    let W = 0;
    let H = 0;
    let CELL = 9;
    let raf = 0;
    let visible = true;
    let lastPaint = 0;
    const t0 = performance.now();
    const off = document.createElement("canvas");
    const octx = off.getContext("2d");

    // living cells, collected at bake time so frames never scan the field
    let twinkles: { gx: number; gy: number; h: number }[] = [];
    let sparks: { gx: number; gy: number; h: number }[] = [];

    // pointer lantern + scroll heat, both decayed per frame
    const pointer = { x: 0, y: 0, inside: false, energy: 0, burst: 0 };
    let scrollBoost = 0;
    let lastScrollY = window.scrollY;

    const rows = () => Math.ceil(H / CELL);

    // full-bleed field: populated all the way to the viewport edges,
    // with only a gentle denser heart in the middle
    const density = (px: number) => 0.3 + 0.16 * (1 - Math.abs(px / W - 0.5) * 2);
    // vertical dissolve: the ribbon melts into the page top and bottom
    const yFall = (gy: number) =>
      Math.pow(Math.sin((Math.PI * (gy + 0.5)) / Math.max(1, rows())), 0.6);
    // soft alpha near the top/bottom rows — no hard edge
    const edgeFade = (gy: number) => {
      const r = rows();
      return Math.min(1, (gy + 1) / 2, (r - gy) / 2);
    };

    // one cell in the frosted style: merged translucent body with a brushed
    // column streak, additively re-struck when bright. wave lifts cells near
    // a travelling front, glow is the pointer lantern, tw scales a twinkle.
    const paintCell = (
      c: CanvasRenderingContext2D,
      gx: number,
      gy: number,
      wave: number,
      tw: number,
      sparkOn: boolean,
      glow: number,
    ) => {
      const px = gx * CELL;
      const py = gy * CELL;
      const b = BAYER[(gy % 4) * 4 + (gx % 4)] / 16;
      const g = density(px) * yFall(gy);
      if (b > g) return;
      const energy = Math.max(wave, Math.min(1.4, glow));
      const depth = Math.min(1, (g - b) * 3 + 0.25);
      const h = hash(gx, gy);
      const bright = depth > 0.5 || energy > 0.45;
      const gi = Math.min(
        GREENS.length - 1,
        Math.floor(h * h * GREENS.length + depth * 1.5 + energy * 1.4),
      );
      // brushed streaks: column-coherent shade steps baked per column
      const sh = hash(gx, 7919);
      const streak = 0.9 + 0.1 * sh;
      const edge = edgeFade(gy);
      const spark = sparkOn && h > 0.986;
      const alpha = Math.max(
        0.05,
        Math.min(1, (0.14 + depth * 0.5 + energy * 0.35) * streak * tw * (0.35 + 0.65 * edge)),
      );
      if (bright && energy > 0.35) {
        c.globalAlpha = Math.min(1, (energy - 0.35) * 0.9);
        c.fillStyle = "#CFE3B8";
        c.fillRect(px - 1, py - 1, CELL + 1, CELL + 1);
      }
      c.globalAlpha = alpha;
      c.fillStyle = spark || glow > 0.62 ? BONE : GREENS[gi];
      // frosted: merged bodies, no grout — slight overdraw melts the seams
      c.fillRect(px, py, CELL + 0.6, CELL + 0.6);
      if (bright) {
        c.globalCompositeOperation = "lighter";
        c.globalAlpha = alpha * 0.15;
        c.fillRect(px, py, CELL + 0.6, CELL + 0.6);
        c.globalCompositeOperation = "source-over";
      }
    };

    const bake = () => {
      if (!octx) return;
      off.width = Math.round(W * dpr);
      off.height = Math.round(H * dpr);
      octx.setTransform(dpr, 0, 0, dpr, 0, 0);
      octx.clearRect(0, 0, W, H);
      twinkles = [];
      sparks = [];
      const cols = Math.ceil(W / CELL);
      for (let gy = 0; gy < rows(); gy++) {
        for (let gx = 0; gx < cols; gx++) {
          const px = gx * CELL;
          const b = BAYER[(gy % 4) * 4 + (gx % 4)] / 16;
          if (b > density(px) * yFall(gy)) continue;
          const h = hash(gx, gy);
          paintCell(octx, gx, gy, 0, 1, false, 0);
          if (!reduced && h > 0.96) twinkles.push({ gx, gy, h });
          if (!reduced && h > 0.986) sparks.push({ gx, gy, h });
        }
      }
      // heart glow baked in: soft light hugging the dense middle
      const glow = octx.createRadialGradient(W / 2, H / 2, 0, W / 2, H / 2, W * 0.32);
      glow.addColorStop(0, "rgba(167,192,128,0.12)");
      glow.addColorStop(1, "rgba(167,192,128,0)");
      octx.fillStyle = glow;
      octx.fillRect(0, 0, W, H);
    };

    const layout = () => {
      W = cvs.clientWidth || window.innerWidth;
      H = cvs.clientHeight || 92;
      CELL = cellFor(W);
      cvs.width = Math.round(W * dpr);
      cvs.height = Math.round(H * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      bake();
      if (reduced) paintBase();
    };
    window.addEventListener("resize", layout);

    const paintBase = () => {
      ctx.clearRect(0, 0, W, H);
      if (octx) ctx.drawImage(off, 0, 0, W, H);
      ctx.globalAlpha = 1;
    };

    // pointer lantern: relight cells around the cursor with a hot bone core
    const paintPointer = (energy: number) => {
      if (energy < 0.02) return;
      const R = 15; // cells
      const cgx = pointer.x / CELL;
      const cgy = pointer.y / CELL;
      const cols = Math.ceil(W / CELL);
      for (let gx = Math.max(0, Math.floor(cgx - R)); gx <= Math.min(cols - 1, Math.ceil(cgx + R)); gx++) {
        for (let gy = Math.max(0, Math.floor(cgy - R)); gy <= Math.min(rows() - 1, Math.ceil(cgy + R)); gy++) {
          const d = Math.hypot(gx + 0.5 - cgx, gy + 0.5 - cgy);
          if (d > R) continue;
          const fall = (1 - d / R) * (1 - d / R) * energy;
          if (fall < 0.04) continue;
          ctx.clearRect(gx * CELL - 1, gy * CELL - 1, CELL + 2, CELL + 2);
          paintCell(ctx, gx, gy, 0, 1, false, fall);
        }
      }
    };

    const paint = (now: number) => {
      const t = (now - t0) / 1000;
      ctx.clearRect(0, 0, W, H);
      // the dissolve edge breathes as one global shimmer — no per-cell math
      ctx.globalAlpha = reduced ? 1 : 0.95 + 0.05 * Math.sin(t * 0.9);
      if (octx) ctx.drawImage(off, 0, 0, W, H);
      ctx.globalAlpha = 1;
      if (reduced) return;
      const heat = 1 + Math.min(1.2, scrollBoost) * 0.7;
      // two shimmer fronts crossing the band in opposite directions;
      // repaint only the columns around each front
      const sweeps: { pos: number; width: number; strength: number }[] = [
        { pos: ((t * 0.2) % 1.5) - 0.25, width: 0.12, strength: 1 },
        { pos: 1.25 - ((t * 0.13 + 0.6) % 1.5), width: 0.09, strength: 0.55 },
      ];
      const cols = Math.ceil(W / CELL);
      for (const s of sweeps) {
        const gx0 = Math.max(0, Math.floor(((s.pos - s.width) * W) / CELL));
        const gx1 = Math.min(cols - 1, Math.ceil(((s.pos + s.width) * W) / CELL));
        for (let gx = gx0; gx <= gx1; gx++) {
          const wave =
            Math.max(0, 1 - Math.abs((gx * CELL) / W - s.pos) / s.width) * s.strength * heat;
          if (wave < 0.01) continue;
          for (let gy = 0; gy < rows(); gy++) {
            // erase exactly the halo footprint — no dark halo left behind
            ctx.clearRect(gx * CELL - 1, gy * CELL - 1, CELL + 2, CELL + 2);
            paintCell(ctx, gx, gy, wave, 1, false, 0);
          }
        }
      }
      // lantern follows the pointer, flash on tap
      pointer.energy += ((pointer.inside ? 1 : 0) - pointer.energy) * 0.18;
      pointer.burst *= 0.9;
      paintPointer(pointer.energy + pointer.burst);
      // twinkles: sparse cells breathing on their own phase
      for (const tw of twinkles) {
        const a = 0.5 + 0.5 * Math.sin(t * 3.2 + tw.h * 40);
        // erase exactly the cell body — neighbours untouched
        ctx.clearRect(tw.gx * CELL, tw.gy * CELL, CELL + 0.6, CELL + 0.6);
        paintCell(ctx, tw.gx, tw.gy, 0, 0.25 + 0.75 * a, false, 0);
      }
      // rare bone-white sparkle flashes
      for (const sp of sparks) {
        if ((t * 0.8 + sp.h * 9) % 1 < 0.18) {
          paintCell(ctx, sp.gx, sp.gy, 0.7, 1, true, 0);
        }
      }
      scrollBoost *= 0.92;
      ctx.globalAlpha = 1;
    };

    const toLocal = (e: PointerEvent) => {
      const r = cvs.getBoundingClientRect();
      pointer.x = e.clientX - r.left;
      pointer.y = e.clientY - r.top;
    };
    const onPointerMove = (e: PointerEvent) => {
      toLocal(e);
      pointer.inside = true;
      if (reduced) {
        paintBase();
        paintPointer(1);
      }
    };
    const onPointerLeave = () => {
      pointer.inside = false;
      if (reduced) paintBase();
    };
    const onPointerDown = (e: PointerEvent) => {
      toLocal(e);
      pointer.inside = true;
      pointer.burst = 1.4;
      if (reduced) {
        paintBase();
        paintPointer(1);
      }
    };
    const onScroll = () => {
      const y = window.scrollY;
      scrollBoost = Math.min(1.5, scrollBoost + Math.abs(y - lastScrollY) / 500);
      lastScrollY = y;
    };
    cvs.addEventListener("pointermove", onPointerMove);
    cvs.addEventListener("pointerleave", onPointerLeave);
    cvs.addEventListener("pointerdown", onPointerDown);
    if (!reduced) window.addEventListener("scroll", onScroll, { passive: true });

    layout();
    paint(t0);
    if (!reduced) {
      const io = new IntersectionObserver(([e]) => {
        visible = e.isIntersecting;
        if (visible) {
          cancelAnimationFrame(raf);
          raf = requestAnimationFrame(frame);
        }
      });
      io.observe(wrap);
      const frame = (now: number) => {
        raf = requestAnimationFrame(frame);
        if (!visible) return;
        if (now - lastPaint < 33) return; // 30fps: drift, not motion
        lastPaint = now;
        paint(now);
      };
      raf = requestAnimationFrame(frame);
      return () => {
        cancelAnimationFrame(raf);
        io.disconnect();
        window.removeEventListener("resize", layout);
        window.removeEventListener("scroll", onScroll);
        cvs.removeEventListener("pointermove", onPointerMove);
        cvs.removeEventListener("pointerleave", onPointerLeave);
        cvs.removeEventListener("pointerdown", onPointerDown);
      };
    }
    return () => {
      window.removeEventListener("resize", layout);
      cvs.removeEventListener("pointermove", onPointerMove);
      cvs.removeEventListener("pointerleave", onPointerLeave);
      cvs.removeEventListener("pointerdown", onPointerDown);
    };
  }, []);

  return (
    <div ref={wrapRef} className="relative z-10" aria-hidden>
      <canvas
        ref={canvasRef}
        className="block h-[72px] w-full touch-pan-y sm:h-[92px] [image-rendering:pixelated]"
      />
    </div>
  );
}
