"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { animate, type AnimationPlaybackControls } from "motion/react";
import { useI18n } from "@/i18n/client";
import { useReduced } from "@/hooks/env";
import { spring } from "@/lib/motion";
import { moonAt, sunAt, sunDay } from "@/lib/sun";
import { skyLight } from "@/components/os/wallpaper/light";
import type { DayData } from "@/lib/data";
import { fill, useNow } from "./lib";

/**
 * Today over Toulouse, as a sky you can rewind. The panel is the day from
 * midnight to midnight, left to right; the sun stands where it was at the
 * moment under your finger, on its real path, in the wallpaper's light for
 * that minute (the moon and stars take over at night), above a row of
 * Toulouse roofs, Saint-Sernin, the Grave's dome and the Pont Neuf. Drag
 * it back and the line underneath says what was playing and what got
 * pushed then; let go and it springs back to now. The strip below holds
 * the day's listening sessions and pushes on the same clock.
 *
 * Painted into a small raster of 3 px cells, only when the moment changes.
 * Keyboard: it's a slider (arrows, Page Up/Down, Home/End, Escape for now).
 */

const CELL = 3;
const TZ = "Europe/Paris";
/** a play counts as "playing then" for this long after Spotify's timestamp */
const PLAY_MS = 5 * 60_000;
/** a push is "what I was pushing" for the hour before it lands */
const PUSH_MS = 60 * 60_000;

type RGB = readonly [number, number, number];
const BAYER = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5];
const hex = (h: string): RGB => [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16)];
const mixc = (a: RGB, b: RGB, t: number): RGB => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
const pack = (c: RGB) => ((255 << 24) | (Math.round(c[2]) << 16) | (Math.round(c[1]) << 8) | Math.round(c[0])) >>> 0;

const BRICK = hex("#b46a54");
const BRICK_DK = hex("#7a4638");
const STONE = hex("#cdb89e");
const COPPER = hex("#5f9a84");
const WARM = hex("#ffcf86");
const STAR = hex("#ebe9e1");
const MOON = hex("#e8e2cc");

