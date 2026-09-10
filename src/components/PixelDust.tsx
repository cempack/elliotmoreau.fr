"use client";

import { useEffect, useRef } from "react";

const INKS = ["#A7C080", "#A7C080", "#D3C6AA", "#3D484D"];

type Mote = {
  fx: number;
  fy: number;
  size: number;
  ph: number;
  sp: number;
  ink: string;
};

/**
 * Fixed full-page pixel dust behind the content: sparse chunky squares that
 * drift and twinkle over the backdrop, on every page. Pauses off-screen
 * automatically (rAF) and renders nothing for reduced motion.
 */
export function PixelDust() {
  const ref = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = ref.current;
    if (!canvas) return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const dpr = Math.min(window.devicePixelRatio || 1, 1.5);
    let w = 0;
    let h = 0;
    let motes: Mote[] = [];
    const seed = () => {
      const n = Math.round((w * h) / 24000);
      const count = Math.max(50, Math.min(170, n));
      motes = Array.from({ length: count }, () => ({
        fx: Math.random(),
        fy: Math.random(),
        size: 3 + Math.random() * Math.random() * 8,
        ph: Math.random() * Math.PI * 2,
        sp: 0.4 + Math.random() * 0.9,
        ink: INKS[(Math.random() * INKS.length) | 0],
      }));
    };
    const resize = () => {
      w = window.innerWidth;
      h = window.innerHeight;
      canvas.width = Math.round(w * dpr);
      canvas.height = Math.round(h * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      seed();
    };
    resize();
    window.addEventListener("resize", resize);

    let raf = 0;
    let last = 0;
    let dead = false;
    const wrap = (v: number) => ((v % 1) + 1) % 1;
    const frame = (now: number) => {
      if (dead) return;
      raf = requestAnimationFrame(frame);
      if (now - last < 40) return;
      last = now;
      const t = now / 1000;
      ctx.clearRect(0, 0, w, h);
      for (const m of motes) {
        const x = wrap(m.fx + 0.02 * Math.sin(t * 0.1 * m.sp + m.ph)) * w;
        const y = wrap(m.fy + 0.018 * Math.cos(t * 0.09 * m.sp + m.ph * 1.6)) * h;
        const tw = 0.5 + 0.5 * Math.sin(t * (0.4 + m.sp * 0.6) + m.ph * 2);
        ctx.globalAlpha = 0.05 + 0.24 * tw * tw;
        ctx.fillStyle = m.ink;
        ctx.fillRect(x - m.size / 2, y - m.size / 2, m.size, m.size);
      }
      ctx.globalAlpha = 1;
    };
    raf = requestAnimationFrame(frame);

    return () => {
      dead = true;
      cancelAnimationFrame(raf);
      window.removeEventListener("resize", resize);
    };
  }, []);

  return (
    <canvas
      ref={ref}
      aria-hidden
      className="pointer-events-none fixed inset-0 z-[1] h-full w-full"
    />
  );
}
