"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { animate, m, useMotionValue, useMotionValueEvent, useTransform, type AnimationPlaybackControls } from "motion/react";
import { useI18n } from "@/i18n/client";
import { useSound } from "@/lib/sound";
import { useReduced } from "@/hooks/env";
import { project, spring } from "@/lib/motion";
import { QUARTER, useQuarterHour } from "@/hooks/useQuarterHour";
import { useSky } from "@/components/os/sky";
import { pinnedMs } from "@/components/os/wallpaper/sunClock";
import { skyLight } from "@/components/os/wallpaper/light";
import type { PlaceRow } from "@/lib/content";
import { bearingDeg, compassIndex, distanceKm } from "./geo";
import { useAtlas } from "./useAtlas";
import { fill, useKm } from "./fmt";
import { angleTo, DEG_PX, HORIZON, HZ_H, HZ_W, paintHorizon, peaksFrom, type PeakAt } from "./skyline";

/** the window always shows this much of the circle, whatever its width */
const VIEW = 120;
const VIEW_PX = VIEW / DEG_PX;
/** a landing this close to a flag snaps to it */
const SNAP = 10;
/** what counts as under the reticle */
const UNDER = 4;

const mod = (v: number) => ((v % 360) + 360) % 360;

type Pin = {
  id: string;
  name: string;
  status: PlaceRow["status"];
  bearing: number;
  km: number;
  /** art pixels: column, pole height */
  x: number;
  h: number;
};

type Under = { kind: "place"; pin: Pin } | { kind: "peak"; peak: PeakAt } | { kind: "none" };
const keyOf = (u: Under) => (u.kind === "place" ? `p:${u.pin.id}` : u.kind === "peak" ? `k:${u.peak.name}` : "none");

/** nearer places stand taller (log distance), so neighbours separate; the
    tallest still leaves room over its flag for the selected name */
function poleHeight(km: number) {
  const t = (Math.log10(20000) - Math.log10(Math.max(1, km))) / (Math.log10(20000) - Math.log10(400));
  return Math.round(8 + Math.min(1, Math.max(0, t)) * 14);
}

/** a pennant: filled for been, drawn in outline for the list */
function Pennant({ tone }: { tone: PlaceRow["status"] }) {
  return (
    <svg className="app-atlas-hz-flag" width="11" height="8" viewBox="0 0 11 8" aria-hidden focusable="false">
      {tone === "want" ? <path d="M0.6 0.9 L9.2 4 L0.6 7.1 Z" strokeWidth="1.2" strokeLinejoin="round" /> : <path d="M0 0 L11 4 L0 8 Z" />}
    </svg>
  );
}

/** Big tabular number that rolls from the previous value to the new one,
    paced with the arc drawing on the globe. */
export function Rolling({ value }: { value: number }) {
  const reduced = useReduced();
  const fmt = useKm();
  const mv = useMotionValue(value);
  const text = useTransform(mv, (v) => fmt(Math.round(v)));
  useEffect(() => {
    if (reduced) {
      mv.jump(value);
      return;
    }
    const a = animate(mv, value, { duration: 1.05, delay: 0.32, ease: [0.22, 1, 0.36, 1] });
    return () => a.stop();
  }, [value, reduced, mv]);
  return <m.span className="tabular">{text}</m.span>;
}

/**
 * The view from Toulouse: the horizon all the way round, as the
 * orientation tables at French viewpoints draw it. Every place stands as a
 * pennant at its true compass heading (ember for been, an ion outline for
 * the list), nearer ones taller, the selected one named on a plate over
 * it; the Pyrenees fill the south. Turn it by dragging (it coasts, and a
 * throw that lands near a flag snaps to it and flies the globe there), or
 * step from flag to flag with the arrow keys.
 * Picking a place anywhere else turns it the short way round. The art is
 * painted once per quarter hour and sky change; turning only slides it.
 */
