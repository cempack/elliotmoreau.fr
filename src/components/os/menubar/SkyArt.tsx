"use client";

import { useEffect, useRef } from "react";
import { m } from "motion/react";
import { spring } from "@/lib/motion";
import { SKY_PHASES, phaseForHour, type SkyMode, type SkyPhase } from "../sky";

/**
 * A 104×28 pixel postcard of the Paris sky for Control Center. The sky is
 * Bayer-dithered per phase into four tiny canvases painted once and
 * cross-faded; hills and a little Eiffel Tower are SVG cells; the sun or
 * moon is a sprite that rides its arc on a spring. In Live mode it sits
 * where the real sun is over Paris right now.
 */

const W = 104;
const H = 28;
const HORIZON = 21;

const SKIES: Record<SkyPhase, string[]> = {
  night: ["#040607", "#0a1314", "#152626"],
  dawn: ["#0a1213", "#20302f", "#5e6a62", "#d6b48c"],
  day: ["#16252a", "#2b4249", "#557379", "#a9bdb9"],
  dusk: ["#07090c", "#1b2228", "#4b4a4f", "#c98762"],
};
const FAR_HILL: Record<SkyPhase, string> = {
  night: "#111433",
  dawn: "#3a2347",
  day: "#1d4f72",
  dusk: "#3b1740",
};
const NEAR_HILL: Record<SkyPhase, string> = {
  night: "#0a0c0b",
  dawn: "#0d0a1c",
  day: "#0a1a2c",
  dusk: "#0b0716",
};
const STARS: Record<SkyPhase, { n: number; maxY: number }> = {
  night: { n: 30, maxY: 18 },
  dawn: { n: 8, maxY: 7 },
  day: { n: 0, maxY: 0 },
  dusk: { n: 10, maxY: 8 },
};

const BAYER = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5];
const bayer = (x: number, y: number) => (BAYER[((y & 3) << 2) | (x & 3)] + 0.5) / 16;
const hex = (h: string) => [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16)];

function rng(seed: number) {
  let a = seed;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function paintSky(ctx: CanvasRenderingContext2D, phase: SkyPhase) {
  const stops = SKIES[phase].map(hex);
  const img = ctx.createImageData(W, H);
  const d = img.data;
  const span = stops.length - 1;
  for (let y = 0; y < H; y++) {
    const t = Math.min(1, y / HORIZON) * span;
    const i = Math.min(span - 1, Math.floor(t));
    const f = t - i;
    for (let x = 0; x < W; x++) {
      const c = bayer(x, y) < f ? stops[i + 1] : stops[i];
      const k = (y * W + x) * 4;
      d[k] = c[0];
      d[k + 1] = c[1];
      d[k + 2] = c[2];
      d[k + 3] = 255;
    }
  }
  const r = rng(phase.length * 977 + 13);
  const { n, maxY } = STARS[phase];
  for (let s = 0; s < n; s++) {
    const x = Math.floor(r() * W);
    const y = Math.floor(r() * maxY);
    const a = 0.35 + r() * 0.6;
    const k = (y * W + x) * 4;
    d[k] = d[k] + (245 - d[k]) * a;
    d[k + 1] = d[k + 1] + (242 - d[k + 1]) * a;
    d[k + 2] = d[k + 2] + (236 - d[k + 2]) * a;
  }
  ctx.putImageData(img, 0, 0);
}

function SkyCanvas({ phase, active }: { phase: SkyPhase; active: boolean }) {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const ctx = ref.current?.getContext("2d");
    if (ctx) paintSky(ctx, phase);
  }, [phase]);
  return (
    <canvas
      ref={ref}
      width={W}
      height={H}
      className="os-menubar-skyart-canvas"
      data-active={active || undefined}
      aria-hidden
    />
  );
}

/* hill silhouettes: one column of cells per x, heights from layered sines */
const farHill = Array.from({ length: W }, (_, x) =>
  Math.round(HORIZON - 1 - (2.2 + 1.8 * Math.sin(x * 0.11 + 0.6) + 1.1 * Math.sin(x * 0.29 + 2.1)))
);
const nearHill = Array.from({ length: W }, (_, x) =>
  Math.round(HORIZON + 2 - (1.4 + 1.3 * Math.sin(x * 0.07 + 2.4) + 0.8 * Math.sin(x * 0.23)))
);
const EIFFEL = [
  "...#...",
  "...#...",
  "...#...",
  "..###..",
  "..#.#..",
  "..###..",
  ".##.##.",
  ".#...#.",
  ".#####.",
  "##...##",
  "#.....#",
];
const EIFFEL_X = 74;
const EIFFEL_CELLS: [number, number][] = [];
EIFFEL.forEach((row, y) => {
  for (let x = 0; x < row.length; x++) {
    if (row[x] === "#") EIFFEL_CELLS.push([EIFFEL_X + x, nearHill[EIFFEL_X + 3] - EIFFEL.length + y]);
  }
});

