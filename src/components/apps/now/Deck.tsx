"use client";

import { useEffect, useRef, useState } from "react";
import { useReduced } from "@/hooks/env";
import { Art } from "./bits";
import { PixelCover, themeFor } from "./Cover";
import { fmtMs, useOnScreen, useTabHidden } from "./lib";

/**
 * The record deck: the song Elliot is really listening to, from above, in
 * pixels. Every part tells the truth: the grooves are split in one band
 * per minute of the real track, the needle sits at the radius of the real
 * position in it, the start/stop pad is lit only while Spotify says it is
 * playing, and the 54 strobe dots on the platter's rim stand still at
 * exactly 33⅓ rpm (one dot per 30 Hz step) and drift when it is off speed.
 * The real album art is the sleeve, leaning on the plinth.
 *
 * Grab the record and it stops under the hand, turns 1:1 with it and
 * keeps the spin you give it on release; the motor brings it back to
 * speed in about 0.7 s only if the music is actually playing, otherwise
 * it coasts down on friction. A tap opens the track.
 *
 * When the track changes, the arm lifts and parks, the record slides back
 * into the old sleeve, the new art takes its place, the new record slides
 * out and the arm drops on the lead-in. Last played: the record is back in
 * its sleeve, the arm on its rest, the pad dark.
 */

const W = 88;
const H = 64;
const CX = 34;
const CY = 32;
const R_PLATTER = 29;
const R_REC = 26;
const R_LEAD_IN = 25;
const R_RUN_OUT = 10;
const R_LABEL = 6;
const PIVOT = { x: 79, y: 9 };
const ARM = Math.hypot(PIVOT.x - CX, PIVOT.y - CY) - 2;
const REST = { x: PIVOT.x + 1, y: PIVOT.y + ARM * 0.92 };
const MOTOR = ((100 / 3) * 2 * Math.PI) / 60; // 33⅓ rpm in rad/s
const STEP = 1000 / 15;
const SPIN_MAX = 30;
const DOTS = 54;
/** the swap, in ms: arm up, record out, record in, arm down */
const LIFT = 260;
const OUT = 340;
const IN = 380;
const DROP = 300;
/** how far the record travels into the sleeve (clear of the plinth) */
const SLIDE = CX + R_REC + 2;

type RGB = [number, number, number];
const hex = (h: string): RGB => [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16)];
const INK = {
  plinth: hex("#161a17"),
  bevelHi: hex("#2b322d"),
  bevelLo: hex("#0d100e"),
  platter: hex("#1d221f"),
  dot: hex("#8f988f"),
  groove: [hex("#141816"), hex("#232925")],
  gap: hex("#0a0c0b"),
  sheen: hex("#4a544d"),
  spindle: hex("#c9cfc7"),
  arm: hex("#bcc2ba"),
  armLo: hex("#6b736c"),
  rest: hex("#2b322d"),
  padOn: hex("#b0cc86"),
  padOff: hex("#2b322d"),
  felt: hex("#2a2328"),
  feltLo: hex("#231d21"),
};

/** the label: the seeded 10×10 Vinyl label, its two inks */
const inksFor = (seed: string) => {
  const th = themeFor(seed);
  return { a: hex(th.a), b: hex(th.b) };
};
const LABEL = (() => {
  // 0 empty, 1 field, 2 accent, 3 hole
  const g: number[][] = Array.from({ length: 10 }, () => Array(10).fill(0));
  const fillRect = (x: number, y: number, w: number, h: number, v: number) => {
    for (let j = y; j < y + h; j++) for (let i = x; i < x + w; i++) g[j][i] = v;
  };
  fillRect(3, 0, 4, 10, 1);
  fillRect(0, 3, 10, 4, 1);
  fillRect(1, 1, 8, 8, 1);
  fillRect(2, 1, 3, 1, 2);
  fillRect(1, 2, 1, 2, 2);
  fillRect(4, 4, 2, 2, 3);
  return g;
})();

type Pt = { x: number; y: number };

