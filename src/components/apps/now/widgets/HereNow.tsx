"use client";

import { useEffect, useRef } from "react";
import { useI18n } from "@/i18n/client";
import { useSky, type SkyPhase } from "@/components/os/sky";
import { RollText } from "../bits";
import { fill, seeded, tzOffset, useNow } from "../lib";

const PARIS = "Europe/Paris";

/* ───────────────────────── the pixel sky ───────────────────────── */

const W = 64;
const H = 34;
const HORIZON = 25;

const SKIES: Record<SkyPhase, string[]> = {
  night: ["#04050c", "#0b0f2a", "#1d1a45"],
  dawn: ["#0a0a22", "#2c1c4e", "#8a4a6b", "#f29a6b"],
  day: ["#071b36", "#0f3e6b", "#2f7fa8", "#9ed8e6"],
  dusk: ["#08061a", "#2a1048", "#7a2a5e", "#ff8a5b"],
};
const FAR: Record<SkyPhase, string> = { night: "#141737", dawn: "#3a2347", day: "#1d4a6a", dusk: "#36163f" };
const NEAR = "#0a0b12";

const BAYER = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5];

const hex = (c: string) => [parseInt(c.slice(1, 3), 16), parseInt(c.slice(3, 5), 16), parseInt(c.slice(5, 7), 16)] as const;

/** where the sun or moon sits on its arc (0 rising → 1 setting) */
export function arcFor(phase: SkyPhase, hour: number | null, live: boolean) {
  if (live && hour != null) {
    if (phase === "night") {
      const h = hour < 12 ? hour + 24 : hour; // 21:00 → 29:30
      return Math.min(1, Math.max(0, (h - 21) / 8.5));
    }
    return Math.min(1, Math.max(0, (hour - 5.5) / 15.5)); // 5:30 → 21:00
  }
  return { dawn: 0.1, day: 0.5, dusk: 0.9, night: 0.5 }[phase];
}

function paintSky(ctx: CanvasRenderingContext2D, phase: SkyPhase, arc: number) {
  const img = ctx.createImageData(W, H);
  const d = img.data;
  const set = (x: number, y: number, c: readonly number[]) => {
    if (x < 0 || y < 0 || x >= W || y >= H) return;
    const i = (y * W + x) * 4;
    d[i] = c[0];
    d[i + 1] = c[1];
    d[i + 2] = c[2];
    d[i + 3] = 255;
  };
  // dithered gradient, top to horizon: two neighbouring stops per pixel,
  // chosen by a 4×4 Bayer threshold (hard pixels, no blending)
  const stops = SKIES[phase].map(hex);
  for (let y = 0; y < H; y++) {
    const v = Math.min(1, y / HORIZON) * (stops.length - 1);
    const lo = Math.floor(v);
    const hi = Math.min(stops.length - 1, lo + 1);
    const f = v - lo;
    for (let x = 0; x < W; x++) {
      const th = (BAYER[(y % 4) * 4 + (x % 4)] + 0.5) / 16;
      set(x, y, f > th ? stops[hi] : stops[lo]);
    }
  }
  const rnd = seeded(phase === "night" ? 77 : 31);
  // stars (night, and the last of them at dawn and dusk)
  if (phase !== "day") {
    const n = phase === "night" ? 26 : 9;
    for (let i = 0; i < n; i++) {
      const x = Math.floor(rnd() * W);
      const y = Math.floor(rnd() * (HORIZON - 9));
      const bright = rnd() > 0.7;
      set(x, y, bright ? hex("#f5f2ec") : hex("#9196a6"));
      if (bright && phase === "night" && rnd() > 0.5) {
        set(x + 1, y, hex("#3a3f55"));
        set(x - 1, y, hex("#3a3f55"));
      }
    }
  }
  // the sun or the moon on its arc
  const cx = Math.round(7 + arc * (W - 14));
  const cy = Math.round(HORIZON - 2 - Math.sin(arc * Math.PI) * (HORIZON - 9));
  if (phase === "night") {
    const r = 3.6;
    for (let y = -5; y <= 5; y++)
      for (let x = -5; x <= 5; x++) {
        const inDisc = x * x + y * y <= r * r;
        const inBite = (x - 2) * (x - 2) + (y + 1) * (y + 1) <= r * r;
        if (inDisc && !inBite) set(cx + x, cy + y, hex(x + y < -1 ? "#f5f2ec" : "#c3c5cf"));
      }
  } else {
    const r = phase === "day" ? 3.4 : 4.2;
    const body = hex(phase === "day" ? "#ffe2b8" : "#ffb86b");
    const rim = hex(phase === "day" ? "#ffb86b" : "#e8893d");
    const halo = hex(phase === "day" ? "#bfe8f0" : "#ffb86b");
    for (let y = -8; y <= 8; y++)
      for (let x = -8; x <= 8; x++) {
        const dd = x * x + y * y;
        if (dd <= (r - 1.1) * (r - 1.1)) set(cx + x, cy + y, body);
        else if (dd <= r * r) set(cx + x, cy + y, rim);
        else if (dd <= (r + 2.6) * (r + 2.6) && (x + y) % 2 === 0 && phase !== "day") set(cx + x, cy + y, halo);
        else if (dd <= (r + 2.2) * (r + 2.2) && (x + y) % 2 === 0 && phase === "day") set(cx + x, cy + y, halo);
      }
  }
  // far hills, then the near ridge with the city on it
  const far = hex(FAR[phase]);
  const near = hex(NEAR);
  for (let x = 0; x < W; x++) {
    const fh = Math.round(HORIZON - 3 + Math.sin(x * 0.19 + 1.3) * 2.2 + Math.sin(x * 0.47) * 0.9);
    for (let y = fh; y < H; y++) set(x, y, far);
    const nh = Math.round(HORIZON + 1 + Math.sin(x * 0.11 + 0.4) * 1.6 + Math.sin(x * 0.37 + 2) * 0.7);
    for (let y = nh; y < H; y++) set(x, y, near);
  }
  // a very small Eiffel Tower, because this is Paris
  const tower = [
    "...#...",
    "...#...",
    "...#...",
    "..###..",
    "...#...",
    "..###..",
    "..#.#..",
    ".#####.",
    ".#...#.",
    ".#...#.",
    "#######",
    "#.....#",
    "#.....#",
  ];
  const tx = 44;
  const ty = HORIZON + 2 - tower.length;
  tower.forEach((row, y) => [...row].forEach((ch, x) => ch === "#" && set(tx + x, ty + y, near)));
  if (phase === "night" || phase === "dusk") set(tx + 3, ty, hex("#ff5f7e"));
  // windows lit after dark
  if (phase !== "day") {
    const lit = hex("#ffb86b");
    const n = phase === "night" ? 16 : 8;
    for (let i = 0; i < n; i++) {
      const x = Math.floor(rnd() * W);
      if (Math.abs(x - tx - 3) < 5) continue;
      const y = HORIZON + 3 + Math.floor(rnd() * (H - HORIZON - 4));
      set(x, y, lit);
    }
  }
  ctx.putImageData(img, 0, 0);
}

