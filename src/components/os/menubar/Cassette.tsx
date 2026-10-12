"use client";

import { animate, m, useMotionValue, useMotionValueEvent, useTransform, type AnimationPlaybackControls } from "motion/react";
import { useEffect, useMemo, useRef, useState } from "react";
import { PixelCover } from "@/components/apps/now/Cover";
import { useReduced } from "@/hooks/env";
import { useArtPalette } from "@/hooks/useTheme";
import { project, spring, springFrom } from "@/lib/motion";
import { useSound } from "@/lib/sound";
import type { SpotifyStatus, TrackInfo } from "@/lib/spotify";
import { mix, type ArtPalette } from "@/lib/theme";

/**
 * The music panel as a C60 you can hold.
 *
 * Side A is the tape in hand: the real album art printed on the label
 * (multiplied into the paper, the way ink sits in it), title, artist and
 * album typeset beside it. Through the window, the two tape packs: the
 * left holds what is left of the track, the right what has played, radii
 * by conserved tape area (r = √(core² + f·(full² − core²))), so they
 * shrink and grow the way tape does. While it plays the hubs turn
 * counter-clockwise, each at ω ∝ 1/r (the emptying reel speeds up as the
 * song ends), and the tape streams past the pressure pad in the head
 * opening. Paused, everything holds still; last played, the tape is wound
 * to the end. The shell is the theme's own colour, lit from above.
 *
 * Side B is "On repeat lately": the top artists as a B-side tracklist.
 * Turn it over by dragging it sideways (1:1, the release projected), a
 * tap, Space/Enter or the A/B switch: a real half-turn in 3D about the
 * cassette's own middle, lifted off the panel while it turns, its edges
 * catching the light, its shadow narrowing under it. Both faces rest at
 * z = 0, so at rest the pixels sit exactly on the grid.
 *
 * Motion costs nothing between polls: the hubs and the tape are WAAPI
 * animations on the compositor (their speed changed with
 * updatePlaybackRate, so they never jump), and one requestAnimationFrame
 * loop, alive only while the panel is open, the tab visible and the
 * music playing, writes the counter once a second and repaints the packs
 * when they have grown half a pixel. React renders on a poll or a turn.
 */

/* ───────── geometry, in art pixels (2 CSS px each at desktop size) ───────── */

const AW = 172;
const AH = 110;
const HUB_Y = 68;
const HUB_X = [50, 122] as const;
/** a hub's rim, outer radius */
const HUB_R = 9;
/** the tape winds on from here */
const CORE = 9.5;
/** a full pack */
const FULL = 31;
const LABEL = { x0: 7, x1: 165, y0: 6, y1: 53 };
const WIN = { x0: 24, x1: 148, y0: 57, y1: 80, r: 5 };
/** the raised bottom section: a trapezoid from y to the bottom edge */
const BASE = { y: 88, top: [36, 136], bottom: [26, 146] } as const;
/** the tape along the bottom, and the head opening it crosses */
const RUN_Y = 101;
const HEAD = { x0: 76, x1: 96, y0: 96, y1: 104 };
/** openings through the bottom section: x, y, w, h */
const HOLES = [
  [42, 98, 5, 5],
  [60, 99, 3, 3],
  [HEAD.x0, HEAD.y0, HEAD.x1 - HEAD.x0, HEAD.y1 - HEAD.y0],
  [109, 99, 3, 3],
  [125, 98, 5, 5],
] as const;
const SCREWS = [
  [3, 3],
  [AW - 7, 3],
  [3, AH - 7],
  [AW - 7, AH - 7],
  [84, 90],
] as const;
/** the hub sprite: frames over 60° (six-fold symmetry) */
const FRAMES = 20;
/** tape speed, art px per second: calm, not the real 4.76 cm/s */
const SPEED = 24;
/** the hub animation's period (one 60° cycle) at radius R_REF */
const PERIOD = 1000;
const R_REF = (SPEED * PERIOD) / 1000 / (Math.PI / 3);
/** the tape in the head opening streams one opening-width per cycle */
const FLOW_MS = ((HEAD.x1 - HEAD.x0) / SPEED) * 1000;
/** thickness over width (12 mm on 100.4) */
const THICK = 0.118;
/** how far it lifts while it turns, in cqw of the cassette's width */
const LIFT = 9;

/** tape on each reel for a share played */
export function reels(f: number) {
  const p = Math.max(0, Math.min(1, f));
  const r = (share: number) => Math.sqrt(CORE * CORE + share * (FULL * FULL - CORE * CORE));
  return { left: r(1 - p), right: r(p) };
}

/* ───────── inks ───────── */

