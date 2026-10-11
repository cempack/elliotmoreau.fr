"use client";

import Link from "next/link";
import { useMemo, useRef, useState, useSyncExternalStore } from "react";
import { byFill, pxPath } from "@/lib/pxpath";
import { useI18n } from "@/i18n/client";
import { GLYPH_PIN, PixelGlyph } from "@/components/glyphs";
import { Glass } from "@/components/os/Glass";
import { useSky } from "@/components/os/sky";
import { sunScrub } from "@/components/os/wallpaper/sunClock";
import { grabSun, holdSun, releaseSun } from "@/components/os/wallpaper/hold";
import { atLocalHour, localHour, moonPhase, phaseOf, sunAt, sunDay, TOULOUSE, type SkyPhase } from "@/lib/sun";
import { FLING, pushSample, releaseVelocity, type Sample } from "./physics";
import { PARIS, fmtOffset, hhmm, offsetMinutes, useMinute, useVisitorZone } from "./time";

const fill = (s: string, v: Record<string, string | number>) => s.replace(/\{(\w+)\}/g, (_, k: string) => String(v[k] ?? ""));

/* ───────────────────────────── the dial ─────────────────────────────
   A vertical sundial facing south, laid out for Toulouse (43.6° N) with
   the real formula: an hour line sits at tan θ = cos φ · tan H from the
   noon line, H the sun's hour angle. Morning on the left (the sun in the
   east throws the shadow west), VI to VI. The gnomon's shadow falls at
   true solar time; a lime tick on the rim marks the clock, so the gap
   between the two (an hour and three quarters in summer) is right there.
   Pale lime plaster in a thin metal edge, 60 × 34 cells. */

const CW = 60;
const CH = 34;
const FX = 30;
const FY = 8;
const R = Math.PI / 180;
const COS_PHI = Math.cos(TOULOUSE.lat * R);

/** shadow angle from the noon line (radians, + toward the afternoon side) */
const thetaFor = (hourAngle: number) => Math.atan(COS_PHI * Math.tan(hourAngle * R));
/** …and back: the hour angle (degrees) a shadow angle means */
const hourAngleFor = (theta: number) => Math.atan(Math.tan(theta) / COS_PHI) / R;

/** distance from the foot to the inner border along θ */
function rayLen(theta: number) {
  const dx = Math.sin(theta);
  const dy = Math.cos(theta);
  let t = Infinity;
  if (dx > 1e-6) t = Math.min(t, (CW - 2.5 - FX) / dx);
  if (dx < -1e-6) t = Math.min(t, (1.5 - FX) / dx);
  if (dy > 1e-6) t = Math.min(t, (CH - 2.5 - FY) / dy);
  return t;
}
const at = (theta: number, t: number) => ({ x: FX + Math.sin(theta) * t, y: FY + Math.cos(theta) * t });

const INK = {
  plaster: "#d9dcc5",
  speck: "#c8cbb1",
  edge: "#2a2f2b",
  line: "#7d8270",
  numeral: "#4c5142",
  shadow: "#3c4036",
  metal: "#262a27",
  metalHi: "#5a615a",
  paper: "#ebe9e1",
  lime: "#9fbf6e",
  moon: "#f1efe4",
  moonDark: "#9da28e",
};

/* 3×5 capitals and numerals for the dial's furniture */
const FONT: Record<string, string[]> = {
  I: ["#", "#", "#", "#", "#"],
  V: ["#.#", "#.#", "#.#", "#.#", ".#."],
  X: ["#.#", "#.#", ".#.", "#.#", "#.#"],
  T: ["###", ".#.", ".#.", ".#.", ".#."],
  O: ["###", "#.#", "#.#", "#.#", "###"],
  L: ["#..", "#..", "#..", "#..", "###"],
  S: ["###", "#..", "###", "..#", "###"],
  A: [".#.", "#.#", "###", "#.#", "#.#"],
};
const textWidth = (s: string) => [...s].reduce((w, ch) => w + FONT[ch][0].length + 1, -1);
function textCells(s: string, x0: number, y0: number) {
  const out: [number, number][] = [];
  let x = x0;
  for (const ch of s) {
    const g = FONT[ch];
    g.forEach((row, y) => {
      for (let i = 0; i < row.length; i++) if (row[i] === "#") out.push([x + i, y0 + y]);
    });
    x += g[0].length + 1;
  }
  return out;
}

