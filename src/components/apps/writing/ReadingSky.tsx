"use client";

import { useEffect, useRef, useState, type RefObject } from "react";
import { useI18n } from "@/i18n/client";
import { scroller } from "@/lib/scroller";
import { buildDay, hourAt, renderDay, type DayWorld } from "./daySky";
import { fmt } from "./util";

/** CSS px per pixel-art cell */
const CELL = 3;
/** the day turns in this many steps from the first line to the last */
const STEPS = 240;

/**
 * A day inside the post: a small window onto the post's world, beside the
 * text on wide windows (and above it, a band under the bar, on narrow
 * ones), whose sky follows the reading. The first line is first light,
 * halfway the sun is high, the last line is night with its stars out and
 * the windows lit. Under it, quietly, how many minutes are left.
 *
 * Which of the two it is comes from the CSS (the rail is `sticky` in the
 * band, `absolute` beside the text), so the breakpoint lives in one place.
 */
export function ReadingSky({ slug, minutes, proseRef }: { slug: string; minutes: number; proseRef: RefObject<HTMLElement | null> }) {
  const { t } = useI18n();
  const w = t.writing;
  const railRef = useRef<HTMLDivElement>(null);
  const skyRef = useRef<HTMLDivElement>(null);
  const frameRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [left, setLeft] = useState<number | null>(null);

  useEffect(() => {
    const rail = railRef.current;
    const sky = skyRef.current;
    const frame = frameRef.current;
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext("2d");
    if (!rail || !sky || !frame || !canvas || !ctx) return;
    const article = rail.closest<HTMLElement>(".app-writing-article");
    const body = rail.parentElement;
    const sc: HTMLElement | Window = scroller() ?? window;

    let world: DayWorld | null = null;
    let img: ImageData | null = null;
    let step = -1;
    let raf = 0;

    const measure = () => {
      const W = Math.ceil(frame.clientWidth / CELL);
      const H = Math.ceil(frame.clientHeight / CELL);
      if (W < 8 || H < 6) return false;
      if (world && world.W === W && world.H === H) return false;
      canvas.width = W;
      canvas.height = H;
      canvas.style.width = `${W * CELL}px`;
      canvas.style.height = `${H * CELL}px`;
      world = buildDay(slug, W, H);
      img = new ImageData(W, H);
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
      const s = Math.round(p * STEPS);
      if (world && img && s !== step) {
        step = s;
        renderDay(world, hourAt(s / STEPS), img.data);
        ctx.putImageData(img, 0, 0);
      }
      // the band only shows once it is stuck under the bar (it rides over the text)
      const band = getComputedStyle(rail).position === "sticky";
      const on = !band || (!!body && rail.getBoundingClientRect().top > body.getBoundingClientRect().top + 0.5);
      if (on) sky.dataset.on = "";
      else delete sky.dataset.on;
      if (article) {
        if (band && on) article.dataset.sky = "";
        else delete article.dataset.sky;
      }
      setLeft(p < 0.985 ? Math.max(1, Math.ceil(minutes * (1 - p))) : null);
    };
    const schedule = () => {
      if (!raf) raf = requestAnimationFrame(update);
    };

    const ro = new ResizeObserver(() => {
      measure();
      step = -1;
      schedule();
    });
    ro.observe(frame);
    measure();
    update();
    sc.addEventListener("scroll", schedule, { passive: true });
    return () => {
      ro.disconnect();
      cancelAnimationFrame(raf);
      sc.removeEventListener("scroll", schedule);
      if (article) delete article.dataset.sky;
    };
  }, [slug, minutes, proseRef]);

  return (
    <div ref={railRef} className="app-writing-skyrail" aria-hidden>
      <div ref={skyRef} className="app-writing-sky">
        <div ref={frameRef} className="app-writing-sky-frame">
          <canvas ref={canvasRef} className="app-writing-sky-canvas" width={1} height={1} />
        </div>
        <p className="app-writing-sky-left tabular">{left != null ? fmt(w.minLeft, { n: left }) : ""}</p>
      </div>
    </div>
  );
}
