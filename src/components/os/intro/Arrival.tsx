"use client";

import { useEffect, useRef } from "react";
import { useI18n } from "@/i18n/client";
import { useWeather } from "../weather";
import { paintPlanet, project, sunVector, type Camera } from "@/components/apps/atlas/planet";
import { skyLight } from "../wallpaper/light";
import { MAP, lightToulouse, paintToulouse } from "./toulouseMap";

/** Toulouse, where every arrival ends */
const HOME = { lat: 43.6, lon: 1.44 };
/* the timeline, in ms */
const TURN = 1500;
const LOUPE = 1000;
const MAPT = 1300;
const DIVE = 680;
const LAND = TURN + LOUPE + MAPT;
const END = LAND + DIVE;
const CELL = 3;

const ease = (t: number) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);
const easeOut = (t: number) => 1 - Math.pow(1 - t, 3);
const easeIn = (t: number) => t * t * t;
const clamp01 = (t: number) => (t < 0 ? 0 : t > 1 ? 1 : t);
const lerp = (a: number, b: number, t: number) => a + (b - a) * t;

/**
 * Arrive from space (a first visit, in place of the boot's text): the
 * planet under today's real sun turns until Toulouse faces you, the loupe
 * closes in until France fills the screen (the same pixels, bigger), then
 * Toulouse from above through drifting clouds (the Garonne, the canal,
 * the pink city), and the view drops onto the Pont Neuf as the Desktop
 * settles in under it. About four seconds; any key or tap skips it (the
 * Gate listens). `onLand` hands over to the Desktop as the dive starts;
 * `onGone` once the last pixel has faded.
 */