type Cell = [number, number, string];

/** The still parts: plaster, edge, hour lines, numerals, the motto, the gnomon. */
const STATIC: Cell[] = (() => {
  const grid = new Map<number, string>();
  const set = (x: number, y: number, c: string) => {
    if (x < 0 || y < 0 || x >= CW || y >= CH) return;
    grid.set(y * CW + x, c);
  };
  for (let y = 0; y < CH; y++) {
    for (let x = 0; x < CW; x++) {
      const edge = x === 0 || y === 0 || x === CW - 1 || y === CH - 1;
      const h = ((Math.imul(x, 374761393) + Math.imul(y, 668265263)) >>> 0) / 4294967296;
      set(x, y, edge ? INK.edge : h < 0.07 ? INK.speck : INK.plaster);
    }
  }
  // hour lines VI–VI, half-hour ticks at the rim
  for (let k = 0; k <= 24; k++) {
    const H = (k / 2 - 6) * 15;
    const th = thetaFor(Math.max(-89.9, Math.min(89.9, H)));
    const len = rayLen(th);
    const from = k % 2 === 0 ? 5 : len - 2;
    for (let t = from; t <= len; t += 0.35) {
      const p = at(th, t);
      set(Math.round(p.x - 0.5), Math.round(p.y - 0.5), INK.line);
    }
  }
  // numerals on their lines, a cell of plaster around each
  const numerals: [string, number][] = [
    ["VI", -90],
    ["IX", -45],
    ["XII", 0],
    ["III", 45],
    ["VI", 90],
  ];
  for (const [s, H] of numerals) {
    const th = thetaFor(Math.max(-89.9, Math.min(89.9, H)));
    const p = at(th, rayLen(th) - (Math.abs(H) === 90 ? 4.5 : 4));
    const w = textWidth(s);
    const x0 = Math.round(p.x - w / 2);
    const y0 = Math.round(p.y - 2.5);
    for (let y = y0 - 1; y <= y0 + 5; y++) for (let x = x0 - 1; x <= x0 + w; x++) set(x, y, INK.plaster);
    for (const [x, y] of textCells(s, x0, y0)) set(x, y, INK.numeral);
  }
  // the motto: the city's Latin name, over the dial
  const motto = "TOLOSA";
  for (const [x, y] of textCells(motto, Math.round(FX - textWidth(motto) / 2), 1)) set(x, y + 1, INK.line);
  // the gnomon: a mounting plate and the style seen end-on, down the noon line
  for (let x = FX - 2; x <= FX + 1; x++) set(x, FY - 1, INK.metal);
  for (let y = FY; y < FY + 9; y++) {
    set(FX - 1, y, INK.metal);
    set(FX, y, INK.metalHi);
  }
  const out: Cell[] = [];
  grid.forEach((c, i) => out.push([i % CW, Math.floor(i / CW), c]));
  return out;
})();
const STATIC_PATHS: [string, string][] = [...byFill(STATIC, (q) => q[2])].map(([c, qs]) => [c, pxPath(qs.map(([x, y]) => ({ x, y })), 0.02)]);

/** the shadow wedge along θ: a solid core, dithered flanks widening to the rim */
function shadowCells(theta: number): Cell[] {
  const len = rayLen(theta);
  const out = new Map<number, string>();
  for (let t = 2; t <= len; t += 0.3) {
    const p = at(theta, t);
    const half = 0.5 + t * 0.045;
    const nx = Math.cos(theta);
    const ny = -Math.sin(theta);
    for (let s = -half; s <= half; s += 0.4) {
      const x = Math.round(p.x + nx * s - 0.5);
      const y = Math.round(p.y + ny * s - 0.5);
      if (x < 1 || y < 1 || x >= CW - 1 || y >= CH - 1) continue;
      const core = Math.abs(s) < 0.6;
      if (core || ((x + y) & 1) === 0) out.set(y * CW + x, INK.shadow);
    }
  }
  return [...out].map(([i, c]) => [i % CW, Math.floor(i / CW), c]);
}