export function Horizon({ place, isHome, onSelect }: { place: PlaceRow; isHome: boolean; onSelect: (id: string) => void }) {
  const { t, lang } = useI18n();
  const a = t.atlas;
  const { blip } = useSound();
  const reduced = useReduced();
  const km = useKm();
  const { phase, mode } = useSky();
  const quarter = useQuarterHour();
  const { home, ordered, been, next } = useAtlas();
  const peaks = useMemo(() => peaksFrom(home), [home]);

  const pins = useMemo(() => {
    const list: Pin[] = ordered
      .filter((p) => p.id !== home.id && !p.home)
      .map((p) => {
        const bearing = bearingDeg(home, p);
        const d = distanceKm(home, p);
        return { id: p.id, name: p.name[lang], status: p.status, bearing, km: d, x: bearing / DEG_PX, h: poleHeight(d) };
      })
      .sort((p, q) => p.bearing - q.bearing);
    return list;
  }, [ordered, home, lang]);

  const want = isHome ? 180 : (pins.find((p) => p.id === place.id)?.bearing ?? 180);
  const heading = useMotionValue(want);
  const scale = useMotionValue(1.75);
  const x = useTransform(() => -(mod(heading.get() - VIEW / 2) / DEG_PX) * scale.get());

  const bandRef = useRef<HTMLDivElement>(null);
  const stripRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const degRef = useRef<HTMLSpanElement>(null);
  const anim = useRef<AnimationPlaybackControls | null>(null);
  /** where the band is headed (unwrapped degrees) */
  const goal = useRef(want);
  /** a person is turning it (dragging or a coast after a throw): flags tick */
  const driven = useRef(false);
  const last = useRef(want);
  const lastTick = useRef(0);

  // paint the circle once per quarter hour, sky mode or home
  useEffect(() => {
    const c = canvasRef.current;
    const ctx = c?.getContext("2d");
    if (!ctx || !quarter) return;
    const ms = mode === "auto" ? quarter * QUARTER + QUARTER / 2 : pinnedMs(phase, new Date());
    const buf = new Uint32Array(HZ_W * HZ_H);
    paintHorizon(buf, skyLight(ms), peaks);
    const img = new ImageData(new Uint8ClampedArray(buf.buffer), HZ_W, HZ_H);
    ctx.putImageData(img, 0, 0);
    ctx.putImageData(img, HZ_W, 0);
  }, [quarter, phase, mode, peaks]);

  // the scale: art pixels per CSS px, so the window always spans VIEW degrees
  useEffect(() => {
    const el = bandRef.current;
    if (!el) return;
    const ro = new ResizeObserver(([e]) => {
      const s = e.contentRect.width / VIEW_PX;
      if (s > 0) {
        scale.set(s);
        el.style.setProperty("--s", String(s));
      }
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, [scale]);

  // picked elsewhere (list, postcard, globe): turn the short way round
  useEffect(() => {
    if (Math.abs(angleTo(goal.current, want)) < 0.5) return;
    const cur = heading.get();
    const tgt = cur + angleTo(cur, want);
    goal.current = tgt;
    driven.current = false;
    anim.current?.stop();
    if (reduced) heading.jump(tgt);
    else anim.current = animate(heading, tgt, spring.gentle);
  }, [want, heading, reduced]);

  const pick = (h: number): Under => {
    let pin: Pin | null = null;
    let pd = UNDER;
    for (const p of pins) {
      const d = Math.abs(angleTo(h, p.bearing));
      if (d < pd) {
        pd = d;
        pin = p;
      }
    }
    if (pin) return { kind: "place", pin };
    let peak: PeakAt | null = null;
    let kd = UNDER;
    for (const p of peaks) {
      const d = Math.abs(angleTo(h, p.bearing));
      if (d < kd) {
        kd = d;
        peak = p;
      }
    }
    return peak ? { kind: "peak", peak } : { kind: "none" };
  };
  const [under, setUnder] = useState<Under>(() => pick(mod(want)));
  const underKey = useRef(keyOf(under));

  const lift = (id: string) => {
    const els = stripRef.current?.querySelectorAll<HTMLElement>(`[data-pin="${CSS.escape(id)}"]`);
    els?.forEach((el) => {
      el.dataset.lift = "";
      window.setTimeout(() => delete el.dataset.lift, 90);
    });
  };

  useMotionValueEvent(heading, "change", (h) => {
    const prev = last.current;
    last.current = h;
    // detents: each flag crossing the reticle ticks and hops a pixel
    if (driven.current && Math.abs(h - prev) < 90) {
      const lo = Math.min(prev, h);
      const hi = Math.max(prev, h);
      for (const p of pins) {
        if (Math.floor((hi - p.bearing) / 360) < Math.ceil((lo - p.bearing) / 360)) continue;
        const now = performance.now();
        if (now - lastTick.current > 40) {
          lastTick.current = now;
          blip("tick");
        }
        if (!reduced) lift(p.id);
      }
    }
    const u = pick(mod(h));
    const k = keyOf(u);
    if (k !== underKey.current) {
      underKey.current = k;
      setUnder(u);
    }
    if (u.kind === "none" && degRef.current) {
      const d = mod(h);
      degRef.current.textContent = `${Math.round(d) % 360}° ${a.compass[compassIndex(d)]}`;
    }
  });

  /** let go with `v` degrees a second: coast, then rest, snapping to a flag it lands near */
  const release = (v: number) => {
    const h = heading.get();
    const land = reduced ? h : h + project(v);
    let best: Pin | null = null;
    let bd = SNAP;
    for (const p of pins) {
      const d = Math.abs(angleTo(land, p.bearing));
      if (d < bd) {
        bd = d;
        best = p;
      }
    }
    const tgt = best ? land + angleTo(land, best.bearing) : land;
    goal.current = tgt;
    anim.current?.stop();
    if (reduced) heading.jump(tgt);
    // it only bounces because it was thrown
    else anim.current = animate(heading, tgt, best && Math.abs(v) > 60 ? { ...spring.flick, velocity: v } : { ...spring.default, velocity: v });
    if (best && best.id !== place.id) onSelect(best.id);
  };

  const grab = useRef<{ id: number; sx: number; sy: number; x0: number; h0: number; on: boolean; pin: string | null; s: [number, number][] } | null>(null);
  const onPointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    if (e.button !== 0) return;
    // a coasting band stops under the finger
    anim.current?.stop();
    const pin = (e.target as HTMLElement).closest<HTMLElement>("[data-pin]")?.dataset.pin ?? null;
    grab.current = { id: e.pointerId, sx: e.clientX, sy: e.clientY, x0: e.clientX, h0: heading.get(), on: false, pin, s: [[e.timeStamp, e.clientX]] };
  };
  const onPointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    const g = grab.current;
    if (!g || g.id !== e.pointerId) return;
    const dx = e.clientX - g.sx;
    if (!g.on) {
      // vertical first: the sheet (or the page) gets it
      if (Math.abs(e.clientY - g.sy) > 10 && Math.abs(dx) < 10) {
        grab.current = null;
        release(0);
        return;
      }
      if (Math.abs(dx) < 10) return;
      g.on = true;
      g.x0 = e.clientX;
      g.h0 = heading.get();
      driven.current = true;
      e.currentTarget.setPointerCapture(e.pointerId);
      e.currentTarget.dataset.grabbing = "";
    }
    e.stopPropagation();
    heading.set(g.h0 - ((e.clientX - g.x0) * DEG_PX) / scale.get());
    g.s.push([e.timeStamp, e.clientX]);
    while (g.s.length > 2 && e.timeStamp - g.s[0][0] > 100) g.s.shift();
  };
  const onPointerUp = (e: React.PointerEvent<HTMLDivElement>) => {
    const g = grab.current;
    grab.current = null;
    delete e.currentTarget.dataset.grabbing;
    if (!g || g.id !== e.pointerId) return;
    if (!g.on) {
      // a tap: on a flag, go there; anywhere else, settle where it stopped
      if (g.pin && g.pin !== place.id) onSelect(g.pin);
      else release(0);
      return;
    }
    const [t0, x0] = g.s[0];
    const dt = (e.timeStamp - t0) / 1000;
    const vpx = dt > 0.008 ? (e.clientX - x0) / dt : 0;
    release((-vpx * DEG_PX) / scale.get());
  };
  const onPointerCancel = () => {
    if (!grab.current) return;
    grab.current = null;
    delete bandRef.current?.dataset.grabbing;
    release(0);
  };

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key !== "ArrowRight" && e.key !== "ArrowLeft") return;
    if (!pins.length) return;
    e.preventDefault();
    const h = mod(goal.current);
    // the next flag clockwise (right) or anticlockwise (left) of where it faces
    const gap = (p: Pin) => (e.key === "ArrowRight" ? mod(p.bearing - h) : mod(h - p.bearing));
    const nextPin = pins.filter((p) => gap(p) > 0.5).sort((p, q) => gap(p) - gap(q))[0] ?? pins[0];
    if (nextPin.id !== place.id) onSelect(nextPin.id);
  };

  // the readout: what's under the reticle, and the card's figure
  const routes = been.length - 1 + next.length;
  const dirOf = (d: number) => a.compass[compassIndex(mod(d))];
  const fmtM = (n: number) => new Intl.NumberFormat(lang === "fr" ? "fr-FR" : "en-GB").format(n);
  const routesText = fill(a.horizon.routes, { n: routes });
  let title: string;
  let meta: React.ReactNode;
  let stat: React.ReactNode = isHome ? routesText : null;
  let valueText: string;
  let now: number;
  if (under.kind === "place") {
    const p = under.pin;
    title = p.name;
    meta = `${Math.round(p.bearing) % 360}° ${dirOf(p.bearing)}`;
    stat = (
      <>
        <Rolling value={p.km} /> {a.km}
      </>
    );
    valueText = fill(a.horizon.value, { place: p.name, deg: Math.round(p.bearing) % 360, dir: dirOf(p.bearing), km: km(Math.round(p.km)) });
    now = p.bearing;
  } else if (under.kind === "peak") {
    const k = under.peak;
    title = k.name;
    meta = `${fmtM(k.m)} m`;
    stat ??= `${Math.round(k.bearing)}° ${dirOf(k.bearing)}`;
    valueText = fill(a.horizon.peak, { peak: k.name, m: fmtM(k.m), deg: Math.round(k.bearing), dir: dirOf(k.bearing) });
    now = k.bearing;
  } else {
    const d = mod(heading.get());
    title = a.horizon.label;
    meta = <span ref={degRef}>{`${Math.round(d) % 360}° ${dirOf(d)}`}</span>;
    valueText = fill(a.horizon.facing, { deg: Math.round(d) % 360, dir: dirOf(d) });
    now = d;
  }

  const cardinals = [0, 2, 4, 6, 8, 10, 12, 14];
  return (
    <div className="app-atlas-horizon" data-sheet-half="">
      <div
        ref={bandRef}
        className="app-atlas-hz-band"
        role="slider"
        tabIndex={0}
        aria-label={a.horizon.label}
        aria-valuemin={0}
        aria-valuemax={359}
        aria-valuenow={Math.round(mod(now)) % 360}
        aria-valuetext={valueText}
        title={a.horizon.hint}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerCancel}
        onKeyDown={onKeyDown}
      >
        <m.div ref={stripRef} className="app-atlas-hz-strip" style={{ x }} aria-hidden>
          <canvas ref={canvasRef} className="app-atlas-hz-art" width={HZ_W * 2} height={HZ_H} />
          <span className="app-atlas-hz-tape" />
          {[0, HZ_W].map((off) => (
            <span key={off}>
              {cardinals.map((i) => (
                <span
                  key={i}
                  className="app-atlas-hz-card"
                  data-major={i % 4 === 0 || undefined}
                  style={{ "--x": off + (i * 22.5) / DEG_PX } as React.CSSProperties}
                >
                  {a.compass[i]}
                </span>
              ))}
              {pins.map((p) => (
                <span
                  key={p.id}
                  className="app-atlas-hz-pin"
                  data-pin={p.id}
                  data-tone={p.status}
                  data-on={p.id === place.id || undefined}
                  style={{ "--x": off + p.x, "--h": p.h, "--foot": HZ_H - HORIZON - 1 } as React.CSSProperties}
                >
                  <Pennant tone={p.status} />
                  {p.id === place.id && <span className="app-atlas-hz-plate">{p.name}</span>}
                </span>
              ))}
            </span>
          ))}
        </m.div>
        <span className="app-atlas-hz-reticle" aria-hidden />
      </div>
      <p className="app-atlas-hz-read" aria-hidden>
        <span className="app-atlas-hz-title">{title}</span>
        <span className="app-atlas-hz-meta tabular">{meta}</span>
        {stat != null && <span className="app-atlas-hz-stat tabular">{stat}</span>}
      </p>
    </div>
  );
}