/** where the needle is for a share of the song played (0 lead-in … 1 run-out) */
function needleAt(f: number): Pt {
  const r = R_LEAD_IN - (R_LEAD_IN - R_RUN_OUT) * Math.max(0, Math.min(1, f));
  // the point at radius r from the spindle that is ARM from the pivot
  const dx = PIVOT.x - CX;
  const dy = PIVOT.y - CY;
  const d = Math.hypot(dx, dy);
  const a = (r * r - ARM * ARM + d * d) / (2 * d);
  const h = Math.sqrt(Math.max(0, r * r - a * a));
  const mx = CX + (a * dx) / d;
  const my = CY + (a * dy) / d;
  return { x: mx - (h * dy) / d, y: my + (h * dx) / d };
}

const ease = (t: number) => (t <= 0 ? 0 : t >= 1 ? 1 : t * t * (3 - 2 * t));
const lerpPt = (a: Pt, b: Pt, t: number) => ({ x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t });

type Frame = {
  angle: number;
  /** the record on the platter: its label seed and minute bands, or none */
  record: { seed: string; minutes: number; slide: number } | null;
  tip: Pt;
  playing: boolean;
};

/* the plinth, platter and felt never change: paint them once */
let BASE: Uint8ClampedArray | null = null;
function baseLayer() {
  if (BASE) return BASE;
  const b = new Uint8ClampedArray(W * H * 4);
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      let c = x === 0 || y === 0 ? INK.bevelHi : x === W - 1 || y === H - 1 ? INK.bevelLo : INK.plinth;
      const r = Math.hypot(x + 0.5 - CX, y + 0.5 - CY);
      if (r <= R_PLATTER) c = INK.platter;
      if (r <= R_REC) c = Math.floor(r) % 3 === 0 ? INK.feltLo : INK.felt;
      const o = (y * W + x) * 4;
      b[o] = c[0];
      b[o + 1] = c[1];
      b[o + 2] = c[2];
      b[o + 3] = 255;
    }
  }
  return (BASE = b);
}
/* the record at rest (slide 0) for a given minute count: grooves + sheen don't turn, only the label does */
const REC = new Map<number, { img: Uint8ClampedArray; label: { o: number; dx: number; dy: number }[] }>();
function recordLayer(minutes: number) {
  let hit = REC.get(minutes);
  if (hit) return hit;
  const img = new Uint8ClampedArray(baseLayer());
  const label: { o: number; dx: number; dy: number }[] = [];
  const bandW = (R_LEAD_IN - R_RUN_OUT) / Math.max(1, minutes);
  for (let y = Math.floor(CY - R_REC - 1); y <= CY + R_REC + 1; y++) {
    for (let x = Math.floor(CX - R_REC - 1); x <= CX + R_REC + 1; x++) {
      if (x < 0 || x >= W || y < 0 || y >= H) continue;
      const dx = x + 0.5 - CX;
      const dy = y + 0.5 - CY;
      const r = Math.hypot(dx, dy);
      if (r > R_REC) continue;
      const o = (y * W + x) * 4;
      if (r <= R_LABEL) {
        label.push({ o, dx, dy });
        continue;
      }
      let c: RGB;
      if (r > R_RUN_OUT && r < R_LEAD_IN) {
        const k = (R_LEAD_IN - r) / bandW;
        const gap = k - Math.floor(k) > 1 - 1 / bandW;
        c = gap ? INK.gap : INK.groove[Math.floor(r) & 1];
      } else c = INK.groove[Math.floor(r) & 1];
      if (r > R_LABEL + 1 && Math.abs(Math.atan2(dy, dx) + 2.3) < 0.18 && Math.floor(r) & 1) c = INK.sheen;
      img[o] = c[0];
      img[o + 1] = c[1];
      img[o + 2] = c[2];
      img[o + 3] = 255;
    }
  }
  hit = { img, label };
  REC.set(minutes, hit);
  return hit;
}
const INKS = new Map<string, { a: RGB; b: RGB }>();
const inksCached = (seed: string) => {
  let v = INKS.get(seed);
  if (!v) INKS.set(seed, (v = inksFor(seed)));
  return v;
};