/** a short tick against the rim along θ */
function rimTick(theta: number, c: string, n = 3): Cell[] {
  const len = rayLen(theta);
  const out: Cell[] = [];
  for (let t = len - n + 0.5; t <= len + 0.2; t += 0.5) {
    const p = at(theta, t);
    out.push([Math.round(p.x - 0.5), Math.round(p.y - 0.5), c]);
  }
  return out;
}

/** a 5×5 moon in its real phase (waxing lit on the right) */
function moonCells(phase: number, x0: number, y0: number): Cell[] {
  const out: Cell[] = [];
  const k = Math.cos(2 * Math.PI * Math.min(0.88, Math.max(0.12, phase)));
  const waxing = phase < 0.5;
  for (let y = 0; y < 5; y++) {
    for (let x = 0; x < 5; x++) {
      const nx = (x + 0.5 - 2.5) / 2.5;
      const ny = (y + 0.5 - 2.5) / 2.5;
      if (nx * nx + ny * ny > 1.05) continue;
      const half = Math.sqrt(Math.max(0, 1 - ny * ny));
      const lit = waxing ? nx > k * half : nx < -k * half;
      out.push([x0 + x, y0 + y, lit ? INK.moon : INK.moonDark]);
    }
  }
  return out;
}

const PHASE_INK: Record<SkyPhase, string> = { night: "#a9bacb", dawn: "#ecc999", day: "#b0cc86", dusk: "#eba584" };

type Events = { sunrise: number; noon: number; sunset: number; dusk: number };

function eventsFor(now: Date): Events {
  const d = sunDay(now);
  const ms = (h: number | null, fb: number) => atLocalHour(h ?? fb, now).getTime();
  return { sunrise: ms(d.sunrise, 6), noon: ms(d.noon, 13), sunset: ms(d.sunset, 20), dusk: ms(d.dusk, 21) };
}

/* ───────────────────────────── the widget ───────────────────────────── */

