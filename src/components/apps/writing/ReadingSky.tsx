"use client";

import { useEffect, useRef, useState, type RefObject } from "react";
import { useI18n } from "@/i18n/client";
import { scroller } from "@/lib/scroller";
import { loadSky, publishedMs, type Exposure, type Sky, type SkyModule } from "./sky";
import { fmt } from "./util";

/** CSS px per pixel-art cell */
const CELL = 3;

/**
 * Reading is a long exposure: a small window north over Saint-Sernin,
 * beside the text on wide windows (and above it, a band under the bar, on
 * narrow ones). It opens on the sky the post went out under (a daytime
 * post at that evening's sunset), and as the reader goes down the page the
 * night turns and every star draws its trail round the Pole Star, forty
 * minutes of sky for each minute of reading. Scrolling back takes the
 * exposure back. Under it, quietly, the minutes left and the sky's clock.
 *
 * Which of the two it is comes from the CSS (the rail is `sticky` in the
 * band, `absolute` beside the text), so the breakpoint lives in one place.
 */
export function ReadingSky({
  post,
  minutes,
  proseRef,
}: {
  post: { slug: string; published_at: string };
  minutes: number;
  proseRef: RefObject<HTMLElement | null>;
}) {
  const { t } = useI18n();
  const w = t.writing;
  const planets = w.planets.join("|");
  const railRef = useRef<HTMLDivElement>(null);
  const skyRef = useRef<HTMLDivElement>(null);
  const frameRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [left, setLeft] = useState<number | null>(null);
  const [clock, setClock] = useState("");
  const ms = publishedMs(post);

  useEffect(() => {
    const rail = railRef.current;
    const box = skyRef.current;
    const frame = frameRef.current;
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext("2d");
    if (!rail || !box || !frame || !canvas || !ctx || ms == null) return;
    const article = rail.closest<HTMLElement>(".app-writing-article");
    const body = rail.parentElement;
    const sc: HTMLElement | Window = scroller() ?? window;

    let mod: SkyModule | null = null;
    let sky: Sky | null = null;
    let expo: Exposure | null = null;
    let img: ImageData | null = null;
    let out: Uint32Array | null = null;
    let band = false;
    let step = -1;
    let raf = 0;
    let live = true;

    /** the band is lower and wider than the rail: a lower camera, a narrower field */
    const isBand = () => getComputedStyle(rail).position === "sticky";
    const measure = () => {
      if (!mod) return false;
      const W = Math.ceil(frame.clientWidth / CELL);
      const H = Math.ceil(frame.clientHeight / CELL);
      if (W < 8 || H < 6) return false;
      const b = isBand();
      if (sky && expo && sky.W === W && sky.H === H && b === band) return false;
      band = b;
      canvas.width = W;
      canvas.height = H;
      canvas.style.width = `${W * CELL}px`;
      canvas.style.height = `${H * CELL}px`;
      sky = new mod.Sky({ fov: { v: band ? 25 : 30 }, bottom: band ? -1 : -3, moonR: 4, sunR: 3, north: true, planets: planets.split("|") });
      sky.size(W, H);
      expo = new mod.Exposure(sky);
      sky.trail = expo;
      const t0 = mod.exposureStart(ms);
      sky.set(t0, 0);
      expo.reset(t0, minutes);
      img = new ImageData(W, H);
      out = new Uint32Array(img.data.buffer);
      step = -1;
      return true;
    };

    /** how far through the post: 0 as its top reaches mid-window, 1 as its last line shows */
    const progress = () => {
      const prose = proseRef.current;
      if (!prose) return 0;
      const r = prose.getBoundingClientRect();
      const top = sc instanceof Window ? 0 : sc.getBoundingClientRect().top;
      const view = sc instanceof Window ? window.innerHeight : sc.clientHeight;
      const p = (top + view * 0.55 - r.top) / Math.max(1, r.height - view * 0.45);
      return p < 0 ? 0 : p > 1 ? 1 : p;
    };

    const update = () => {
      raf = 0;
      const p = progress();
      const s = Math.round(p * (mod?.STEPS ?? 240));
      if (mod && sky && expo && img && out && s !== step) {
        step = s;
        expo.advance(s);
        sky.ms = expo.at(s);
        sky.paint(out);
        ctx.putImageData(img, 0, 0);
        setClock(`${mod.clockOf(expo.t0)} → ${mod.clockOf(sky.ms)}`);
      }
      // the band only shows once it is stuck under the bar (it rides over the text)
      const b = isBand();
      const on = !b || (!!body && rail.getBoundingClientRect().top > body.getBoundingClientRect().top + 0.5);
      if (on) box.dataset.on = "";
      else delete box.dataset.on;
      if (article) {
        if (b && on) article.dataset.sky = "";
        else delete article.dataset.sky;
      }
      setLeft(p < 0.985 ? Math.max(1, Math.ceil(minutes * (1 - p))) : null);
    };
    const schedule = () => {
      if (!raf) raf = requestAnimationFrame(update);
    };

    const ro = new ResizeObserver(() => {
      if (measure()) step = -1;
      schedule();
    });
    ro.observe(frame);
    update();
    sc.addEventListener("scroll", schedule, { passive: true });
    loadSky().then(
      (m) => {
        if (!live) return;
        mod = m;
        measure();
        schedule();
      },
      () => {},
    );
    return () => {
      live = false;
      ro.disconnect();
      cancelAnimationFrame(raf);
      sc.removeEventListener("scroll", schedule);
      if (article) delete article.dataset.sky;
    };
  }, [ms, minutes, proseRef, planets]);

  return (
    <div ref={railRef} className="app-writing-skyrail" aria-hidden>
      <div ref={skyRef} className="app-writing-sky">
        <div ref={frameRef} className="app-writing-sky-frame">
          <canvas ref={canvasRef} className="app-writing-sky-canvas" width={1} height={1} />
        </div>
        <p className="app-writing-sky-left tabular">
          <span>{left != null ? fmt(w.minLeft, { n: left }) : ""}</span>
          <span className="app-writing-sky-clock">{clock}</span>
        </p>
      </div>
    </div>
  );
}
