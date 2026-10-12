"use client";

import { useEffect, useImperativeHandle, useRef, useState } from "react";
import { useArtPalette } from "@/hooks/useTheme";
import { useSky } from "@/components/os/sky";
import { useWeather } from "@/components/os/weather";
import { pinnedMs } from "@/components/os/wallpaper/sunClock";
import { useSound } from "@/lib/sound";
import type { SkyPhase } from "@/lib/sun";
import type { Levee, Tab } from "./levee";
import {
  CELL,
  compose,
  geoOf,
  letterInSlot,
  lightOf,
  lookKey,
  paintStatic,
  placeBox,
  tonesFor,
  type Bead,
  type Layer,
  type Look,
} from "./postbox";

export type PostBoxHandle = {
  /** the posted letter drops into the slot; resolves once it's in */
  drop: () => Promise<void>;
};

/** the tab's steps out of the window and back in, per layout (50 ms each) */
const TAB_OUT = { L: [0, -4, -9, -15], S: [0, -2, -5, -9] };
const TAB_IN = { L: [-15, -8, -3, 0], S: [-9, -5, -2, 0] };
const STEP = 50;
const FADE_STEP = 60;
const SEEN = "em-mail-levee";

type Anim = {
  /** the tab in the window now (null: the recess is empty) */
  shown: Tab | null;
  /** the first view has been handled */
  started: boolean;
  /** a tab change on its way: the old one rises out (if any), the new one drops in */
  tab: { from: Tab | null; to: Tab; t0: number | null } | null;
  drop: { t0: number | null; landed: boolean; done: () => void } | null;
  fade: { from: number; to: number; t0: number | null } | null;
  vis: number;
  beads: Bead[];
  /** rain's clock: the timestamp of tick 0, the next bead's tick, the generator */
  t0: number | null;
  nextBead: number;
  seed: number;
};

/**
 * Elliot's letterbox on the glass, in Toulouse's light and weather. Only
 * what's real moves: the light (repainted when it changes, about once a
 * minute), the tab (when the next collection changes, and once per session
 * as the window first fills), beads of rain while it rains there, and the
 * posted letter. One stepped loop at 20 fps, running only while something
 * moves, and never off screen, in a hidden tab or a closed mailbox.
 */
