"use client";

import { useEffect, useRef } from "react";
import { m, useScroll, useTransform } from "motion/react";
import { useReduced } from "./env";

/**
 * The night behind the glass. One canvas, painted once (and again only when
 * the width changes): dithered pixel stars, a pixel moon with a dithered
 * halo, and two layers of pixel hills. Glass refracts a still image, so
 * nothing here redraws per frame. A handful of CSS fireflies blink slowly.
 */

const CELL = 3; // css px per art pixel

const BAYER = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5];
const bayer = (x: number, y: number) => (BAYER[((y & 3) << 2) | (x & 3)] + 0.5) / 16;

function mulberry32(a: number) {
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function paint(canvas: HTMLCanvasElement) {
  const rect = canvas.getBoundingClientRect();
  const W = Math.max(40, Math.ceil(rect.width / CELL));
  const H = Math.max(40, Math.ceil(rect.height / CELL));
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext("2d");
  if (!ctx) return;
  ctx.clearRect(0, 0, W, H);
  const rnd = mulberry32(0xe11107);
  const px = (x: number, y: number, c: string) => {
    ctx.fillStyle = c;
    ctx.fillRect(x, y, 1, 1);
  };

  // stars: denser toward the zenith, a few tinted, a few bright crosses
  const count = Math.round((W * H) / 300);
  const tints = ["216,220,200", "216,220,200", "216,220,200", "216,220,200", "131,192,146", "167,192,128", "229,200,144"];
  for (let i = 0; i < count; i++) {
    const x = Math.floor(rnd() * W);
    const y = Math.floor(Math.pow(rnd(), 1.5) * H * 0.82);
    const tint = tints[Math.floor(rnd() * tints.length)];
    const b = rnd();
    const a = 0.18 + b * b * 0.62;
    px(x, y, `rgba(${tint},${a.toFixed(2)})`);
    if (b > 0.975) {
      const arm = `rgba(${tint},${(a * 0.45).toFixed(2)})`;
      px(x - 1, y, arm);
      px(x + 1, y, arm);
      px(x, y - 1, arm);
      px(x, y + 1, arm);
      px(x, y, `rgba(240,240,225,0.95)`);
    }
  }

  // moon: dithered sphere shading, dithered halo, a few craters
  const cx = Math.round(W * 0.8);
  const cy = Math.round(H * 0.17);
  const rm = Math.max(8, Math.round(Math.min(W, H) * 0.05));
  const halo = rm * 3.4;
  for (let y = Math.floor(cy - halo); y <= cy + halo; y++) {
    for (let x = Math.floor(cx - halo); x <= cx + halo; x++) {
      const d = Math.hypot(x - cx, y - cy);
      if (d <= rm || d > halo) continue;
      const f = Math.pow(1 - (d - rm) / (halo - rm), 2.2);
      if (bayer(x, y) < f * 0.9) px(x, y, `rgba(229,200,144,${(0.05 + f * 0.13).toFixed(3)})`);
    }
  }
  const L = { x: 0.55, y: -0.45, z: 0.7 };
  const ll = Math.hypot(L.x, L.y, L.z);
  const shades = ["#5f5c4b", "#9b9479", "#d4cba9", "#f2ead0"];
  const craters = [
    { x: -0.35, y: 0.2, r: 0.22 },
    { x: 0.25, y: -0.35, r: 0.14 },
    { x: 0.1, y: 0.45, r: 0.12 },
    { x: -0.15, y: -0.1, r: 0.09 },
  ];
  for (let y = cy - rm; y <= cy + rm; y++) {
    for (let x = cx - rm; x <= cx + rm; x++) {
      const nx = (x + 0.5 - cx) / rm;
      const ny = (y + 0.5 - cy) / rm;
      const n2 = nx * nx + ny * ny;
      if (n2 > 1) continue;
      const nz = Math.sqrt(1 - n2);
      let v = Math.max(0, (nx * L.x + ny * L.y + nz * L.z) / ll);
      for (const c of craters) if (Math.hypot(nx - c.x, ny - c.y) < c.r) v *= 0.78;
      const lvl = Math.max(0, Math.min(3, Math.floor(v * 3.4 + bayer(x, y) - 0.35)));
      px(x, y, shades[lvl]);
    }
  }

  // hills: far and near silhouettes with stepped, dithered crests
  const hill = (base: number, amp: number, seed: number, color: string, crest: string) => {
    for (let x = 0; x < W; x++) {
      const t = x / W;
      const h =
        base -
        amp *
          (0.55 * Math.sin(t * 5.1 + seed) +
            0.3 * Math.sin(t * 11.3 + seed * 2.1) +
            0.15 * Math.sin(t * 23.7 + seed * 0.7));
      const top = Math.round(h);
      ctx.fillStyle = color;
      ctx.fillRect(x, top, 1, H - top);
      // dithered lip catches a little moonlight
      if (bayer(x, top) < 0.6) px(x, top, crest);
      if (bayer(x, top - 1) < 0.2) px(x, top - 1, crest);
    }
  };
  hill(H * 0.86, H * 0.05, 1.3, "#0c1719", "rgba(131,192,146,0.20)");
  hill(H * 0.93, H * 0.04, 4.2, "#081113", "rgba(167,192,128,0.16)");
}

const FIREFLIES = [
  { l: "12%", t: "78%", d: "0s", s: 6 },
  { l: "27%", t: "84%", d: "1.8s", s: 7.4 },
  { l: "46%", t: "80%", d: "3.1s", s: 5.6 },
  { l: "63%", t: "86%", d: "0.9s", s: 6.8 },
  { l: "78%", t: "79%", d: "2.4s", s: 7.9 },
  { l: "91%", t: "83%", d: "4.2s", s: 6.2 },
  { l: "36%", t: "22%", d: "1.2s", s: 8.4 },
  { l: "58%", t: "12%", d: "3.6s", s: 9.2 },
];

export function Backdrop() {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    let lastW = 0;
    let t = 0;
    const run = () => {
      const w = window.innerWidth;
      if (w === lastW) return;
      lastW = w;
      paint(canvas);
    };
    run();
    const onResize = () => {
      window.clearTimeout(t);
      t = window.setTimeout(run, 200);
    };
    window.addEventListener("resize", onResize);
    return () => {
      window.clearTimeout(t);
      window.removeEventListener("resize", onResize);
    };
  }, []);

  return (
    <div className="g-sky" aria-hidden>
      <canvas ref={canvasRef} className="g-sky-canvas" />
      {FIREFLIES.map((f, i) => (
        <span
          key={i}
          className="g-firefly"
          style={{ left: f.l, top: f.t, animationDelay: f.d, animationDuration: `${f.s}s` }}
        />
      ))}
    </div>
  );
}

/**
 * Soft colour field that sits behind a section and drifts against the
 * scroll, so the glass above always has something moving to bend.
 */
export function Blob({
  tone,
  className = "",
  speed = 90,
}: {
  tone: "ember" | "glacier" | "moon" | "teal" | "rose";
  className?: string;
  speed?: number;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const reduced = useReduced();
  const { scrollYProgress } = useScroll({ target: ref, offset: ["start end", "end start"] });
  const y = useTransform(scrollYProgress, [0, 1], [speed, -speed]);
  return (
    <m.div
      ref={ref}
      aria-hidden
      className={`g-blob g-blob--${tone} ${className}`}
      style={reduced ? undefined : { y }}
    />
  );
}