type RGB = [number, number, number];
const rgb = (h: string): RGB => [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16)];
const B4 = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5];
const bayer = (x: number, y: number) => (B4[((y & 3) << 2) | (x & 3)] + 0.5) / 16;
const noise = (x: number, y: number) => {
  let h = Math.imul(x * 374761393 + y * 668265263, 1274126177);
  h ^= h >>> 13;
  return ((Math.imul(h, 1103515245) >>> 0) & 1023) / 1024;
};

/** the theme's inks for the plastic, the tape and the paper */
function inksFor(p: ArtPalette) {
  // oxide: the warm accents, nearly black
  const tape = mix(mix(p.ember, p.flare, 0.35), p.ink950, 0.74);
  const shell = p.signalDeep;
  return {
    shell: rgb(shell),
    shellUp: rgb(mix(shell, p.signal, 0.28)),
    shellHi: rgb(mix(p.signal, p.paper2, 0.35)),
    shellLo: rgb(p.ink950),
    shellShade: rgb(mix(shell, p.ink900, 0.55)),
    inner: rgb(mix(p.ink800, p.ink700, 0.6)),
    innerLo: rgb(p.ink900),
    tape: rgb(tape),
    tapeHi: rgb(mix(tape, p.ember, 0.2)),
    tapeLo: rgb(mix(tape, p.ink950, 0.4)),
    felt: rgb(mix(p.lilac, p.ink900, 0.35)),
    spring: rgb(p.paper2),
    glare: rgb(mix(p.ink700, p.paper, 0.4)),
    paper: rgb(mix(p.paper, p.paper2, 0.12)),
    paperHi: rgb(p.paper),
    paperLo: rgb(mix(p.paper2, p.paper3, 0.4)),
    grain: rgb(mix(p.paper, p.paper2, 0.34)),
    screw: rgb(mix(p.paper2, p.signal, 0.3)),
    screwLo: rgb(mix(shell, p.ink950, 0.6)),
    side: { A: rgb(mix(p.signal, p.ink950, 0.3)), B: rgb(mix(p.lilac, p.ink950, 0.3)) },
    hub: rgb(p.paper),
    hubLo: rgb(mix(p.paper, p.paper2, 0.6)),
    hubIn: rgb(p.ink950),
  };
}
type Inks = ReturnType<typeof inksFor>;

/* 5×7 capitals for the side letter */
const BIG: Record<"A" | "B", string[]> = {
  A: [".###.", "#...#", "#...#", "#####", "#...#", "#...#", "#...#"],
  B: ["####.", "#...#", "#...#", "####.", "#...#", "#...#", "####."],
};

/* ───────── painting ───────── */

const inShell = (x: number, y: number) => {
  const cx = x < 4 ? 4 - x - 0.5 : x > AW - 5 ? x - (AW - 5) + 0.5 : 0;
  const cy = y < 4 ? 4 - y - 0.5 : y > AH - 5 ? y - (AH - 5) + 0.5 : 0;
  return cx === 0 || cy === 0 || Math.hypot(cx, cy) <= 4.2;
};
const inLabel = (x: number, y: number) => x >= LABEL.x0 && x < LABEL.x1 && y >= LABEL.y0 && y < LABEL.y1;
const inWindow = (x: number, y: number) => {
  if (x < WIN.x0 || x >= WIN.x1 || y < WIN.y0 || y >= WIN.y1) return false;
  const r = WIN.r;
  const cx = x < WIN.x0 + r ? WIN.x0 + r - x - 0.5 : x >= WIN.x1 - r ? x - (WIN.x1 - r) + 0.5 : 0;
  const cy = y < WIN.y0 + r ? WIN.y0 + r - y - 0.5 : y >= WIN.y1 - r ? y - (WIN.y1 - r) + 0.5 : 0;
  return cx === 0 || cy === 0 || Math.hypot(cx, cy) <= r;
};
const baseSpan = (y: number) => {
  const t = (y - BASE.y) / (AH - 1 - BASE.y);
  return [Math.round(BASE.top[0] + (BASE.bottom[0] - BASE.top[0]) * t), Math.round(BASE.top[1] + (BASE.bottom[1] - BASE.top[1]) * t)];
};
const inHole = (x: number, y: number) => HOLES.some(([hx, hy, w, h]) => x >= hx && x < hx + w && y >= hy && y < hy + h);

/**
 * One face: the inside (the packs, the tape across the bottom, the pad)
 * seen through the window and the openings, the plastic lit from above,
 * the label, then the moulded details. The hubs are sprites above it.
 */