function draw(ctx: CanvasRenderingContext2D, img: ImageData, st: Frame) {
  const d = img.data;
  const fast = st.record && st.record.slide === 0;
  d.set(fast ? recordLayer(st.record!.minutes).img : baseLayer());
  const put = (x: number, y: number, c: RGB) => {
    x |= 0;
    y |= 0;
    if (x < 0 || y < 0 || x >= W || y >= H) return;
    const o = (y * W + x) * 4;
    d[o] = c[0];
    d[o + 1] = c[1];
    d[o + 2] = c[2];
    d[o + 3] = 255;
  };
  // the strobe dots on the platter's rim
  for (let k = 0; k < DOTS; k++) {
    const a = st.angle + (k * 2 * Math.PI) / DOTS;
    put(CX + Math.cos(a) * (R_PLATTER - 1) - 0.5, CY + Math.sin(a) * (R_PLATTER - 1) - 0.5, INK.dot);
  }
  put(CX - 0.5, CY - 0.5, INK.spindle);
  const rec = st.record;
  if (rec && fast) {
    const inks = inksCached(rec.seed);
    const cos = Math.cos(-st.angle);
    const sin = Math.sin(-st.angle);
    for (const p of recordLayer(rec.minutes).label) {
      const lx = Math.floor((p.dx * cos - p.dy * sin) / (R_LABEL / 5) + 5);
      const ly = Math.floor((p.dx * sin + p.dy * cos) / (R_LABEL / 5) + 5);
      const v = lx >= 0 && ly >= 0 && lx < 10 && ly < 10 ? LABEL[ly][lx] : 0;
      const c = v === 1 ? inks.a : v === 2 ? inks.b : v === 3 ? INK.gap : INK.groove[1];
      d[p.o] = c[0];
      d[p.o + 1] = c[1];
      d[p.o + 2] = c[2];
      d[p.o + 3] = 255;
    }
    put(CX - 0.5, CY - 0.5, INK.spindle);
  } else if (rec) {
    const cx = CX - rec.slide;
    const inks = inksFor(rec.seed);
    const cos = Math.cos(-st.angle);
    const sin = Math.sin(-st.angle);
    // the band edges, from the lead-in inward: one band per minute of the song
    const bandW = (R_LEAD_IN - R_RUN_OUT) / Math.max(1, rec.minutes);
    for (let y = Math.floor(CY - R_REC - 1); y <= CY + R_REC + 1; y++) {
      for (let x = Math.floor(cx - R_REC - 1); x <= cx + R_REC + 1; x++) {
        if (x < 0 || x >= W) continue;
        const dx = x + 0.5 - cx;
        const dy = y + 0.5 - CY;
        const r = Math.hypot(dx, dy);
        if (r > R_REC) continue;
        let c: RGB;
        if (r <= R_LABEL) {
          // the label turns on the pixel grid: sample it at the inverse angle
          const lx = Math.floor((dx * cos - dy * sin) / (R_LABEL / 5) + 5);
          const ly = Math.floor((dx * sin + dy * cos) / (R_LABEL / 5) + 5);
          const v = lx >= 0 && ly >= 0 && lx < 10 && ly < 10 ? LABEL[ly][lx] : 0;
          c = v === 1 ? inks.a : v === 2 ? inks.b : v === 3 ? INK.gap : INK.groove[1];
        } else if (r > R_RUN_OUT && r < R_LEAD_IN) {
          const k = (R_LEAD_IN - r) / bandW;
          const gap = k - Math.floor(k) > 1 - 1 / bandW;
          c = gap ? INK.gap : INK.groove[Math.floor(r) & 1];
        } else c = INK.groove[Math.floor(r) & 1];
        // a sheen that doesn't turn: the light is fixed
        if (r > R_LABEL + 1 && Math.abs(Math.atan2(dy, dx) + 2.3) < 0.18 && Math.floor(r) & 1) c = INK.sheen;
        put(x, y, c);
      }
    }
    if (rec.slide === 0) put(CX - 0.5, CY - 0.5, INK.spindle);
  }
  // the arm, from the pivot to the headshell
  const tip = st.tip;
  const steps = Math.ceil(Math.hypot(tip.x - PIVOT.x, tip.y - PIVOT.y) * 2);
  for (let i = 0; i <= steps; i++) {
    const t = i / steps;
    put(PIVOT.x + (tip.x - PIVOT.x) * t, PIVOT.y + (tip.y - PIVOT.y) * t, INK.arm);
  }
  // headshell, counterweight, rest, pivot
  for (let j = -1; j <= 1; j++) for (let i = -1; i <= 1; i++) put(tip.x + i, tip.y + j, Math.abs(i) + Math.abs(j) === 2 ? INK.armLo : INK.arm);
  for (let j = -2; j <= 2; j++) for (let i = -2; i <= 2; i++) if (i * i + j * j <= 5) put(PIVOT.x + 3 + i, PIVOT.y - 3 + j, INK.armLo);
  for (let j = 0; j < 3; j++) put(REST.x + 1, REST.y - 1 + j, INK.rest);
  put(PIVOT.x, PIVOT.y, INK.spindle);
  // the start/stop pad: lit only while it is really playing
  for (let j = 0; j < 4; j++) for (let i = 0; i < 7; i++) put(4 + i, H - 8 + j, st.playing ? INK.padOn : INK.padOff);
  ctx.putImageData(img, 0, 0);
}