function SkyCanvas({ phase, arc }: { phase: SkyPhase; arc: number }) {
  const ref = useRef<HTMLCanvasElement>(null);
  const step = Math.round(arc * 40); // repaint when the body moves a pixel or so
  useEffect(() => {
    const ctx = ref.current?.getContext("2d");
    if (ctx) paintSky(ctx, phase, step / 40);
  }, [phase, step]);
  return <canvas ref={ref} width={W} height={H} className="app-now-sky-canvas" aria-hidden />;
}

/* ───────────────────────── widget ───────────────────────── */

const hm = (d: Date, timeZone?: string) =>
  new Intl.DateTimeFormat("en-GB", { timeZone, hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).format(d);

function fmtDiff(min: number) {
  const a = Math.abs(min);
  const h = Math.floor(a / 60);
  const m = a % 60;
  return m ? `${h} h ${String(m).padStart(2, "0")}` : `${h} h`;
}

/** UTC+2, for the header. Null before mount. */
export function HereMeta() {
  const now = useNow(60_000);
  if (!now) return null;
  const off = tzOffset(PARIS, now);
  const h = off / 60;
  return <span className="app-now-status app-now-status--mono">UTC{h >= 0 ? "+" : "−"}{Math.abs(h)}</span>;
}

/**
 * Paris, live: a pixel sky in the current phase (or the pinned one) with
 * the sun or moon where it really is on its arc, the clock with ticking
 * seconds, the date, and your time next to mine.
 */
export function HereNow() {
  const { t, lang } = useI18n();
  const h = t.now.here;
  const { phase, mode, hour } = useSky();
  const now = useNow(1000);
  const arc = arcFor(phase, hour, mode === "auto");

  const paris = now ? hm(now, PARIS) : "--:--";
  const secs = now
    ? new Intl.DateTimeFormat("en-GB", { timeZone: PARIS, second: "2-digit" }).format(now).padStart(2, "0")
    : "--";
  const date = now
    ? new Intl.DateTimeFormat(lang === "fr" ? "fr-FR" : "en-GB", {
        timeZone: PARIS,
        weekday: "long",
        day: "numeric",
        month: "long",
      }).format(now)
    : " ";
  let you: React.ReactNode = " ";
  if (now) {
    const local = -now.getTimezoneOffset();
    const diff = tzOffset(PARIS, now) - local;
    you =
      diff === 0 ? (
        h.same
      ) : (
        <>
          {fill(h.forYou, { here: paris, you: hm(now) })}{" "}
          <span className="app-now-here-diff">{fill(diff > 0 ? h.ahead : h.behind, { n: fmtDiff(diff) })}</span>
        </>
      );
  }
  const phaseName = h.phases[phase];

  return (
    <div className="app-now-here">
      <div className="app-now-sky" data-phase={phase}>
        <SkyCanvas phase={phase} arc={arc} />
        <span className="app-now-sky-label">{fill(mode === "auto" ? h.sky : h.pinned, { phase: phaseName })}</span>
      </div>
      <p className="app-now-clock" aria-label={`${h.clockLabel} ${paris}`}>
        <RollText text={paris} className="app-now-clock-hm" />
        <span className="app-now-clock-s tabular" aria-hidden>
          {secs}
        </span>
      </p>
      <p className="app-now-date">{date}</p>
      <p className="app-now-you">{you}</p>
    </div>
  );
}