function paint(cv: HTMLCanvasElement | null, side: "A" | "B", rl: number, rr: number, k: Inks, blank: boolean) {
  const ctx = cv?.getContext("2d");
  if (!ctx) return;
  // the inside: the far wall, darker towards the bottom of the window
  const scene: RGB[] = new Array(AW * AH);
  for (let y = 0; y < AH; y++) for (let x = 0; x < AW; x++) scene[y * AW + x] = y > HUB_Y + 6 ? k.innerLo : k.inner;
  const set = (x: number, y: number, c: RGB) => {
    if (x >= 0 && y >= 0 && x < AW && y < AH) scene[y * AW + x] = c;
  };
  // the packs: wound tape, faint rings, the outer turn catching the light,
  // a soft sheen on the upper left
  [rl, rr].forEach((R, h) => {
    const cx = HUB_X[h];
    for (let y = Math.floor(HUB_Y - R - 1); y <= HUB_Y + R + 1; y++) {
      for (let x = Math.floor(cx - R - 1); x <= cx + R + 1; x++) {
        const dx = x + 0.5 - cx;
        const dy = y + 0.5 - HUB_Y;
        const d = Math.hypot(dx, dy);
        if (d >= R || d < HUB_R - 0.5) continue;
        const a = Math.atan2(dy, dx);
        let c = Math.floor(d) % 3 === 0 ? k.tapeLo : k.tape;
        if (R - d < 1) c = k.tapeHi;
        else if (a > -2.7 && a < -1.75 && d > HUB_R + 1.5 && bayer(x, y) < 0.55 - Math.abs(a + 2.2) * 0.9) c = k.tapeHi;
        set(x, y, c);
      }
    }
  });
  // the tape along the bottom, and the pressure pad pressing it to the head
  for (let x = 0; x < AW; x++) set(x, RUN_Y, k.tape);
  for (let x = HEAD.x0 + 5; x < HEAD.x1 - 5; x++) {
    for (let y = HEAD.y0 + 1; y < RUN_Y; y++) set(x, y, k.felt);
    if (x % 3 === 0) set(x, HEAD.y0, k.spring);
  }

  const img = ctx.createImageData(AW, AH);
  const d = img.data;
  const put = (x: number, y: number, c: RGB) => {
    if (x < 0 || y < 0 || x >= AW || y >= AH || !inShell(x, y)) return;
    const o = (y * AW + x) * 4;
    d[o] = c[0];
    d[o + 1] = c[1];
    d[o + 2] = c[2];
    d[o + 3] = 255;
  };

  for (let y = 0; y < AH; y++) {
    for (let x = 0; x < AW; x++) {
      if (!inShell(x, y)) continue;
      let c: RGB;
      if (inLabel(x, y)) {
        // paper: lit along the top and left, a shade along its lower edge
        const top = y === LABEL.y0 || x === LABEL.x0;
        const low = y === LABEL.y1 - 1 || x === LABEL.x1 - 1;
        c = top ? k.paperHi : low ? k.paperLo : noise(x, y) < 0.05 ? k.grain : k.paper;
      } else if (inWindow(x, y)) {
        c = scene[y * AW + x];
        // two streaks of glare across the glass
        const s = x - WIN.x0 + (y - WIN.y0) * 1.3;
        if ((s > 30 && s < 34) || (s > 38 && s < 39.5) || (s > 104 && s < 106)) c = c.map((v, i) => v + (k.glare[i] - v) * 0.32) as RGB;
      } else if (inHole(x, y)) {
        c = scene[y * AW + x];
      } else {
        // the plastic, lit from above, dithered where the light gives out
        c = y + (bayer(x, y) - 0.5) * 4 < 24 ? k.shellUp : k.shell;
      }
      put(x, y, c);
    }
  }

  // the label's edge throws a hairline of shadow on the plastic under it
  for (let x = LABEL.x0 + 1; x <= LABEL.x1; x++) put(x, LABEL.y1, k.shellShade);
  for (let y = LABEL.y0 + 1; y < LABEL.y1; y++) put(LABEL.x1, y, k.shellShade);
  // the window, recessed: shadow under its top and left lips, light on the others
  for (let y = WIN.y0 - 1; y <= WIN.y1; y++)
    for (let x = WIN.x0 - 1; x <= WIN.x1; x++) {
      if (inWindow(x, y)) continue;
      if (inWindow(x + 1, y) || inWindow(x, y + 1)) put(x, y, k.shellLo);
      else if (inWindow(x - 1, y) || inWindow(x, y - 1)) put(x, y, k.shellHi);
    }
  // the bottom section stands proud: a lit top edge, a lit and a shaded flank
  for (let y = BASE.y; y < AH - 1; y++) {
    const [a, b] = baseSpan(y);
    if (y === BASE.y) for (let x = a; x <= b; x++) put(x, y, k.shellHi);
    put(a, y, k.shellUp);
    put(b, y, k.shellShade);
  }
  // the openings' lips
  HOLES.forEach(([hx, hy, w, h]) => {
    for (let x = hx; x < hx + w; x++) put(x, hy - 1, k.shellLo);
    for (let y = hy; y < hy + h; y++) put(hx + w, y, k.shellUp);
  });
  // grip ribs down both sides
  for (let y = 58; y < 86; y++) for (const x of [2, 3, AW - 4, AW - 3]) put(x, y, y % 2 ? k.shellShade : k.shellUp);
  // the write-protect tabs along the top edge
  for (const x0 of [14, AW - 22]) for (let x = x0; x < x0 + 8; x++) put(x, 1, k.shellShade);
  // screws: a round head, its recess
  SCREWS.forEach(([sx, sy]) => {
    for (let y = 0; y < 4; y++)
      for (let x = 0; x < 4; x++) {
        const corner = (x === 0 || x === 3) && (y === 0 || y === 3);
        if (!corner) put(sx + x, sy + y, x > 0 && x < 3 && y > 0 && y < 3 ? (x === 1 && y === 1 ? k.shellShade : k.screwLo) : k.screw);
      }
  });
  // the shell's bevel: a dark outline, light along the top and left
  for (let y = 0; y < AH; y++)
    for (let x = 0; x < AW; x++) {
      if (!inShell(x, y) || inLabel(x, y)) continue;
      if (!inShell(x - 1, y) || !inShell(x + 1, y) || !inShell(x, y - 1) || !inShell(x, y + 1)) put(x, y, k.shellLo);
      else if (!inShell(x, y - 2) || !inShell(x - 2, y)) put(x, y, k.shellHi);
      else if (!inShell(x, y + 2) || !inShell(x + 2, y)) put(x, y, k.shellShade);
    }
  // a blank tape: the label's writing lines, waiting
  if (blank) for (const ly of [22, 32, 42]) for (let x = LABEL.x0 + 7; x < LABEL.x1 - 22; x++) put(x, ly, k.paperLo);
  // the side letter, top right of the label
  BIG[side].forEach((row, gy) => {
    for (let gx = 0; gx < 5; gx++)
      if (row[gx] === "#")
        for (let q = 0; q < 4; q++) put(LABEL.x1 - 15 + gx * 2 + (q & 1), LABEL.y0 + 5 + gy * 2 + (q >> 1), k.side[side]);
  });

  ctx.putImageData(img, 0, 0);
}