export function PostBox({
  ref,
  view,
  now,
  ready,
  shown,
  reduced,
  label,
}: {
  ref?: React.Ref<PostBoxHandle>;
  view: Levee | null;
  now: Date | null;
  /** the letter could be sent: the flap is tipped open */
  ready: boolean;
  /** false while the globe has the stage */
  shown: boolean;
  reduced: boolean;
  label: string;
}) {
  const sky = useSky();
  const { kind } = useWeather();
  const P = useArtPalette();
  const { blip } = useSound();
  const wrapRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [grid, setGrid] = useState<{ N: number; M: number } | null>(null);

  useEffect(() => {
    const el = wrapRef.current;
    if (!el) return;
    const ro = new ResizeObserver(([e]) => {
      const N = Math.floor(e.contentRect.width / CELL);
      const M = Math.floor(e.contentRect.height / CELL);
      setGrid((g) => (g && g.N === N && g.M === M ? g : N > 0 && M > 0 ? { N, M } : null));
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const flap: "shut" | "ajar" = ready ? "ajar" : "shut";
  const live = useRef({ view, now, flap, shown, reduced, grid, P, phase: sky.phase, mode: sky.mode, skyKnown: sky.live != null, kind, blip });
  const anim = useRef<Anim>({ shown: null, started: false, tab: null, drop: null, fade: null, vis: shown ? 4 : 0, beads: [], t0: null, nextBead: 0, seed: 0x2545f491 });
  const layer = useRef<Layer | null>(null);
  const frame = useRef<{ out: Uint32Array; img: ImageData; off: HTMLCanvasElement } | null>(null);
  const visible = useRef(true);
  const raf = useRef(0);
  const last = useRef(0);
  const kick = useRef<() => void>(() => {});

  useEffect(() => {
    live.current = { view, now, flap, shown, reduced, grid, P, phase: sky.phase, mode: sky.mode, skyKnown: sky.live != null, kind, blip };
  });

  useEffect(() => {
    const a = anim.current;
    /** before the sky has been read, the pre-paint script's phase (no flash of night) */
    const phaseNow = (): SkyPhase => {
      const l = live.current;
      if (l.skyKnown || l.mode !== "auto") return l.phase;
      const pre = document.documentElement.dataset.sky as SkyPhase | undefined;
      return pre === "dawn" || pre === "day" || pre === "dusk" || pre === "night" ? pre : l.phase;
    };

    /** the tones for a phase and weather (and theme), kept between frames */
    let tones: { key: string; P: unknown; t: ReturnType<typeof tonesFor> } | null = null;
    const tonesNow = (P: typeof live.current.P, phase: SkyPhase, kind: typeof live.current.kind) => {
      const key = `${phase}|${kind}`;
      if (tones?.key !== key || tones.P !== P) tones = { key, P, t: tonesFor(P, phase, kind) };
      return tones.t;
    };

    /** paint one frame; true while something still moves */
    const paint = (ts: number): boolean => {
      const l = live.current;
      const a = anim.current;
      const cv = canvasRef.current;
      if (!cv || !l.grid || !l.view) return false;
      const { N, M } = l.grid;
      const place = placeBox(N, M);
      const geo = geoOf(place.layout);
      const phase = phaseNow();
      const t = l.now?.getTime() ?? Date.now();
      const lightMs = l.mode === "auto" ? t : pinnedMs(phase, new Date(t));
      const look: Look = {
        N,
        M,
        tones: tonesNow(l.P, phase, l.kind),
        light: lightOf(lightMs, phase, l.kind, place.layout === "S"),
        kind: l.kind,
        flap: l.flap,
        plate: l.view.plate,
        slip: l.view.slip,
      };
      const key = lookKey(look);
      if (layer.current?.key !== key) layer.current = paintStatic(look);
      const lay = layer.current;

      let f = frame.current;
      if (!f || f.img.width !== N || f.img.height !== M) {
        const img = new ImageData(N, M);
        const off = f?.off ?? document.createElement("canvas");
        off.width = N;
        off.height = M;
        f = frame.current = { out: new Uint32Array(img.data.buffer), img, off };
      }

      let moving = false;

      // the dissolve between the box and the globe
      if (a.fade) {
        a.fade.t0 ??= ts;
        const k = Math.floor((ts - a.fade.t0) / FADE_STEP);
        const dir = Math.sign(a.fade.to - a.fade.from);
        a.vis = Math.max(0, Math.min(4, a.fade.from + dir * k));
        if (a.vis === a.fade.to) a.fade = null;
        else moving = true;
      }

      // the tab
      let tab = a.shown;
      let dy = 0;
      if (a.tab) {
        a.tab.t0 ??= ts;
        const k = Math.floor((ts - a.tab.t0) / STEP);
        const out = a.tab.from ? TAB_OUT[place.layout] : [];
        const seq = [...out.map((d) => [d, 0] as const), ...TAB_IN[place.layout].map((d) => [d, 1] as const)];
        if (k >= seq.length) {
          a.shown = a.tab.to;
          a.tab = null;
          tab = a.shown;
        } else {
          tab = seq[k][1] ? a.tab.to : a.tab.from;
          dy = seq[k][0];
          moving = true;
        }
      }

      // rain on the sides, only while it rains in Toulouse
      const raining = l.kind === "rain" && a.vis > 0;
      let tick = 0;
      if (raining && !l.reduced) {
        a.t0 ??= ts;
        tick = Math.floor((ts - a.t0) / STEP);
        a.beads = a.beads.filter((b) => {
          const age = tick - b.born;
          return age < (geo.beadEnd - geo.beadBorn + 1) * 4 + 3;
        });
        if (tick >= a.nextBead) {
          a.seed = (Math.imul(a.seed, 1664525) + 1013904223) >>> 0;
          const free = geo.beads.filter((x) => !a.beads.some((b) => b.x === x));
          if (a.beads.length < geo.beadMax && free.length) a.beads.push({ x: free[a.seed % free.length], born: tick });
          a.seed = (Math.imul(a.seed, 1664525) + 1013904223) >>> 0;
          a.nextBead = tick + 36 + (a.seed % 37);
        }
        moving = true;
      } else if (!raining) {
        a.beads = [];
        a.t0 = null;
        a.nextBead = 0;
      }

      // the posted letter
      let letter: number | null = null;
      let flapNow: "shut" | "ajar" | null = null;
      let jolt = false;
      if (a.drop) {
        a.drop.t0 ??= ts;
        const k = Math.floor((ts - a.drop.t0) / STEP);
        if (k <= 9) {
          letter = k;
          flapNow = letterInSlot(geo, k) ? "ajar" : "shut";
        } else {
          // in: the flap shuts, the box sits a row lower for two frames, a tick
          flapNow = "shut";
          if (!a.drop.landed) {
            a.drop.landed = true;
            l.blip("tick");
          }
          if (k <= 11) jolt = true;
          else {
            const done = a.drop.done;
            a.drop = null;
            done();
          }
        }
        if (a.drop) moving = true;
      }

      compose(f.out, lay, { tab, tabDy: dy, beads: a.beads, tick, stillBeads: raining && l.reduced, letter, flap: flapNow, jolt, vis: a.vis });
      const g = f.off.getContext("2d");
      const gx = cv.getContext("2d");
      if (!g || !gx) return false;
      g.putImageData(f.img, 0, 0);
      gx.imageSmoothingEnabled = false;
      gx.clearRect(0, 0, cv.width, cv.height);
      gx.drawImage(f.off, 0, 0, cv.width, cv.height);
      return moving;
    };

    const step = (ts: number) => {
      raf.current = 0;
      if (!visible.current || document.hidden) return;
      if (last.current && ts - last.current < STEP - 4) {
        raf.current = requestAnimationFrame(step);
        return;
      }
      last.current = ts;
      if (paint(ts)) raf.current = requestAnimationFrame(step);
      else last.current = 0;
    };
    kick.current = () => {
      if (raf.current || !visible.current || document.hidden) return;
      raf.current = requestAnimationFrame(step);
    };

    const cv = canvasRef.current;
    const io = cv
      ? new IntersectionObserver(([e]) => {
          visible.current = e.isIntersecting;
          if (e.isIntersecting) kick.current();
        })
      : null;
    if (cv) io?.observe(cv);
    const onVis = () => kick.current();
    document.addEventListener("visibilitychange", onVis);
    return () => {
      io?.disconnect();
      document.removeEventListener("visibilitychange", onVis);
      cancelAnimationFrame(raf.current);
      raf.current = 0;
      const d = a.drop;
      a.drop = null;
      d?.done();
    };
  }, []);

  // the backing store: whole cells, at the screen's density
  useEffect(() => {
    const cv = canvasRef.current;
    if (!cv || !grid) return;
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    const w = Math.round(grid.N * CELL * dpr);
    const h = Math.round(grid.M * CELL * dpr);
    if (cv.width !== w || cv.height !== h) {
      cv.width = w;
      cv.height = h;
    }
    kick.current();
  }, [grid]);

  // what changed since the last frame: the tab, the stage, anything the paint reads
  const tabKey = view?.tab.key ?? null;
  useEffect(() => {
    const a = anim.current;
    const v = live.current.view;
    if (v) {
      if (!a.started) {
        a.started = true;
        // once per session, the window fills as the box first appears
        let play = !reduced;
        try {
          if (sessionStorage.getItem(SEEN)) play = false;
        } catch {}
        if (play) {
          a.tab = { from: null, to: v.tab, t0: null };
          try {
            sessionStorage.setItem(SEEN, "1");
          } catch {}
        } else a.shown = v.tab;
      } else {
        const target = a.tab ? a.tab.to : a.shown;
        if (target?.key !== v.tab.key) {
          if (a.tab) a.tab.to = v.tab;
          else if (visible.current && !document.hidden && !reduced && shown) a.tab = { from: a.shown, to: v.tab, t0: null };
          else a.shown = v.tab;
        }
      }
    }
    kick.current();
  }, [tabKey, reduced, shown]);

  // the stage changes hands: an ordered dissolve (instant with reduced motion)
  useEffect(() => {
    const a = anim.current;
    const to = shown ? 4 : 0;
    if (reduced || !visible.current || document.hidden) {
      a.fade = null;
      a.vis = to;
    } else if (a.vis !== to || a.fade) a.fade = { from: a.vis, to, t0: null };
    kick.current();
  }, [shown, reduced]);

  // light, weather, theme, the flap: a repaint (cached unless what it shows changed)
  useEffect(() => {
    kick.current();
  }, [now, flap, P, sky.phase, sky.mode, kind]);

  useImperativeHandle(ref, () => ({
    drop: () =>
      new Promise<void>((resolve) => {
        const a = anim.current;
        if (live.current.reduced || !visible.current || document.hidden || !live.current.view) return resolve();
        a.drop?.done();
        a.drop = { t0: null, landed: false, done: () => resolve() };
        kick.current();
      }),
  }));

  return (
    <div
      ref={wrapRef}
      className="app-contact-postbox"
      role={shown ? "img" : undefined}
      aria-label={shown ? label : undefined}
      aria-hidden={!shown || undefined}
      inert={!shown}
    >
      <canvas
        ref={canvasRef}
        aria-hidden
        style={grid ? { width: grid.N * CELL, height: grid.M * CELL } : undefined}
      />
    </div>
  );
}
