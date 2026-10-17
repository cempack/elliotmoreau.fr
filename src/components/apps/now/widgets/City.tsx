"use client";

import { useEffect, useRef, useState, type ReactNode, type RefObject } from "react";
import type { SiteCity } from "@/lib/github";
import { CELL, pixelLoop, type PixelLoop } from "@/lib/pixel3d";
import { useReduced } from "@/hooks/env";
import { spun, useSound } from "@/lib/sound";
import { useI18n } from "@/i18n/client";
import { timeAgo } from "@/lib/format";
import { fill } from "../lib";
import { makeCity, type Building, type City as CityScene } from "./city/scene";

/** the site repo's city, fetched once per visit (a failed fetch is tried again on the next mount) */
let request: Promise<SiteCity | null> | null = null;
function loadCity() {
  request ??= fetch("/api/git?city")
    .then((r) => (r.ok ? r.json() : null))
    .then((j: { city?: SiteCity } | null) => j?.city ?? null)
    .catch(() => null)
    .then((city) => {
      if (!city) request = null;
      return city;
    });
  return request;
}

const toulouseDay = new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Paris" });

/**
 * The code city behind the Building card: a canvas over the whole card,
 * with the city standing in `room` (the space the card's words leave
 * free). Drag to turn it, point at a building to read its file below.
 */
export function City({ room }: { room: RefObject<HTMLElement | null> }) {
  const { t, lang } = useI18n();
  const b = t.now.building;
  const reduced = useReduced();
  const { blip } = useSound();
  const hostRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const sceneRef = useRef<CityScene | null>(null);
  const loopRef = useRef<PixelLoop | null>(null);
  const [data, setData] = useState<SiteCity | null | undefined>(undefined);
  const [picked, setPicked] = useState<Building | null>(null);

  useEffect(() => {
    let live = true;
    loadCity().then((city) => live && setData(city));
    return () => {
      live = false;
    };
  }, []);

  // the scene and its loop (again when reduced motion flips)
  useEffect(() => {
    const host = hostRef.current;
    const canvas = canvasRef.current;
    if (!host || !canvas) return;
    const city = makeCity(reduced);
    sceneRef.current = city;

    const stage = () => {
      const r = room.current?.getBoundingClientRect();
      const h = host.getBoundingClientRect();
      if (!r || !r.width || !r.height) return;
      // the room, and the card's margin beside it where it reaches the card's edge
      const left = r.left - h.left < 30 ? h.left : r.left;
      const right = h.right - r.right < 30 ? h.right : r.right;
      city.setStage({
        cx: ((left + right) / 2 - h.left) / CELL,
        cy: (r.top + r.height / 2 - h.top) / CELL,
        w: (right - left) / CELL,
        h: r.height / CELL,
      });
    };
    const loop = pixelLoop({
      host,
      canvas,
      size: (w, h) => {
        stage();
        return [Math.ceil(w / CELL), Math.ceil(h / CELL)];
      },
      frame: (R, t, dt) => city.frame(R, t, dt),
    });
    loopRef.current = loop;
    const ro = new ResizeObserver(() => {
      stage();
      loop.wake();
    });
    if (room.current) ro.observe(room.current);

    // drag sideways to turn it; point to pick a building
    let drag: { id: number; x: number; t: number } | null = null;
    const cell = (e: PointerEvent) => {
      const r = canvas.getBoundingClientRect();
      return [Math.floor((e.clientX - r.left) / CELL), Math.floor((e.clientY - r.top) / CELL)] as const;
    };
    const pointAt = (i: number) => {
      if (i === city.hover) return;
      city.hover = i;
      setPicked(city.building(i));
      loop.wake();
    };
    const down = (e: PointerEvent) => {
      if (e.button !== 0) return;
      drag = { id: e.pointerId, x: e.clientX, t: performance.now() };
      city.grab(loop.clock());
      loop.wake();
    };
    const move = (e: PointerEvent) => {
      if (drag && e.pointerId === drag.id) {
        const now = performance.now();
        const dx = e.clientX - drag.x;
        if (dx && !host.hasPointerCapture(e.pointerId)) host.setPointerCapture(e.pointerId);
        city.turn(dx, now - drag.t, loop.clock());
        drag.x = e.clientX;
        drag.t = now;
        loop.wake();
        return;
      }
      if (e.pointerType === "touch") return;
      const R = loop.raster();
      if (!R) return;
      const [x, y] = cell(e);
      pointAt(city.pick(R, x, y));
    };
    const up = (e: PointerEvent) => {
      if (!drag || e.pointerId !== drag.id) return;
      spun(blip, city.release(loop.clock(), performance.now() - drag.t > 80), 8);
      drag = null;
      loop.wake();
    };
    const leave = () => {
      if (!drag) pointAt(-1);
    };
    host.addEventListener("pointerdown", down);
    host.addEventListener("pointermove", move);
    host.addEventListener("pointerup", up);
    host.addEventListener("pointercancel", up);
    host.addEventListener("pointerleave", leave);
    return () => {
      host.removeEventListener("pointerdown", down);
      host.removeEventListener("pointermove", move);
      host.removeEventListener("pointerup", up);
      host.removeEventListener("pointercancel", up);
      host.removeEventListener("pointerleave", leave);
      ro.disconnect();
      loop.dispose();
      loopRef.current = null;
      sceneRef.current = null;
    };
  }, [reduced, room, blip]);

  useEffect(() => {
    if (!data) return;
    sceneRef.current?.setData(data);
    loopRef.current?.wake();
  }, [data, reduced]);

  const size = (bytes: number) => {
    const nf = (n: number) => new Intl.NumberFormat(lang === "fr" ? "fr-FR" : "en-GB", { maximumFractionDigits: n < 10 ? 1 : 0 }).format(n);
    return bytes >= 1e6 ? fill(b.mb, { n: nf(bytes / 1e6) }) : fill(b.kb, { n: nf(Math.max(0.1, bytes / 1e3)) });
  };

  let readout: ReactNode = null;
  if (picked) {
    readout = (
      <>
        <b className="app-now-city-path">{picked.path}</b>
        <span>{size(picked.bytes)}</span>
        {picked.changed > 0 && <span className="app-now-city-fresh">{fill(b.changedAgo, { ago: timeAgo(new Date(picked.changed).toISOString(), lang) })}</span>}
      </>
    );
  } else if (data) {
    const today = toulouseDay.format(new Date());
    const fresh = data.files.filter((f) => f[2] && toulouseDay.format(new Date(f[2])) === today).length;
    const total = data.files.reduce((s, f) => s + f[1], 0);
    readout = (
      <>
        <b>{fill(b.files, { n: data.files.length })}</b>
        <span>{size(total)}</span>
        {fresh > 0 && <span className="app-now-city-fresh">{fresh === 1 ? b.changedOne : fill(b.changedMany, { n: fresh })}</span>}
      </>
    );
  } else if (data === null) {
    readout = <span>{b.offline}</span>;
  }

  return (
    <>
      <div
        ref={hostRef}
        className="app-now-city"
        data-no-drag
        role="img"
        aria-label={data ? fill(b.city, { files: data.files.length }) : undefined}
        aria-hidden={data ? undefined : true}
      >
        <canvas ref={canvasRef} className="app-now-city-canvas" />
      </div>
      <p className="app-now-city-readout tabular">
        {readout}
      </p>
    </>
  );
}