/** a hub turning through 60° in FRAMES pixel-exact frames, as a strip */
function hubSprite(k: Inks) {
  const n = HUB_R * 2 + 1;
  const cv = document.createElement("canvas");
  cv.width = n * FRAMES;
  cv.height = n;
  const ctx = cv.getContext("2d");
  if (!ctx) return null;
  const img = ctx.createImageData(cv.width, n);
  const d = img.data;
  for (let f = 0; f < FRAMES; f++) {
    // counter-clockwise on screen: the angle falls frame by frame
    const turn = (-f * Math.PI) / 3 / FRAMES;
    for (let y = 0; y < n; y++)
      for (let x = 0; x < n; x++) {
        const dx = x + 0.5 - n / 2;
        const dy = y + 0.5 - n / 2;
        const r = Math.hypot(dx, dy);
        if (r > HUB_R + 0.3) continue;
        let c: RGB;
        if (r > HUB_R - 1.6) c = dx + dy > 2 ? k.hubLo : k.hub;
        else {
          // six drive teeth reaching in from the rim
          const a = Math.atan2(dy, dx) - turn;
          const off = Math.abs(((a % (Math.PI / 3)) + Math.PI / 3) % (Math.PI / 3) - Math.PI / 6);
          const tooth = r > 3.6 && off * r < 1.15;
          c = tooth ? (dx + dy > 0 ? k.hubLo : k.hub) : k.hubIn;
        }
        const o = (y * cv.width + f * n + x) * 4;
        d[o] = c[0];
        d[o + 1] = c[1];
        d[o + 2] = c[2];
        d[o + 3] = 255;
      }
  }
  ctx.putImageData(img, 0, 0);
  return cv.toDataURL();
}

/* ───────── the counter ───────── */

const mmss = (ms: number) => {
  const s = Math.max(0, Math.floor(ms / 1000));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
};