type Side = { seed: string | null; present: boolean };
type Sleeve = { seed: string; image: string } | null;
type Swap = { t0: number; from: Side; to: Side; fromF: number; fromMinutes: number; sleeve: Sleeve; swapped: boolean };

export function Deck({
  track,
  playing,
  last,
  progress,
  duration,
  href,
  labels,
}: {
  /** the track's identity (the label's inks) and its album art, or nothing at all */
  track: { seed: string; image: string } | null;
  playing: boolean;
  /** last played (not on now): the record is back in its sleeve, the arm rests */
  last: boolean;
  progress: number | null;
  duration: number;
  href: string;
  labels: { open: string; needle: string };
}) {
  const wrap = useRef<HTMLAnchorElement>(null);
  const canvas = useRef<HTMLCanvasElement>(null);
  const on = useOnScreen(wrap, "40px");
  const hidden = useTabHidden();
  const reduced = useReduced();
  const [needle, setNeedle] = useState(false);
  const [sleeve, setSleeve] = useState<Sleeve>(track);
  const seed = track?.seed ?? null;
  const image = track?.image ?? "";
  const present = seed != null && !last;
  const minutes = Math.max(1, Math.ceil((duration || 60_000) / 60_000));
  const f = progress != null && duration > 0 ? progress / duration : null;
  const st = useRef({
    angle: 0,
    omega: 0,
    holding: false,
    grab: 0,
    samples: [] as { t: number; a: number }[],
    x0: 0,
    y0: 0,
    moved: false,
    shown: { seed, present } as Side,
    swap: null as Swap | null,
    f: f ?? 0,
    minutes,
  });
  const props = useRef({ track, seed, present, playing, f, minutes, reduced, on, hidden });
  useEffect(() => {
    props.current = { track, seed, present, playing, f, minutes, reduced, on, hidden };
  });
  const kick = useRef(() => {});

  // the 30 Hz loop: only while the record turns, is held or swaps, on screen and visible
  useEffect(() => {
    const ctx = canvas.current?.getContext("2d");
    if (!ctx) return;
    const img = ctx.createImageData(W, H);
    const s = st.current;
    let id = 0;
    const frame = (now: number): Frame => {
      const p = props.current;
      let record: Frame["record"] = p.present && p.seed ? { seed: p.seed, minutes: p.minutes, slide: 0 } : null;
      let tip = record && p.f != null ? needleAt(p.f) : REST;
      const sw = s.swap;
      if (sw) {
        const t = now - sw.t0;
        const out = sw.from.present ? LIFT + OUT : 0;
        if (t < out && sw.from.seed) {
          // arm up and park, then the old record slides back into its sleeve
          record = { seed: sw.from.seed, minutes: sw.fromMinutes, slide: t < LIFT ? 0 : SLIDE * ease((t - LIFT) / OUT) ** 1.4 };
          tip = t < LIFT ? lerpPt(needleAt(sw.fromF), REST, ease(t / LIFT)) : REST;
        } else if (sw.to.present && sw.to.seed && t < out + IN + DROP) {
          // the new record slides out, then the arm drops on the lead-in
          const u = t - out;
          record = { seed: sw.to.seed, minutes: p.minutes, slide: u < IN ? SLIDE * (1 - ease(u / IN)) : 0 };
          tip = u < IN ? REST : lerpPt(REST, needleAt(p.f ?? 0), ease((u - IN) / DROP));
        } else s.swap = null;
        // the new art takes the sleeve's place once the old record is in it
        if (t >= out && !sw.swapped) {
          sw.swapped = true;
          setSleeve(sw.sleeve);
        }
        if (record) record.slide = Math.round(record.slide);
      }
      if (!sw && p.f != null) {
        s.f = p.f;
        s.minutes = p.minutes;
      }
      return { angle: s.angle, record, tip, playing: p.playing };
    };
    const paint = () => draw(ctx, img, frame(performance.now()));
    const idle = () => {
      const p = props.current;
      return !s.holding && !s.swap && s.omega === 0 && !(p.playing && !p.reduced && p.present);
    };
    const stop = () => {
      window.clearInterval(id);
      id = 0;
    };
    const tick = () => {
      const p = props.current;
      const dt = STEP / 1000;
      if (!s.holding) {
        if (p.playing && p.present && !p.reduced) {
          // direct drive: critically damped back to 33⅓ in ~0.7 s
          s.omega += (MOTOR - s.omega) * (1 - Math.exp(-dt / 0.17));
        } else {
          s.omega *= Math.exp(-dt / (p.reduced ? 0.0001 : 1.1));
          if (Math.abs(s.omega) < 0.04) s.omega = 0;
        }
        s.angle += s.omega * dt;
      }
      paint();
      if (idle()) stop();
    };
    kick.current = () => {
      paint();
      if (on && !hidden && !id && !idle()) id = window.setInterval(tick, STEP);
    };
    kick.current();
    return () => {
      stop();
      kick.current = () => {};
    };
  }, [on, hidden]);

  // a new track, or the record going back in (or coming out of) its sleeve
  useEffect(() => {
    const s = st.current;
    const p = props.current;
    const prev = s.shown;
    if (prev.seed !== seed || prev.present !== present) {
      const next = { seed, present };
      if (!p.reduced && p.on && !p.hidden && (prev.present || present)) {
        s.swap = { t0: performance.now(), from: prev, to: next, fromF: s.f, fromMinutes: s.minutes, sleeve: p.track, swapped: false };
      } else {
        // reduced motion, or nobody watching: the sleeve cross-fades, no flight
        s.swap = null;
        const id = window.setTimeout(() => setSleeve(p.track), 0);
        s.shown = next;
        kick.current();
        return () => window.clearTimeout(id);
      }
      s.shown = next;
    } else if (!s.swap) {
      // same record, new art (the live answer after the server's seed)
      const id = window.setTimeout(() => setSleeve((v) => (v?.seed === p.track?.seed && v?.image === p.track?.image ? v : p.track)), 0);
      kick.current();
      return () => window.clearTimeout(id);
    }
    kick.current();
  }, [seed, present, playing, f, minutes, image]);

  const angleAt = (e: React.PointerEvent) => {
    const r = canvas.current!.getBoundingClientRect();
    return Math.atan2(e.clientY - (r.top + (CY / H) * r.height), e.clientX - (r.left + (CX / W) * r.width));
  };

  const onPointerDown = (e: React.PointerEvent<HTMLSpanElement>) => {
    const s = st.current;
    if (e.button !== 0 || !present || s.swap) return;
    e.preventDefault();
    e.currentTarget.setPointerCapture(e.pointerId);
    // a hand on the record stops it dead
    s.holding = true;
    s.omega = 0;
    s.grab = angleAt(e) - s.angle;
    s.samples = [{ t: e.timeStamp, a: s.angle }];
    s.x0 = e.clientX;
    s.y0 = e.clientY;
    s.moved = false;
    kick.current();
  };
  const onPointerMove = (e: React.PointerEvent<HTMLSpanElement>) => {
    const s = st.current;
    if (!s.holding) return;
    if (Math.hypot(e.clientX - s.x0, e.clientY - s.y0) > 6) s.moved = true;
    let a = angleAt(e) - s.grab;
    // unwrap so the angle keeps counting turns
    while (a - s.angle > Math.PI) a -= 2 * Math.PI;
    while (a - s.angle < -Math.PI) a += 2 * Math.PI;
    s.angle = a;
    s.samples.push({ t: e.timeStamp, a });
    while (s.samples.length > 2 && e.timeStamp - s.samples[0].t > 80) s.samples.shift();
  };
  const onPointerUp = (e: React.PointerEvent<HTMLSpanElement>) => {
    const s = st.current;
    if (!s.holding) return;
    s.holding = false;
    const a = s.samples[0];
    const b = s.samples[s.samples.length - 1];
    const fresh = e.timeStamp - b.t < 60;
    s.omega = props.current.reduced || !fresh ? 0 : Math.max(-SPIN_MAX, Math.min(SPIN_MAX, ((b.a - a.a) / Math.max(8, b.t - a.t)) * 1000));
    kick.current();
  };

  const tip = f != null && present ? needleAt(f) : null;

  return (
    <a
      ref={wrap}
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      className="app-now-deck"
      aria-label={labels.open}
      data-no-drag
      onClick={(e) => {
        // a spin is not a click; a tap opens the track
        if (st.current.moved) {
          e.preventDefault();
          st.current.moved = false;
        }
      }}
    >
      <span className="app-now-deck-sleeve" aria-hidden>
        {sleeve ? (
          <Art key={sleeve.seed} image={sleeve.image} seed={sleeve.seed} />
        ) : (
          <span className="app-now-art app-now-art--quiet">
            <PixelCover seed="silence" className="app-now-art-cover" />
          </span>
        )}
      </span>
      <span className="app-now-deck-body">
        <canvas ref={canvas} width={W} height={H} className="app-now-deck-canvas" aria-hidden />
        {/* the record itself: round, so only it is grabbed (and only it holds the page still on touch) */}
        {present && (
          <span
            className="app-now-deck-disc"
            aria-hidden
            onPointerDown={onPointerDown}
            onPointerMove={onPointerMove}
            onPointerUp={onPointerUp}
            onPointerCancel={onPointerUp}
          />
        )}
        {tip && progress != null && (
          <span
            className="app-now-deck-head"
            style={{ left: `${((tip.x + 0.5) / W) * 100}%`, top: `${((tip.y + 0.5) / H) * 100}%` }}
            onPointerEnter={(e) => e.pointerType === "mouse" && setNeedle(true)}
            onPointerLeave={(e) => e.pointerType === "mouse" && setNeedle(false)}
            onPointerDown={(e) => {
              if (e.pointerType !== "mouse") {
                e.stopPropagation();
                // a tap on the headshell reads it, it doesn't open the track
                st.current.moved = true;
                setNeedle((v) => !v);
              }
            }}
            aria-hidden
          >
            {needle && <span className="app-now-deck-readout tabular">{labels.needle.replace("{elapsed}", fmtMs(progress)).replace("{total}", fmtMs(duration))}</span>}
          </span>
        )}
      </span>
    </a>
  );
}
