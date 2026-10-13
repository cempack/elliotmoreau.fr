"use client";

import { useEffect, useRef, useState } from "react";
import { useI18n } from "@/i18n/client";
import { useReduced } from "@/hooks/env";
import { CELL, pixelLoop, type PixelLoop } from "@/lib/pixel3d";
import { sunAt, TOULOUSE } from "@/lib/sun";
import { clockIn, tzForPlace } from "@/lib/tz";
import { QUARTER, useQuarterHour } from "@/hooks/useQuarterHour";
import { useSky } from "@/components/os/sky";
import { pinnedMs } from "@/components/os/wallpaper/sunClock";
import type { PlaceRow } from "@/lib/content";
import { fill } from "../fmt";
import { makeRelief, type ReliefData, type ReliefScene } from "./scene";

/** reliefs fetched this visit, by place and where it is (an edited place asks again) */
const requests = new Map<string, Promise<ReliefData | null>>();
function loadRelief(p: PlaceRow) {
  const v = `${p.iso},${p.lat},${p.lon}`;
  const key = `${p.id}|${v}`;
  let hit = requests.get(key);
  if (!hit) {
    hit = fetch(`/api/relief?place=${encodeURIComponent(p.id)}&v=${encodeURIComponent(v)}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((j: { relief?: ReliefData } | null) => j?.relief ?? null)
      .catch(() => null)
      .then((r) => {
        if (!r) requests.delete(key);
        return r;
      });
    requests.set(key, hit);
  }
  return hit;
}

/**
 * The country, lifted out (scene.ts): the selected place's land as a
 * relief block in the card, lit by the sun where it is. Drag sideways to
 * turn it. Under it, the hour there and what the light is doing.
 */
export function Relief({ place }: { place: PlaceRow }) {
  const { t, lang } = useI18n();
  const r = t.atlas.relief;
  const reduced = useReduced();
  const { phase, mode } = useSky();
  const quarter = useQuarterHour();
  const hostRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const sceneRef = useRef<ReliefScene | null>(null);
  const loopRef = useRef<PixelLoop | null>(null);
  const [data, setData] = useState<{ id: string; relief: ReliefData | null } | null>(null);

  useEffect(() => {
    let live = true;
    loadRelief(place).then((relief) => live && setData({ id: place.id, relief }));
    return () => {
      live = false;
    };
  }, [place]);

  useEffect(() => {
    const host = hostRef.current;
    const canvas = canvasRef.current;
    if (!host || !canvas) return;
    const scene = makeRelief(reduced);
    sceneRef.current = scene;
    const loop = pixelLoop({
      host,
      canvas,
      size: (w, h) => [Math.ceil(w / CELL), Math.ceil(h / CELL)],
      frame: (R, tt, dt) => scene.frame(R, tt, dt),
    });
    loopRef.current = loop;

    // drag sideways to turn it; an upright drag scrolls the card
    let drag: { id: number; x: number; t: number } | null = null;
    const down = (e: PointerEvent) => {
      if (e.button !== 0) return;
      drag = { id: e.pointerId, x: e.clientX, t: performance.now() };
      scene.grab();
      loop.wake();
    };
    const move = (e: PointerEvent) => {
      if (!drag || e.pointerId !== drag.id) return;
      const now = performance.now();
      const dx = e.clientX - drag.x;
      if (dx && !host.hasPointerCapture(e.pointerId)) host.setPointerCapture(e.pointerId);
      scene.turn(dx, now - drag.t);
      drag.x = e.clientX;
      drag.t = now;
      loop.wake();
    };
    const up = (e: PointerEvent) => {
      if (!drag || e.pointerId !== drag.id) return;
      scene.release(performance.now() - drag.t > 80);
      drag = null;
      loop.wake();
    };
    host.addEventListener("pointerdown", down);
    host.addEventListener("pointermove", move);
    host.addEventListener("pointerup", up);
    host.addEventListener("pointercancel", up);
    return () => {
      host.removeEventListener("pointerdown", down);
      host.removeEventListener("pointermove", move);
      host.removeEventListener("pointerup", up);
      host.removeEventListener("pointercancel", up);
      loop.dispose();
      loopRef.current = null;
      sceneRef.current = null;
    };
  }, [reduced]);

  // the sun where the place is: now (to the quarter hour), or, when the sky is pinned to a
  // time of day, that same time of day there
  const ms = mode === "auto" ? quarter * QUARTER + QUARTER / 2 : pinnedMs(phase, new Date()) + (TOULOUSE.lon - place.lon) * 240_000;
  const sun = sunAt(ms, place.lat, place.lon);
  const relief = data?.id === place.id ? data.relief : undefined;

  // the scene is remade when reduced motion flips, so both of these run again then
  useEffect(() => {
    sceneRef.current?.setSun(sun.elevation, sun.azimuth);
    loopRef.current?.wake();
  }, [sun.elevation, sun.azimuth, reduced]);

  const { lat, lon, status, home } = place;
  useEffect(() => {
    if (!relief) return;
    sceneRef.current?.setData(relief, { lat, lon, status: status === "want" ? "want" : "been", home: Boolean(home) });
    loopRef.current?.wake();
  }, [relief, lat, lon, status, home, reduced]);

  const nf = new Intl.NumberFormat(lang === "fr" ? "fr-FR" : "en-GB");
  const light = sun.elevation > 4 ? fill(r.sunUp, { deg: Math.round(sun.elevation) }) : sun.elevation > -4 ? r.horizon : r.night;
  const name = place.name[lang];

  return (
    <figure className="app-atlas-relief">
      <div
        ref={hostRef}
        className="app-atlas-relief-stage"
        data-no-drag
        role="img"
        aria-label={relief ? fill(r.label, { place: name, m: nf.format(relief.top) }) : undefined}
        aria-hidden={relief ? undefined : true}
      >
        <canvas ref={canvasRef} className="app-atlas-relief-canvas" />
      </div>
      <figcaption className="app-atlas-relief-readout tabular">
        <b>{fill(r.time, { time: mode === "auto" ? clockIn(tzForPlace(place)) : clockIn(tzForPlace(place), new Date(ms)) })}</b>
        <span data-tone={sun.elevation > 4 ? "day" : "night"}>{light}</span>
        {relief && <span className="app-atlas-relief-high">{fill(r.high, { m: nf.format(relief.top) })}</span>}
        {relief === null && <span>{r.offline}</span>}
      </figcaption>
    </figure>
  );
}