/** one drum of the counter: it only ever rolls forward, one step */
function setDrum(cell: Element, v: number, mod: number, roll: boolean) {
  const el = cell as HTMLElement;
  const strip = el.firstElementChild as HTMLElement | null;
  if (!strip) return;
  const prev = el.dataset.v === undefined ? -1 : Number(el.dataset.v);
  if (prev === v) return;
  el.dataset.v = String(v);
  const at = (i: number) => `translateY(${(-i * 100) / (mod + 1)}%)`;
  const wraps = prev === mod - 1 && v === 0;
  if (!roll || !(v === prev + 1 || wraps)) {
    strip.style.transition = "none";
    strip.style.transform = at(v);
    return;
  }
  strip.style.transition = "";
  // past the last digit it rolls onto the spare 0, then quietly back to the first
  strip.style.transform = at(wraps ? mod : v);
  if (wraps)
    strip.addEventListener(
      "transitionend",
      () => {
        if (el.dataset.v !== "0") return;
        strip.style.transition = "none";
        strip.style.transform = at(0);
      },
      { once: true }
    );
}

/** elapsed m:ss on drums, built for the current shape (9:59 → 10:00) */
function writeCounter(host: HTMLElement | null, s: number, roll: boolean) {
  if (!host) return;
  const txt = `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
  const mods = [...txt].map((ch, i) => (ch === ":" ? 0 : i === txt.length - 2 ? 6 : 10));
  const shape = mods.join(",");
  if (host.dataset.shape !== shape) {
    host.dataset.shape = shape;
    host.replaceChildren(
      ...mods.map((mod) => {
        const cell = document.createElement("span");
        if (!mod) {
          cell.className = "os-tape-colon";
          cell.textContent = ":";
          return cell;
        }
        cell.className = "os-tape-drum";
        const strip = document.createElement("span");
        strip.textContent = Array.from({ length: mod + 1 }, (_, i) => i % mod).join("\n");
        cell.append(strip);
        return cell;
      })
    );
    roll = false;
  }
  [...txt].forEach((ch, i) => {
    if (mods[i]) setDrum(host.children[i], Number(ch), mods[i], roll);
  });
}

/* ───────── the engine: everything that moves without React ───────── */

type Refs = {
  a: React.RefObject<HTMLCanvasElement | null>;
  b: React.RefObject<HTMLCanvasElement | null>;
  hubs: React.RefObject<HTMLSpanElement | null>[];
  flow: React.RefObject<HTMLSpanElement | null>;
  counter: React.RefObject<HTMLSpanElement | null>;
  bar: React.RefObject<HTMLSpanElement | null>;
};
type Clock = { pos: number; total: number; run: boolean; blank: boolean };

function createEngine(el: Refs) {
  let ink: Inks | null = null;
  let clock = { pos: 0, total: 0, run: false, blank: true, at: 0 };
  let spin = false;
  let roll = true;
  let raf = 0;
  let drawn = "";
  let shown = -1;
  const loopOpts = { duration: PERIOD, iterations: Infinity, easing: `steps(${FRAMES})` };
  const hubs = el.hubs.map((h) => h.current?.animate([{ transform: "translateX(0)" }, { transform: "translateX(-100%)" }], loopOpts) ?? null);
  const flow = el.flow.current?.animate([{ transform: "translateX(-50%)" }, { transform: "translateX(0)" }], { duration: FLOW_MS, iterations: Infinity }) ?? null;
  hubs.forEach((a) => a?.pause());
  flow?.pause();

  const pos = () => Math.min(clock.total, clock.pos + (clock.run ? performance.now() - clock.at : 0));

  const draw = (force: boolean) => {
    if (!ink) return;
    const r = reels(clock.total ? pos() / clock.total : 0);
    // half-pixel steps: the packs repaint only when they visibly change
    const rl = Math.round(r.left * 2) / 2;
    const rr = Math.round(r.right * 2) / 2;
    const key = `${rl}:${rr}`;
    if (!force && key === drawn) return;
    drawn = key;
    paint(el.a.current, "A", rl, rr, ink, clock.blank);
    // turned over, the reels swap sides
    paint(el.b.current, "B", rr, rl, ink, false);
    hubs[0]?.updatePlaybackRate(R_REF / r.left);
    hubs[1]?.updatePlaybackRate(R_REF / r.right);
  };

  const count = (force: boolean) => {
    const p = pos();
    const s = Math.floor(p / 1000);
    if (!force && s === shown) return;
    writeCounter(el.counter.current, s, roll && s === shown + 1);
    shown = s;
    const bar = el.bar.current;
    if (bar) {
      bar.setAttribute("aria-valuenow", String(s));
      bar.setAttribute("aria-valuetext", `${mmss(p)} / ${mmss(clock.total)}`);
    }
  };

  const loop = () => {
    count(false);
    draw(false);
    raf = requestAnimationFrame(loop);
  };

  const sync = () => {
    const live = clock.run && !document.hidden;
    if (live && !raf) raf = requestAnimationFrame(loop);
    if (!live && raf) {
      cancelAnimationFrame(raf);
      raf = 0;
    }
    const turning = live && spin;
    hubs.forEach((a) => (turning ? a?.play() : a?.pause()));
    if (turning) flow?.play();
    else flow?.pause();
  };
  document.addEventListener("visibilitychange", sync);

  return {
    setInk(next: Inks) {
      ink = next;
      draw(true);
    },
    setClock(next: Clock) {
      clock = { ...next, at: performance.now() };
      count(true);
      draw(true);
      sync();
    },
    /** hubs turn only on side A, playing, with motion allowed */
    setMotion(turning: boolean, rolling: boolean) {
      spin = turning;
      roll = rolling;
      sync();
    },
    stop() {
      cancelAnimationFrame(raf);
      raf = 0;
      hubs.forEach((a) => a?.cancel());
      flow?.cancel();
      document.removeEventListener("visibilitychange", sync);
    },
  };
}
type Engine = ReturnType<typeof createEngine>;

/* ───────── the component ───────── */

type Labels = {
  showB: string;
  showA: string;
  sides: string;
  sideA: string;
  sideB: string;
  repeat: string;
  progress: string;
};

const pct = (v: number, of: number) => `${(v / of) * 100}%`;
const hubBox = (x: number): React.CSSProperties => ({
  left: pct(x - HUB_R, AW),
  top: pct(HUB_Y - HUB_R, AH),
  width: pct(HUB_R * 2 + 1, AW),
  height: pct(HUB_R * 2 + 1, AH),
});
const sideOf = (t: number): "A" | "B" => (((Math.round(t) % 2) + 2) % 2 === 0 ? "A" : "B");

export function Cassette({
  track,
  playing,
  status,
  head,
  foot,
  labels,
}: {
  track: TrackInfo | null;
  playing: boolean;
  status: SpotifyStatus | null;
  /** the kicker, left of the counter */
  head: React.ReactNode;
  /** beside the A/B switch (Open in Spotify) */
  foot?: React.ReactNode;
  labels: Labels;
}) {
  const pal = useArtPalette();
  const ink = useMemo(() => inksFor(pal), [pal]);
  const reduced = useReduced();
  const { blip } = useSound();
  const [sprite, setSprite] = useState<string | null>(null);
  const [side, setSide] = useState<"A" | "B">("A");
  const artists = useMemo(() => (status?.artists ?? []).slice(0, 5), [status]);
  const canFlip = artists.length > 0;
  const total = track?.durationMs ?? 0;
  // last played (not playing, with a date): wound to the end
  const ended = Boolean(track && !playing && track.playedAt);

  const stage = useRef<HTMLDivElement>(null);
  const cvA = useRef<HTMLCanvasElement>(null);
  const cvB = useRef<HTMLCanvasElement>(null);
  const hubL = useRef<HTMLSpanElement>(null);
  const hubR = useRef<HTMLSpanElement>(null);
  const flowRef = useRef<HTMLSpanElement>(null);
  const counterRef = useRef<HTMLSpanElement>(null);
  const barRef = useRef<HTMLSpanElement>(null);
  const engine = useRef<Engine | null>(null);

  useEffect(() => {
    const e = createEngine({ a: cvA, b: cvB, hubs: [hubL, hubR], flow: flowRef, counter: counterRef, bar: barRef });
    engine.current = e;
    return () => {
      e.stop();
      engine.current = null;
    };
  }, []);

  // the hub sprite is painted in the browser, once per palette
  useEffect(() => {
    const id = requestAnimationFrame(() => setSprite(hubSprite(ink)));
    engine.current?.setInk(ink);
    return () => cancelAnimationFrame(id);
  }, [ink]);

  const title = track?.title;
  const progress = track?.progressMs ?? 0;
  useEffect(() => {
    engine.current?.setClock({ pos: ended ? total : progress, total, run: playing && total > 0, blank: title === undefined });
  }, [title, progress, total, playing, ended]);

  useEffect(() => {
    engine.current?.setMotion(playing && side === "A" && !reduced, !reduced);
  }, [playing, side, reduced]);

  /* the turn: 0 is side A, 1 side B, 2 side A again… */
  const turn = useMotionValue(0);
  const flight = useRef<AnimationPlaybackControls | null>(null);
  const g = useRef<{ pid: number; x0: number; y0: number; t0: number; axis: "x" | "y" | null; s: { t: number; x: number }[] } | null>(null);
  useMotionValueEvent(turn, "change", (t) => setSide(sideOf(t)));

  const body = useTransform(turn, (t) => {
    const lift = Math.abs(Math.sin(Math.PI * t)) * LIFT;
    return `translateZ(${lift.toFixed(3)}cqw) rotateY(${(t * 180).toFixed(3)}deg)`;
  });
  // faces darken as they turn from the light, edges brighten as they face it
  const faceShade = useTransform(turn, (t) => 0.75 * (1 - Math.abs(Math.cos(Math.PI * t))));
  const edgeShade = useTransform(turn, (t) => 0.8 * (1 - Math.abs(Math.sin(Math.PI * t))));
  // a band of light sweeps across the plastic during the half-turn
  const gloss = useTransform(turn, (t) => `${(103 - (t - Math.floor(t)) * 106).toFixed(2)}% 0`);
  const shadow = useTransform(turn, (t) => {
    const s = Math.abs(Math.sin(Math.PI * t));
    return `scaleX(${(Math.abs(Math.cos(Math.PI * t)) + THICK * s).toFixed(4)}) scaleY(${(1 + 0.6 * s).toFixed(3)})`;
  });
  const shadowOpacity = useTransform(turn, (t) => 1 - 0.55 * Math.abs(Math.sin(Math.PI * t)));

  const settle = (to: number, v = 0, thrown = false) => {
    flight.current?.stop();
    if (reduced) {
      turn.set(to);
      return;
    }
    const from = turn.get();
    flight.current = animate(turn, to, {
      ...(thrown ? spring.flick : springFrom(0.5)),
      velocity: v,
      onComplete: () => {
        if (Math.round(from) !== to) blip("tick");
      },
    });
  };
  const flip = () => {
    if (canFlip) settle(Math.round(turn.get()) + 1);
  };
  const show = (s: "A" | "B") => {
    if (canFlip && s !== sideOf(turn.get())) settle(Math.round(turn.get()) + 1);
  };

  const onPointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    if (e.button !== 0 || !canFlip) return;
    flight.current?.stop();
    g.current = { pid: e.pointerId, x0: e.clientX, y0: e.clientY, t0: turn.get(), axis: null, s: [] };
  };
  const onPointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    const d = g.current;
    if (!d || d.pid !== e.pointerId) return;
    const dx = e.clientX - d.x0;
    if (!d.axis) {
      if (Math.hypot(dx, e.clientY - d.y0) < 8) return;
      d.axis = Math.abs(dx) > Math.abs(e.clientY - d.y0) ? "x" : "y";
      if (d.axis === "x") e.currentTarget.setPointerCapture(e.pointerId);
    }
    if (d.axis !== "x") return;
    const w = stage.current?.offsetWidth || 340;
    // 1:1: dragging across the whole cassette is a half-turn, at most one
    turn.set(Math.max(d.t0 - 1.1, Math.min(d.t0 + 1.1, d.t0 + dx / w)));
    d.s.push({ t: e.timeStamp, x: e.clientX });
    while (d.s.length > 2 && e.timeStamp - d.s[0].t > 80) d.s.shift();
  };
  const onPointerUp = (e: React.PointerEvent<HTMLDivElement>) => {
    const d = g.current;
    if (!d || d.pid !== e.pointerId) return;
    g.current = null;
    if (d.axis === null) {
      if (e.type === "pointerup") flip();
      return;
    }
    if (d.axis !== "x") return;
    const w = stage.current?.offsetWidth || 340;
    let vx = 0;
    if (d.s.length > 1 && e.timeStamp - d.s[d.s.length - 1].t < 60) {
      const a = d.s[0];
      const b = d.s[d.s.length - 1];
      vx = ((b.x - a.x) / Math.max(8, b.t - a.t)) * 1000;
    }
    const t = turn.get();
    const end = t + project(vx) / w;
    const to = Math.max(Math.round(d.t0) - 1, Math.min(Math.round(d.t0) + 1, Math.round(end)));
    settle(to, vx / w, Math.abs(vx) > 700);
  };

  const hubStrip = (s: string | null): React.CSSProperties => ({ backgroundImage: s ? `url(${s})` : undefined });
  const seed = track ? `${track.title} · ${track.artist}` : "silence";

  return (
    <div className="os-tape-deck">
      <div className="os-tape-head">
        {head}
        {track && total > 0 && playing && (
          <span className="os-tape-time tabular" aria-hidden>
            <span ref={counterRef} className="os-tape-counter" />
            <span className="os-tape-total">{mmss(total)}</span>
          </span>
        )}
      </div>
      {track && total > 0 && (
        <span ref={barRef} className="sr-only" role="progressbar" aria-label={labels.progress} aria-valuemin={0} aria-valuemax={Math.round(total / 1000)} />
      )}

      <div
        ref={stage}
        className="os-tape"
        role="button"
        tabIndex={canFlip ? 0 : -1}
        aria-label={side === "A" ? labels.showB : labels.showA}
        aria-pressed={side === "B"}
        aria-disabled={!canFlip || undefined}
        data-flip={canFlip || undefined}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
        onKeyDown={(e) => {
          if (e.key === " " || e.key === "Enter") {
            e.preventDefault();
            flip();
          }
        }}
      >
        <m.span className="os-tape-shadow" style={{ transform: shadow, opacity: shadowOpacity }} aria-hidden />
        <m.div className="os-tape-body" style={{ transform: body }} aria-hidden>
          {/* side A: the track */}
          <div className="os-tape-face">
            <canvas ref={cvA} width={AW} height={AH} className="os-tape-canvas" />
            {HUB_X.map((x, i) => (
              <span key={x} className="os-tape-hub" style={hubBox(x)}>
                <span ref={i ? hubR : hubL} style={hubStrip(sprite)} />
              </span>
            ))}
            <span className="os-tape-flow" style={{ left: pct(HEAD.x0, AW), width: pct(HEAD.x1 - HEAD.x0, AW), top: pct(RUN_Y, AH), height: pct(1, AH) }}>
              <span ref={flowRef} />
            </span>
            <div key={seed} className="os-tape-label">
              {track ? (
                <>
                  <span className="os-tape-art">
                    {track.image ? (
                      // remote album art from Spotify's CDN, printed into the paper
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={track.image} alt="" draggable={false} decoding="async" />
                    ) : (
                      <PixelCover seed={seed} n={24} className="os-tape-art-px" />
                    )}
                  </span>
                  <span className="os-tape-print">
                    <span className="os-tape-title">{track.title}</span>
                    <span className="os-tape-artist">{track.artist}</span>
                    {track.album && track.album !== track.title && <span className="os-tape-album">{track.album}</span>}
                  </span>
                </>
              ) : null}
            </div>
            <m.span className="os-tape-shade" style={{ opacity: faceShade }} />
            <m.span className="os-tape-gloss" style={{ backgroundPosition: gloss }} />
          </div>

          {/* side B: on repeat lately */}
          <div className="os-tape-face os-tape-face--b">
            <canvas ref={cvB} width={AW} height={AH} className="os-tape-canvas" />
            {HUB_X.map((x) => (
              <span key={x} className="os-tape-hub" style={hubBox(x)}>
                <span style={hubStrip(sprite)} />
              </span>
            ))}
            <div className="os-tape-label">
              {artists[0] && (
                <span className="os-tape-art">
                  {artists[0].image ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={artists[0].image} alt="" draggable={false} decoding="async" />
                  ) : (
                    <PixelCover seed={`artist · ${artists[0].name}`} n={12} className="os-tape-art-px" />
                  )}
                </span>
              )}
              <span className="os-tape-print">
                <span className="os-tape-repeat">{labels.repeat}</span>
                <ol className="os-tape-list">
                  {artists.map((a, i) => (
                    <li key={a.name}>
                      <span className="os-tape-list-k">B{i + 1}</span>
                      <span className="os-tape-list-name">{a.name}</span>
                    </li>
                  ))}
                </ol>
              </span>
            </div>
            <m.span className="os-tape-shade" style={{ opacity: faceShade }} />
            <m.span className="os-tape-gloss" style={{ backgroundPosition: gloss }} />
          </div>

          <div className="os-tape-edge os-tape-edge--l">
            <m.span className="os-tape-shade" style={{ opacity: edgeShade }} />
          </div>
          <div className="os-tape-edge os-tape-edge--r">
            <m.span className="os-tape-shade" style={{ opacity: edgeShade }} />
          </div>
        </m.div>
      </div>

      <div className="os-tape-foot">
        {canFlip && (
          <div className="os-tape-sides" role="group" aria-label={labels.sides}>
            <button type="button" aria-pressed={side === "A"} aria-label={labels.sideA} onClick={() => show("A")}>
              A
            </button>
            <button type="button" aria-pressed={side === "B"} aria-label={labels.sideB} onClick={() => show("B")}>
              B
            </button>
          </div>
        )}
        {foot}
      </div>
    </div>
  );
}