/** Toulouse midnight (as ms) for the Toulouse day containing `at` */
function midnight(at: number) {
  const d = new Date(at);
  const p = new Intl.DateTimeFormat("en-CA", { timeZone: TZ, year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).formatToParts(d);
  const v = (k: string) => Number(p.find((x) => x.type === k)?.value ?? 0);
  return at - ((v("hour") * 60 + v("minute")) * 60 + d.getUTCSeconds()) * 1000 - d.getUTCMilliseconds();
}
const hm = (ms: number) => new Intl.DateTimeFormat("en-GB", { timeZone: TZ, hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).format(ms);

function hashN(n: number) {
  let h = (n * 1664525 + 1013904223) >>> 0;
  h ^= h >>> 15;
  h = Math.imul(h, 2246822519) >>> 0;
  return ((h ^ (h >>> 13)) >>> 0) / 4294967296;
}

/** the skyline, in cells: a height per column, the belfry and the dome, the bridge */
function skyline(W: number, HZ: number) {
  const tops = new Int16Array(W);
  let x = 0;
  while (x < W) {
    const w = 4 + Math.floor(hashN(x * 7 + 1) * 7);
    const h = 3 + Math.floor(hashN(x * 13 + 5) * 6);
    for (let i = 0; i < w && x + i < W; i++) tops[x + i] = HZ - h;
    x += w;
  }
  return { tops, belfry: Math.round(W * 0.33), dome: Math.round(W * 0.74) };
}

function paint(cv: HTMLCanvasElement, W: number, H: number, ms: number, day0: number) {
  const g = cv.getContext("2d");
  if (!g) return;
  if (cv.width !== W || cv.height !== H) {
    cv.width = W;
    cv.height = H;
  }
  const img = g.createImageData(W, H);
  const px = new Uint32Array(img.data.buffer);
  const HZ = Math.round(H * 0.66);
  const L = skyLight(ms);
  const sun = L.sun;
  const sd = sunDay(new Date(ms));
  const peak = Math.max(20, sd.peak);
  const xOf = (t: number) => ((t - day0) / 86_400_000) * (W - 1);
  const yOf = (e: number) => HZ - 2 - (e / peak) * (HZ - 8);
  const th = (x: number, y: number) => (BAYER[((y & 3) << 2) | (x & 3)] + 0.5) / 16;
  const set = (x: number, y: number, c: RGB) => {
    if (x >= 0 && y >= 0 && x < W && y < H) px[y * W + x] = pack(c);
  };

  // the sky: the wallpaper's five stops for this minute, dithered to the horizon
  const stops = L.sky as RGB[];
  for (let y = 0; y < HZ; y++) {
    const f = (y / Math.max(1, HZ - 1)) * (stops.length - 1);
    const k = Math.min(stops.length - 2, Math.floor(f));
    for (let x = 0; x < W; x++) set(x, y, th(x, y) < f - k ? stops[k + 1] : stops[k]);
  }
  // stars, as night comes
  if (L.stars > 0.05)
    for (let i = 0; i < W * 0.35; i++) {
      const x = Math.floor(hashN(i * 3 + 11) * W);
      const y = Math.floor(hashN(i * 7 + 3) * (HZ - 6));
      if (hashN(i * 5 + 1) < L.stars) set(x, y, hashN(i) < 0.2 ? STAR : mixc(stops[0], STAR, 0.5));
    }
  // the sun's path today, dotted, and the body: the sun by day, the moon by night
  if (sd.sunrise != null && sd.sunset != null) {
    for (let m = 0; m < 1440; m += 6) {
      const t = day0 + m * 60_000;
      const e = sunAt(t).elevation;
      if (e < -1) continue;
      const x = Math.round(xOf(t));
      const y = Math.round(yOf(e));
      if ((m / 6) % 2 === 0) set(x, y, mixc(stops[2], STAR, 0.55));
    }
  }
  const bx = Math.round(xOf(ms));
  if (sun.elevation > -1.5) {
    const by = Math.round(yOf(Math.max(-1, sun.elevation)));
    const glow = L.glow as RGB;
    const R = 4;
    for (let y = -R - 6; y <= R + 6; y++)
      for (let x = -R - 6; x <= R + 6; x++) {
        const d = Math.hypot(x, y);
        if (d > R && d < R + 6 && th(bx + x, by + y) < L.glowAmt * 0.45 * (1 - (d - R) / 6) && by + y < HZ) set(bx + x, by + y, glow);
      }
    // low, the sun reddens; high, it's pale gold
    const low = Math.max(0, Math.min(1, 1 - sun.elevation / 14));
    const core = mixc(hex("#f8d890"), hex("#f2a35e"), low);
    const hi = mixc(hex("#fff2cf"), hex("#f8c27a"), low);
    for (let y = -R; y <= R; y++)
      for (let x = -R; x <= R; x++) if (x * x + y * y <= R * R + 1 && by + y < HZ) set(bx + x, by + y, x + y < -2 ? hi : core);
  } else {
    const moon = moonAt(ms);
    if (moon.elevation > 0) {
      const my = Math.round(yOf(Math.min(peak, moon.elevation)));
      const R = 3;
      for (let y = -R; y <= R; y++)
        for (let x = -R; x <= R; x++) {
          if (x * x + y * y > R * R + 1) continue;
          // the dark side is where the phase hasn't reached yet
          const lit = moon.phase < 0.5 ? x / R > 1 - moon.lit * 2 : -x / R > 1 - moon.lit * 2;
          set(bx + x, my + y, lit ? MOON : mixc(stops[0], MOON, 0.18));
        }
    }
  }

  // Toulouse: brick roofs in this minute's light, windows warming up at night
  const light = 0.35 + 0.65 * L.sunUp;
  const warm = L.twilight;
  const brick = mixc(mixc(BRICK_DK, BRICK, light), hex("#d0805a"), warm * 0.35);
  const brickDk = mixc(BRICK_DK, brick, 0.35);
  const { tops, belfry, dome } = skyline(W, HZ);
  for (let x = 0; x < W; x++) {
    for (let y = tops[x]; y < HZ + 2; y++) {
      let c = y === tops[x] || (x > 0 && tops[x - 1] !== tops[x] && y < HZ) ? brickDk : brick;
      if (L.stars > 0.35 && y > tops[x] + 1 && y < HZ && (y - tops[x]) % 3 === 2 && x % 3 === 1 && hashN(x * 31 + y) < 0.28) c = WARM;
      set(x, y, c);
    }
  }
  // Saint-Sernin: octagonal tiers narrowing to a spire
  let top = HZ - 4;
  for (const [w, h] of [[11, 5], [9, 4], [7, 4], [5, 4], [3, 3]]) {
    for (let y = top - h; y < top; y++) for (let x = -Math.floor(w / 2); x <= Math.floor(w / 2); x++) set(belfry + x, y, x === -Math.floor(w / 2) ? brickDk : mixc(brick, STONE, 0.12));
    top -= h;
  }
  for (let y = 0; y < 6; y++) set(belfry, top - y, brickDk);
  // the Grave's dome
  for (let y = -6; y <= 0; y++)
    for (let x = -7; x <= 7; x++) if (x * x / 49 + y * y / 36 <= 1) set(dome + x, HZ - 9 + y, mixc(mixc(hex("#2f5a4c"), COPPER, light), STAR, x < -3 ? 0.12 : 0));
  for (let x = -8; x <= 8; x++) for (let y = HZ - 9; y < HZ; y++) set(dome + x, y, y === HZ - 9 ? STONE : brick);
  for (let y = 1; y < 4; y++) set(dome, HZ - 16 - y, STONE);
  // quay, the Pont Neuf's arches over the river, the river taking the sky
  const water = mixc(stops[stops.length - 1], stops[1], 0.45);
  for (let x = 0; x < W; x++) {
    set(x, HZ + 2, mixc(STONE, brickDk, 1 - light));
    const k = x % 26;
    const arch = k > 4 && k < 22 ? Math.round(Math.sqrt(Math.max(0, 81 - (k - 13) ** 2)) * 0.6) : 0;
    for (let y = HZ + 3; y < HZ + 9; y++) set(x, y, y >= HZ + 9 - arch ? mixc(water, BRICK_DK, 0.5) : y === HZ + 3 ? mixc(brick, STONE, 0.3) : brick);
    for (let y = HZ + 9; y < H; y++) set(x, y, th(x, y) < 0.25 ? mixc(water, stops[0], 0.3) : water);
  }
  // the sun or moon in the river
  if (sun.elevation > -1.5) for (let k = 0; k < 4; k++) for (let i = -2 + (k >> 1); i <= 2 - (k >> 1); i++) set(bx + i, HZ + 10 + k * 2, mixc(water, hex("#fff2cf"), 0.6));
  g.putImageData(img, 0, 0);
}

export function TodaySky({ day }: { day: DayData }) {
  const { t, lang } = useI18n();
  const d = t.now.day;
  const reduced = useReduced();
  const now = useNow(30_000);
  const skyRef = useRef<HTMLDivElement>(null);
  const cvRef = useRef<HTMLCanvasElement>(null);
  const [size, setSize] = useState({ w: 0, h: 0 });
  /** the moment shown: null is now */
  const [at, setAt] = useState<number | null>(null);
  const [touched, setTouched] = useState(false);
  const back = useRef<AnimationPlaybackControls | null>(null);

  useEffect(() => {
    const el = skyRef.current;
    if (!el) return;
    const ro = new ResizeObserver(([e]) => setSize({ w: Math.floor(e.contentRect.width), h: Math.floor(e.contentRect.height) }));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const nowMs = now?.getTime() ?? 0;
  const day0 = nowMs ? midnight(nowMs) : 0;
  const shown = at ?? nowMs;

  // today's plays (oldest first) and pushes, kept to today in Toulouse
  const plays = useMemo(() => day.tracks.map((p) => ({ ...p, t: Date.parse(p.at) })).filter((p) => p.t >= day0 && p.t <= nowMs).sort((a, b) => a.t - b.t), [day.tracks, day0, nowMs]);
  const pushes = useMemo(() => day.pushes.map((p) => ({ ...p, t: Date.parse(p.at) })).filter((p) => p.t >= day0 && p.t <= nowMs).sort((a, b) => a.t - b.t), [day.pushes, day0, nowMs]);
  /** listening sessions: plays less than ten minutes apart run together */
  const sessions = useMemo(() => {
    const out: { a: number; b: number }[] = [];
    for (const p of plays) {
      const last = out[out.length - 1];
      if (last && p.t - last.b < 10 * 60_000) last.b = p.t + PLAY_MS * 0.6;
      else out.push({ a: p.t - PLAY_MS * 0.6, b: p.t + PLAY_MS * 0.6 });
    }
    return out;
  }, [plays]);

  // paint the sky for the moment shown
  useEffect(() => {
    const cv = cvRef.current;
    if (!cv || !size.w || !size.h || !shown) return;
    paint(cv, Math.ceil(size.w / CELL), Math.ceil(size.h / CELL), shown, day0);
  }, [size, shown, day0]);

  useEffect(() => () => back.current?.stop(), []);

  // what was happening then
  const track = [...plays].reverse().find((p) => p.t <= shown + 60_000 && shown - p.t < PLAY_MS);
  const push = pushes.find((p) => p.t >= shown && p.t - shown < PUSH_MS) ?? [...pushes].reverse().find((p) => p.t <= shown && shown - p.t < 15 * 60_000);
  const time = shown ? hm(shown) : "--:--";
  const count = (n: number, one: string, many: string) => fill(n === 1 ? one : many, { n });
  let line: string;
  if (at == null) {
    line = plays.length || pushes.length ? fill(d.summary, { songs: count(plays.length, d.songOne, d.songs), pushes: count(pushes.length, d.pushOne, d.pushes) }) : d.empty;
  } else if (track && push) line = fill(d.both, { time, track: track.title, artist: track.artist, msg: push.msg || push.repo, repo: push.repo });
  else if (track) line = fill(d.track, { time, track: track.title, artist: track.artist });
  else if (push) line = fill(d.push, { time, msg: push.msg || push.repo, repo: push.repo });
  else line = fill(d.none, { time });

  // ── the scrub ──
  const timeAt = (clientX: number) => {
    const el = skyRef.current;
    if (!el || !nowMs) return nowMs;
    const r = el.getBoundingClientRect();
    const f = Math.min(1, Math.max(0, (clientX - r.left) / r.width));
    return Math.min(nowMs, day0 + f * 86_400_000);
  };
  const goNow = (from: number | null) => {
    back.current?.stop();
    if (from == null || reduced) return setAt(null);
    back.current = animate(from, nowMs, { ...spring.gentle, onUpdate: (v) => setAt(v), onComplete: () => setAt(null) });
  };
  const onDown = (e: React.PointerEvent) => {
    if (!nowMs) return;
    back.current?.stop();
    e.currentTarget.setPointerCapture(e.pointerId);
    setTouched(true);
    setAt(timeAt(e.clientX));
  };
  const onMove = (e: React.PointerEvent) => {
    if (!e.currentTarget.hasPointerCapture(e.pointerId)) return;
    setAt(timeAt(e.clientX));
  };
  const onUp = (e: React.PointerEvent) => {
    if (e.currentTarget.hasPointerCapture(e.pointerId)) e.currentTarget.releasePointerCapture(e.pointerId);
    goNow(at);
  };
  const onKey = (e: React.KeyboardEvent) => {
    if (!nowMs) return;
    const step = e.key === "ArrowLeft" || e.key === "ArrowDown" ? -10 : e.key === "ArrowRight" || e.key === "ArrowUp" ? 10 : e.key === "PageDown" ? -60 : e.key === "PageUp" ? 60 : 0;
    if (step) {
      e.preventDefault();
      setTouched(true);
      setAt(Math.min(nowMs, Math.max(day0, (at ?? nowMs) + step * 60_000)));
    } else if (e.key === "Home") {
      e.preventDefault();
      setAt(day0);
    } else if (e.key === "End" || e.key === "Escape") {
      if (at == null) return;
      e.preventDefault();
      goNow(at);
    }
  };

  const pct = (ms: number) => `${Math.min(100, Math.max(0, ((ms - day0) / 86_400_000) * 100))}%`;
  const sd = nowMs ? sunDay(new Date(nowMs)) : null;
  const rise = sd?.sunrise != null ? day0 + sd.sunrise * 3_600_000 : 0;
  const set = sd?.sunset != null ? day0 + sd.sunset * 3_600_000 : 0;

  return (
    <section className="app-now-day" aria-label={d.label}>
      <div
        ref={skyRef}
        className="app-now-day-sky"
        role="slider"
        tabIndex={0}
        aria-label={d.slider}
        aria-valuemin={0}
        aria-valuemax={1439}
        aria-valuenow={shown && day0 ? Math.round((shown - day0) / 60_000) : 0}
        aria-valuetext={`${time}. ${line}`}
        onPointerDown={onDown}
        onPointerMove={onMove}
        onPointerUp={onUp}
        onPointerCancel={onUp}
        onKeyDown={onKey}
        onBlur={() => at != null && goNow(at)}
      >
        <canvas ref={cvRef} className="app-now-day-canvas" aria-hidden />
        <span className="app-now-day-k" aria-hidden>
          {d.label}
        </span>
        {nowMs > 0 && (
          <span className="app-now-day-time tabular" style={{ left: `clamp(3rem, ${pct(shown)}, calc(100% - 3rem))` }} aria-hidden data-past={at != null || undefined}>
            {at == null ? fill(d.nowAt, { time }) : time}
          </span>
        )}
        {!touched && nowMs > 0 && (
          <span className="app-now-day-hint" aria-hidden>
            {d.hint}
          </span>
        )}
      </div>
      <p className="app-now-day-line" aria-hidden>
        {track && at != null && track.image ? (
          // a 64 px Spotify sleeve, shown at 28: nothing for the image optimizer to do
          // eslint-disable-next-line @next/next/no-img-element
          <img src={track.image} alt="" width={28} height={28} className="app-now-day-sleeve" />
        ) : null}
        <span>{line}</span>
      </p>
      <div className="app-now-day-strip" aria-hidden>
        <div className="app-now-day-track">
          {rise > 0 && set > 0 && <span className="app-now-day-light" style={{ left: pct(rise), width: `calc(${pct(set)} - ${pct(rise)})` }} />}
          {sessions.map((s, i) => (
            <span key={i} className="app-now-day-session" style={{ left: pct(s.a), width: `max(3px, calc(${pct(s.b)} - ${pct(s.a)}))` }} />
          ))}
          {pushes.map((p, i) => (
            <span key={i} className="app-now-day-push" style={{ left: pct(p.t) }} />
          ))}
          {nowMs > 0 && <span className="app-now-day-future" style={{ left: pct(nowMs) }} />}
          {nowMs > 0 && <span className="app-now-day-head" style={{ left: pct(shown) }} />}
        </div>
        <div className="app-now-day-ticks">
          {[0, 6, 12, 18, 24].map((h) => (
            <span key={h} style={{ left: `${(h / 24) * 100}%` }}>
              {String(h % 24).padStart(2, "0")}
              {lang === "fr" ? " h" : ":00"}
            </span>
          ))}
        </div>
      </div>
    </section>
  );
}