export function Arrival({ skipped, onLand, onGone }: { skipped: boolean; onLand: () => void; onGone: () => void }) {
  const { t, lang } = useI18n();
  const s = t.system.intro;
  // today's clouds over Toulouse
  const { kind } = useWeather();
  const near = kind === "clear" ? 1 : kind === "autan" ? 2 : 3;
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const readRef = useRef<HTMLParagraphElement>(null);
  const rootRef = useRef<HTMLDivElement>(null);
  const handlers = useRef({ onLand, onGone });
  useEffect(() => {
    handlers.current = { onLand, onGone };
  });

  // a skip: out at once
  useEffect(() => {
    if (!skipped) return;
    const el = rootRef.current;
    if (!el) return handlers.current.onGone();
    const a = el.animate([{ opacity: 1 }, { opacity: 0 }], { duration: 180, fill: "forwards" });
    a.finished.then(
      () => handlers.current.onGone(),
      () => handlers.current.onGone()
    );
  }, [skipped]);

  useEffect(() => {
    const cv = canvasRef.current;
    const ctx = cv?.getContext("2d");
    const root = rootRef.current;
    if (!cv || !ctx || !root) return;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    cv.width = Math.round(vw * dpr);
    cv.height = Math.round(vh * dpr);
    ctx.imageSmoothingEnabled = false;

    const num = new Intl.NumberFormat(lang === "fr" ? "fr-FR" : "en-GB", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    const coords = (lat: number, lon: number) =>
      `${num.format(Math.abs(lat))}° ${lat >= 0 ? "N" : "S"} · ${num.format(Math.abs(lon))}° ${lon >= 0 ? "E" : (lang === "fr" ? "O" : "W")}`;

    // the planet: a still raster per frame, R cells across its radius
    const R = Math.max(40, Math.round((Math.min(vw, vh) / CELL) * (vw < 640 ? 0.4 : 0.34)));
    const planet = document.createElement("canvas");
    const sun = sunVector(new Date());
    // the map, painted once, in the light the Desktop is about to show (the dive lands in the same hour)
    const map = paintToulouse(near);
    lightToulouse(map, skyLight(Date.now()));
    const ground = document.createElement("canvas");
    ground.width = ground.height = MAP;
    ground.getContext("2d")?.putImageData(map.ground, 0, 0);
    const clouds = document.createElement("canvas");
    clouds.width = clouds.height = MAP;
    clouds.getContext("2d")?.putImageData(map.clouds, 0, 0);
    // the disc covers the screen at the end of the loupe
    const cover = Math.hypot(vw, vh) / 2 / (R * CELL) * 1.04;

    let raf = 0;
    let t0 = 0;
    let landed = false;
    let lastCam = "";

    const drawPlanet = (cam: Camera, scale: number, alpha: number) => {
      const key = `${cam.lat.toFixed(3)}:${cam.lon.toFixed(3)}:${cam.zoom.toFixed(3)}`;
      if (key !== lastCam) {
        paintPlanet(planet, R, cam, sun);
        lastCam = key;
      }
      const size = (R * 2 + 1) * CELL * scale * dpr;
      ctx.globalAlpha = alpha;
      ctx.drawImage(planet, (vw * dpr - size) / 2, (vh * dpr - size) / 2, size, size);
      ctx.globalAlpha = 1;
      return size;
    };
    const ring = (x: number, y: number, r: number, a: number) => {
      ctx.globalAlpha = a;
      ctx.strokeStyle = "#f8ebe3";
      ctx.lineWidth = 2 * dpr;
      ctx.beginPath();
      ctx.arc(x, y, r * dpr, 0, Math.PI * 2);
      ctx.stroke();
      ctx.globalAlpha = 1;
    };

    const frame = (now: number) => {
      if (!t0) t0 = now;
      const e = now - t0;
      ctx.fillStyle = "#050607";
      ctx.fillRect(0, 0, cv.width, cv.height);

      if (e < TURN + LOUPE + 360) {
        // 1. the planet turns until Toulouse faces you; 2. the loupe closes in
        const a = ease(clamp01(e / TURN));
        const b = easeOut(clamp01((e - TURN) / LOUPE));
        const cam: Camera = { lat: lerp(16, HOME.lat, a), lon: lerp(-58, HOME.lon, a), zoom: lerp(1, 7, b * b) };
        const scale = lerp(1, cover, easeIn(b));
        drawPlanet(cam, scale, 1);
        // a ring finds Toulouse as it comes round
        const show = clamp01((e - TURN * 0.62) / 300) * (1 - clamp01((e - TURN - LOUPE * 0.6) / 300));
        if (show > 0) {
          const p = project(HOME.lat, HOME.lon, R, cam);
          if (p.front) ring(vw * dpr / 2 + p.x * CELL * scale * dpr, vh * dpr / 2 + p.y * CELL * scale * dpr, lerp(26, 14, b), show);
        }
        if (readRef.current) readRef.current.textContent = coords(cam.lat, cam.lon);
      }

      if (e >= TURN + LOUPE) {
        // 3. Toulouse from above, the clouds drifting over it; 4. down onto the Pont Neuf
        const m = clamp01((e - TURN - LOUPE) / MAPT);
        const d = clamp01((e - LAND) / DIVE);
        const fadeIn = clamp01((e - TURN - LOUPE) / 360);
        const base = Math.max(vw, vh) / MAP;
        const zoom = lerp(1.25, 2.1, ease(m)) * lerp(1, 4.5, easeIn(d));
        const sc = base * zoom * dpr;
        const ox = vw * dpr / 2 - map.bridge.x * sc;
        const oy = vh * dpr / 2 - map.bridge.y * sc;
        ctx.globalAlpha = fadeIn;
        ctx.drawImage(ground, ox, oy, MAP * sc, MAP * sc);
        // the clouds sit nearer: they drift and they grow faster as we fall through them
        const csc = sc * lerp(1, 1.6, easeIn(d));
        const drift = (e - TURN - LOUPE) * 0.006;
        ctx.drawImage(clouds, vw * dpr / 2 - (map.bridge.x - drift) * csc, vh * dpr / 2 - map.bridge.y * csc, MAP * csc, MAP * csc);
        ctx.globalAlpha = 1;
        ring(vw * dpr / 2, vh * dpr / 2, lerp(44, 24, ease(m)) * (1 + d * 2), fadeIn * (1 - d));
        if (readRef.current) readRef.current.textContent = `Toulouse · ${coords(HOME.lat, HOME.lon)}`;
      }

      if (e >= LAND && !landed) {
        landed = true;
        handlers.current.onLand();
        // the Desktop settles in underneath as the view dissolves into it
        root.animate([{ opacity: 1 }, { opacity: 0 }], { duration: DIVE, easing: "cubic-bezier(0.45, 0, 0.55, 1)", fill: "forwards" });
      }
      if (e >= END) {
        handlers.current.onGone();
        return;
      }
      raf = requestAnimationFrame(frame);
    };
    raf = requestAnimationFrame(frame);
    return () => cancelAnimationFrame(raf);
    // painted once, for the weather it started under
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lang]);

  return (
    <div ref={rootRef} className="os-arrival" aria-hidden>
      <canvas ref={canvasRef} className="os-arrival-canvas" />
      <p ref={readRef} className="os-arrival-read tabular" />
      <p className="os-arrival-skip">
        <span className="os-boot-skip">{s.skip}</span>
        <span className="os-boot-skip os-boot-skip--touch">{s.skipTouch}</span>
      </p>
    </div>
  );
}