export function ClockWidget() {
  const { t, lang, path } = useI18n();
  const w = t.home.widgets.clock;
  const now = useMinute();
  const zone = useVisitorZone();
  const { mode } = useSky();
  const scrub = useSyncExternalStore(sunScrub.subscribe, sunScrub.get, () => null);
  const [held, setHeld] = useState(false);
  const panel = useRef<HTMLDivElement>(null);
  const drag = useRef<{ pid: number; offset: number; samples: Sample[]; ms: Sample[] } | null>(null);

  const nowMs = now?.getTime() ?? null;
  const shown = scrub ?? nowMs;
  const ev = useMemo(() => (nowMs == null ? null : eventsFor(new Date(nowMs))), [nowMs]);

  const sun = shown == null ? null : sunAt(shown);
  const phase = sun ? phaseOf(sun) : null;
  const lit = !!sun && sun.elevation > 0 && Math.abs(sun.hourAngle) < 90;
  const theta = sun && lit ? thetaFor(sun.hourAngle) : null;

  const cells = useMemo(() => {
    const out: Cell[] = [];
    if (shown == null || !ev) return out;
    const d = new Date(shown);
    // the clock's own hour, as if it were sun time: the lime tick
    const clockH = (localHour(d) - 12) * 15;
    if (Math.abs(clockH) < 90) out.push(...rimTick(thetaFor(clockH), INK.lime, 3));
    if (held) {
      // today's real path along the rim: sunrise to sunset, a notch at now
      for (let m = ev.sunrise; m <= ev.sunset; m += 30 * 60_000) {
        const s = sunAt(m);
        if (Math.abs(s.hourAngle) >= 90) continue;
        const p = at(thetaFor(s.hourAngle), rayLen(thetaFor(s.hourAngle)) - 3.6);
        out.push([Math.round(p.x - 0.5), Math.round(p.y - 0.5), INK.line]);
      }
      if (nowMs != null) {
        const s = sunAt(nowMs);
        if (s.elevation > 0 && Math.abs(s.hourAngle) < 90) out.push(...rimTick(thetaFor(s.hourAngle), INK.paper, 2));
      }
    }
    if (theta != null) {
      out.push(...shadowCells(theta));
      if (held) {
        const tip = at(theta, rayLen(theta) - 1);
        const tx = Math.round(tip.x - 0.5);
        const ty = Math.round(tip.y - 0.5);
        for (let y = ty - 2; y <= ty + 2; y++)
          for (let x = tx - 2; x <= tx + 2; x++)
            if ((Math.abs(x - tx) === 2 || Math.abs(y - ty) === 2) && x > 0 && y > 0 && x < CW - 1 && y < CH - 1) out.push([x, y, INK.paper]);
      }
    } else {
      // no sun on the dial: the real moon over it instead
      out.push(...moonCells(moonPhase(d), CW - 9, 2));
    }
    // the gnomon's tip brightens while it is held
    out.push([FX, FY + 8, held ? INK.paper : INK.metalHi]);
    return out;
  }, [shown, ev, held, theta, nowMs]);

  /* ── the readout ── */
  const time = shown == null ? "--:--" : hhmm(new Date(shown), lang);
  let nextText = "";
  if (shown != null && ev) {
    const fmt = (ms: number) => hhmm(new Date(ms), lang);
    if (shown < ev.sunrise) nextText = fill(w.events.sunrise, { time: fmt(ev.sunrise) });
    else if (shown < ev.sunset) nextText = fill(w.events.sunset, { time: fmt(ev.sunset) });
    else if (shown < ev.dusk) nextText = fill(w.events.night, { time: fmt(ev.dusk) });
    else {
      const tomorrow = sunDay(new Date(shown + 86_400_000));
      nextText = fill(w.events.sunrise, { time: fmt(atLocalHour(tomorrow.sunrise ?? 8, new Date(shown + 86_400_000)).getTime()) });
    }
  }
  const offset = now ? offsetMinutes(now, zone) - offsetMinutes(now, PARIS) : 0;
  const you = now && offset !== 0 && scrub == null ? fill(w.you, { time: hhmm(now, lang, zone) }) : "";
  const pinned = mode !== "auto" && scrub == null ? mode : null;
  const phaseName = phase ? w.phase[phase] : " ";
  const valueText = shown == null ? "" : fill(w.valueText, { time, phase: phase ? w.phase[phase].toLocaleLowerCase(lang) : "" });
  const minutesOf = (ms: number) => Math.round(localHour(new Date(ms)) * 60);
  const label = now
    ? `${fill(w.aria, { time: hhmm(now, lang), phase: phaseName, next: nextText })}${
        offset !== 0 ? ` ${fill(w.ariaYou, { time: hhmm(now, lang, zone), offset: fmtOffset(offset) })}` : ""
      }`
    : w.title;

  /* ── holding the shadow ── */
  const angleAt = (e: React.PointerEvent) => {
    const r = panel.current!.getBoundingClientRect();
    const cx = r.left + ((FX + 0.0) / CW) * r.width;
    const cy = r.top + ((FY - 0.5) / CH) * r.height;
    const a = Math.atan2(e.clientX - cx, e.clientY - cy);
    return a;
  };
  const clampTheta = (a: number) => Math.max(-89.4 * R, Math.min(89.4 * R, a));
  const msForTheta = (th: number) => {
    const d = sunDay(new Date());
    return atLocalHour(d.noon + hourAngleFor(th) / 15).getTime();
  };

  const onPointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    if (e.button !== 0 || !ev) return;
    e.preventDefault();
    e.currentTarget.setPointerCapture(e.pointerId);
    const ms0 = grabSun();
    const s0 = sunAt(ms0);
    const a = clampTheta(angleAt(e));
    // grab the shadow where it is (by day); at night the sun comes to the hand
    const offset = ms0 >= ev.sunrise && ms0 <= ev.sunset && Math.abs(s0.hourAngle) < 90 ? thetaFor(s0.hourAngle) - a : 0;
    drag.current = { pid: e.pointerId, offset, samples: [], ms: [] };
    setHeld(true);
    const ms = holdSun(msForTheta(clampTheta(a + offset)), ev.sunrise, ev.sunset);
    pushSample(drag.current.ms, { t: e.timeStamp, x: ms / 60_000, y: 0 });
    pushSample(drag.current.samples, { t: e.timeStamp, x: e.clientX, y: e.clientY });
  };
  const onPointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    const g = drag.current;
    if (!g || g.pid !== e.pointerId || !ev) return;
    const ms = holdSun(msForTheta(clampTheta(angleAt(e) + g.offset)), ev.sunrise, ev.sunset);
    pushSample(g.ms, { t: e.timeStamp, x: ms / 60_000, y: 0 });
    pushSample(g.samples, { t: e.timeStamp, x: e.clientX, y: e.clientY });
  };
  const onPointerUp = (e: React.PointerEvent<HTMLDivElement>) => {
    const g = drag.current;
    if (!g || g.pid !== e.pointerId) return;
    drag.current = null;
    setHeld(false);
    const v = releaseVelocity(g.ms, e.timeStamp).vx;
    const p = releaseVelocity(g.samples, e.timeStamp);
    releaseSun(v, Math.hypot(p.vx, p.vy) > FLING);
  };

  const onKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
    if (!ev) return;
    const cur = grabSun();
    const stops = [ev.sunrise, ev.noon, ev.sunset, ev.dusk];
    let to: number | null = null;
    if (e.key === "ArrowLeft" || e.key === "ArrowDown") to = cur - 15 * 60_000;
    else if (e.key === "ArrowRight" || e.key === "ArrowUp") to = cur + 15 * 60_000;
    else if (e.key === "PageUp") to = stops.find((s) => s > cur + 60_000) ?? ev.dusk;
    else if (e.key === "PageDown") to = [...stops].reverse().find((s) => s < cur - 60_000) ?? ev.sunrise;
    else if (e.key === "Home" || e.key === "Escape") {
      if (scrub == null) return;
      e.preventDefault();
      releaseSun();
      return;
    }
    if (to == null) return;
    e.preventDefault();
    sunScrub.set(Math.min(ev.dusk, Math.max(ev.sunrise, to)));
  };

  return (
    <div className="app-home-widget app-home-widget--s app-home-widget--clock">
      <Glass thickness="regular" refract={false} aria-hidden className="app-home-widget-glass" />
      <Link prefetch={false}
        href={path("/now")}
        transitionTypes={["app-open"]}
        className="app-home-widget-hit"
        aria-label={`${label} ${fill(w.open, { app: t.shell.apps.now })}`}
      />
      <div
        ref={panel}
        role="slider"
        tabIndex={0}
        aria-label={w.slider}
        aria-describedby="app-home-sundial-hint"
        aria-valuemin={ev ? minutesOf(ev.sunrise) : 0}
        aria-valuemax={ev ? minutesOf(ev.dusk) : 1440}
        aria-valuenow={shown == null ? 0 : minutesOf(shown)}
        aria-valuetext={valueText}
        data-no-drag
        data-held={held ? "" : undefined}
        className="app-home-sundial"
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
        onKeyDown={onKeyDown}
        onBlur={() => {
          if (sunScrub.get() != null && !drag.current) releaseSun();
        }}
      >
        <svg viewBox={`0 0 ${CW} ${CH}`} shapeRendering="crispEdges" aria-hidden focusable="false">
          {STATIC_PATHS.map(([c, d]) => (
            <path key={c} d={d} fill={c} />
          ))}
          {[...byFill(cells, (q) => q[2])].map(([c, qs]) => (
            <path key={c} d={pxPath(qs.map(([x, y]) => ({ x, y })), 0.02)} fill={c} />
          ))}
        </svg>
      </div>
      <span id="app-home-sundial-hint" className="sr-only">
        {w.hint}
      </span>
      <p className="app-home-clock-time tabular" data-scrub={scrub != null ? "" : undefined} aria-hidden suppressHydrationWarning>
        {time}
      </p>
      <p className="app-home-clock-line" aria-hidden>
        <span className="app-home-clock-phase-name" style={{ color: phase ? PHASE_INK[phase] : undefined }}>
          {phaseName}
        </span>
        <span className="app-home-clock-next">{nextText}</span>
      </p>
      {(pinned || you) && (
        <p className="app-home-clock-extra" aria-hidden>
          {pinned ? (
            <>
              <PixelGlyph cells={GLYPH_PIN} size={9} className="app-home-clock-pin" />
              {fill(w.pinnedLine, { phase: w.phase[pinned] })}
            </>
          ) : (
            you
          )}
        </p>
      )}
    </div>
  );
}