const SUN = ["..###..", ".#####.", "#######", "#######", "#######", ".#####.", "..###.."];
const HALO = [
  "...#.#...",
  "..#...#..",
  ".#.....#.",
  "#.......#",
  ".........",
  "#.......#",
  ".#.....#.",
  "..#...#..",
  "...#.#...",
];
const MOON = ["..###..", ".###...", "###....", "###....", "###....", ".###...", "..###.."];
const cellsOf = (rows: string[], ox = 0, oy = 0) => {
  const out: [number, number][] = [];
  rows.forEach((r, y) => {
    for (let x = 0; x < r.length; x++) if (r[x] === "#") out.push([x + ox, y + oy]);
  });
  return out;
};
const SUN_CELLS = cellsOf(SUN);
const HALO_CELLS = cellsOf(HALO, -1, -1);
const MOON_CELLS = cellsOf(MOON);

/** Sun/moon top-left (cells) along the arc, for a phase or a real hour. */
function bodyPos(mode: SkyMode, hour: number | null) {
  const arc = (u: number) => ({ x: Math.round(8 + u * (W - 23)), y: Math.round(3 + (1 - Math.sin(Math.PI * u)) * 15) });
  const h = hour ?? 22;
  const phase: SkyPhase = mode === "auto" ? phaseForHour(h) : mode;
  if (phase === "night") {
    // moon climbs through the night: 21:00 → 05:30
    const nh = mode === "auto" ? (h >= 21 ? h - 21 : h + 3) / 8.5 : 0.62;
    return { phase, sun: { x: W - 18, y: 34 }, moon: arc(Math.min(0.92, Math.max(0.08, nh))) };
  }
  const u = mode === "auto" ? Math.min(0.97, Math.max(0.03, (h - 6) / 15)) : phase === "dawn" ? 0.12 : phase === "day" ? 0.5 : 0.9;
  return { phase, sun: arc(u), moon: { x: 20, y: 34 } };
}

export function SkyArt({ mode, hour }: { mode: SkyMode; hour: number | null }) {
  const { phase, sun, moon } = bodyPos(mode, hour);
  const sunColor = phase === "day" ? "#ffd27a" : "var(--color-ember)";
  return (
    <div className="os-menubar-skyart" data-phase={phase} aria-hidden>
      {SKY_PHASES.map((p) => (
        <SkyCanvas key={p} phase={p} active={p === phase} />
      ))}
      <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="xMidYMid slice" shapeRendering="crispEdges" className="os-menubar-skyart-svg">
        <m.g initial={false} animate={{ x: sun.x, y: sun.y, opacity: phase === "night" ? 0 : 1 }} transition={spring.gentle}>
          <g fill={sunColor} opacity={0.45}>
            {HALO_CELLS.map(([x, y]) => (
              <rect key={`h${x}-${y}`} x={x} y={y} width={1.02} height={1.02} />
            ))}
          </g>
          <g fill={sunColor}>
            {SUN_CELLS.map(([x, y]) => (
              <rect key={`s${x}-${y}`} x={x} y={y} width={1.02} height={1.02} />
            ))}
          </g>
        </m.g>
        <m.g
          initial={false}
          animate={{ x: moon.x, y: moon.y, opacity: phase === "night" ? 1 : 0 }}
          transition={spring.gentle}
          fill="var(--color-label)"
        >
          {MOON_CELLS.map(([x, y]) => (
            <rect key={`m${x}-${y}`} x={x} y={y} width={1.02} height={1.02} />
          ))}
        </m.g>
        <g className="os-menubar-skyart-far" style={{ fill: FAR_HILL[phase] }}>
          {farHill.map((top, x) => (
            <rect key={`f${x}`} x={x} y={top} width={1.02} height={H - top} />
          ))}
        </g>
        <g className="os-menubar-skyart-near" style={{ fill: NEAR_HILL[phase] }}>
          {nearHill.map((top, x) => (
            <rect key={`n${x}`} x={x} y={top} width={1.02} height={H - top} />
          ))}
          {EIFFEL_CELLS.map(([x, y]) => (
            <rect key={`e${x}-${y}`} x={x} y={y} width={1.02} height={1.02} />
          ))}
        </g>
        {phase !== "day" && (
          <rect x={EIFFEL_X + 3} y={EIFFEL_CELLS[0][1] - 1} width={1} height={1} fill="var(--color-ember)" />
        )}
      </svg>
    </div>
  );
}
