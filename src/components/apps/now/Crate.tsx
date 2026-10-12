"use client";

import { animate, type AnimationPlaybackControls } from "motion/react";
import { memo, useEffect, useId, useLayoutEffect, useRef, useState } from "react";
import { PixelGlyph } from "@/components/glyphs";
import { PixelLabel } from "@/components/PixelLabel";
import { G_CHEVRON } from "@/components/os/window/glyphs";
import { useReduced } from "@/hooks/env";
import { clamp, project, rubberband, spring } from "@/lib/motion";
import { useSound } from "@/lib/sound";
import { Art, G_ARROW } from "./bits";

/**
 * Elliot's top artists as record sleeves standing on a ledge, fanned out
 * like a record-shop browser: the one you're on faces you, the ones
 * before and after lean away on either side, smaller and in shadow, so
 * there is plainly more to go through. Ranks only: Spotify gives an
 * order, not play counts.
 *
 * Every way of going through them lands on the same sleeve: drag or
 * swipe sideways (1:1, rubber-banded past the ends, thrown on release
 * and landing on the nearest sleeve), a two-finger swipe on a trackpad,
 * the ‹ › buttons, the strip of covers under it (tap one to jump), or the
 * arrow keys. A tap on a side sleeve brings it to the front; the front
 * one, or its name, opens the artist on Spotify. Vertical stays the
 * page's scroll. Each step ticks.
 */

type Artist = { name: string; image: string; url: string };

/** where a sleeve sits for its distance d from the front (fractional while moving) */
function place(d: number, s: number, reduced: boolean) {
  const a = Math.abs(d);
  const side = Math.sign(d);
  // the first step clears most of the front sleeve; the ones behind it stack tighter
  const x = side * (Math.min(a, 1) * 0.44 + Math.max(a - 1, 0) * 0.13) * s;
  const scale = 1 - Math.min(a, 3) * 0.1;
  const turn = reduced ? 0 : -clamp(d, -1, 1) * 38;
  return {
    transform: `translate3d(${x.toFixed(1)}px, 0, 0) perspective(${(s * 4).toFixed(0)}px) rotateY(${turn.toFixed(1)}deg) scale(${scale.toFixed(3)})`,
    shade: Math.min(a, 2.2) * 0.3,
    z: 100 - Math.round(a * 10),
    hidden: a > 3.4,
  };
}

export const Crate = memo(function Crate({
  artists,
  labels,
}: {
  artists: Artist[];
  labels: { title: string; hint: string; prev: string; next: string; open: string };
}) {
  const n = artists.length;
  const id = useId();
  const reduced = useReduced();
  const { blip } = useSound();
  const [focus, setFocus] = useState(0);
  const stage = useRef<HTMLDivElement>(null);
  const sleeves = useRef<(HTMLDivElement | null)[]>([]);
  const size = useRef(144);
  const pos = useRef(0);
  const shown = useRef(0);
  const flight = useRef<AnimationPlaybackControls | null>(null);
  const wheel = useRef<{ t: ReturnType<typeof setTimeout> | null; on: boolean }>({ t: null, on: false });
  const g = useRef<{ pid: number; x0: number; y0: number; p0: number; lock: "x" | "y" | null; k: number; s: { t: number; x: number }[] } | null>(null);

  /** lay the sleeves out at a (fractional) position, straight to the DOM */
  const show = (v: number) => {
    pos.current = v;
    const s = size.current;
    sleeves.current.forEach((el, k) => {
      if (!el) return;
      const p = place(k - v, s, reduced);
      el.style.transform = p.transform;
      el.style.zIndex = String(p.z);
      el.style.visibility = p.hidden ? "hidden" : "";
      el.style.setProperty("--shade", p.shade.toFixed(3));
    });
    const k = clamp(Math.round(v), 0, n - 1);
    if (k !== shown.current) {
      shown.current = k;
      setFocus(k);
      blip("tick");
    }
  };

  // measure the sleeve (it follows the column's width) and lay out before paint
  useLayoutEffect(() => {
    const el = stage.current;
    if (!el) return;
    const measure = () => {
      const first = sleeves.current[0];
      if (first) size.current = first.offsetWidth || size.current;
      show(pos.current);
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
    // show reads refs only; re-run when the set changes
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [n, reduced]);

  useEffect(
    () => () => {
      flight.current?.stop();
      if (wheel.current.t) clearTimeout(wheel.current.t);
    },
    []
  );

  const go = (k: number, velocity = 0, thrown = false) => {
    flight.current?.stop();
    const to = clamp(k, 0, n - 1);
    if (reduced) {
      show(to);
      return;
    }
    flight.current = animate(pos.current, to, { ...(thrown ? spring.flick : spring.default), velocity, onUpdate: show });
  };

  const open = (k: number) => {
    const a = artists[k];
    if (a?.url) window.open(a.url, "_blank", "noopener,noreferrer");
  };

  /** a step at a time from wherever it is heading */
  const step = (dir: 1 | -1) => go(Math.round(pos.current) + dir);

  // per sleeve of travel, the same px a sleeve moves when it steps aside, so a drag tracks 1:1
  const pass = () => size.current * 0.44;

  const onPointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    if (e.button !== 0) return;
    if (e.pointerType === "mouse") e.preventDefault();
    flight.current?.stop();
    const hit = (e.target as Element).closest<HTMLElement>("[data-k]");
    g.current = { pid: e.pointerId, x0: e.clientX, y0: e.clientY, p0: pos.current, lock: null, k: hit ? Number(hit.dataset.k) : -1, s: [{ t: e.timeStamp, x: e.clientX }] };
  };
  const onPointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    const d = g.current;
    if (!d || d.pid !== e.pointerId) return;
    const dx = e.clientX - d.x0;
    const dy = e.clientY - d.y0;
    if (!d.lock) {
      // a direction lock after 8 px: sideways is ours, up and down scroll the page
      if (Math.hypot(dx, dy) < 8) return;
      d.lock = Math.abs(dx) > Math.abs(dy) ? "x" : "y";
      if (d.lock === "x") e.currentTarget.setPointerCapture(e.pointerId);
    }
    if (d.lock !== "x") return;
    d.s.push({ t: e.timeStamp, x: e.clientX });
    while (d.s.length > 2 && e.timeStamp - d.s[0].t > 80) d.s.shift();
    // drag left to go on; past the ends it resists
    const P = pass();
    const raw = d.p0 - dx / P;
    const v = raw < 0 ? -rubberband(-raw * P, 90) / P : raw > n - 1 ? n - 1 + rubberband((raw - n + 1) * P, 90) / P : raw;
    show(v);
  };
  const onPointerUp = (e: React.PointerEvent<HTMLDivElement>) => {
    const d = g.current;
    if (!d || d.pid !== e.pointerId) return;
    g.current = null;
    if (!d.lock) {
      // a tap: the front sleeve opens, any other comes to the front
      if (d.k < 0) return;
      if (d.k === shown.current) open(d.k);
      else go(d.k);
      return;
    }
    if (d.lock !== "x") return;
    let vx = 0;
    const a = d.s[0];
    const b = d.s[d.s.length - 1];
    if (d.s.length > 1 && e.timeStamp - b.t < 60) vx = ((b.x - a.x) / Math.max(8, b.t - a.t)) * 1000;
    const P = pass();
    const to = Math.round(pos.current + project(-vx, 0.99) / P);
    go(to, -vx / P, Math.abs(vx) > 400);
  };
  const onPointerCancel = () => {
    if (!g.current) return;
    g.current = null;
    go(Math.round(pos.current));
  };

  // a sideways trackpad swipe moves it 1:1 and settles on the nearest sleeve when the fingers lift
  useEffect(() => {
    const el = stage.current;
    if (!el) return;
    const onWheel = (e: WheelEvent) => {
      if (Math.abs(e.deltaX) <= Math.abs(e.deltaY) || e.ctrlKey) return;
      e.preventDefault();
      flight.current?.stop();
      const P = size.current * 0.44;
      const raw = pos.current + e.deltaX / P;
      show(clamp(raw, -0.35, n - 1 + 0.35));
      const w = wheel.current;
      if (w.t) clearTimeout(w.t);
      w.t = setTimeout(() => go(Math.round(pos.current)), 110);
    };
    el.addEventListener("wheel", onWheel, { passive: false });
    return () => el.removeEventListener("wheel", onWheel);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [n, reduced]);

  const onKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
    const k = shown.current;
    const to =
      e.key === "ArrowRight" || e.key === "ArrowDown"
        ? k + 1
        : e.key === "ArrowLeft" || e.key === "ArrowUp"
          ? k - 1
          : e.key === "Home"
            ? 0
            : e.key === "End"
              ? n - 1
              : null;
    if (to != null) {
      e.preventDefault();
      go(to);
    } else if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      open(k);
    }
  };

  const front = artists[focus];

  return (
    <div className="app-now-crate" data-no-drag>
      <h3 className="app-now-label app-now-crate-title" id={`${id}-t`}>
        {labels.title}
      </h3>
      <div
        ref={stage}
        className="app-now-crate-bin"
        role="listbox"
        tabIndex={0}
        aria-labelledby={`${id}-t`}
        aria-describedby={`${id}-h`}
        aria-orientation="horizontal"
        aria-activedescendant={`${id}-${focus}`}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerCancel}
        onLostPointerCapture={onPointerCancel}
        onKeyDown={onKeyDown}
        onDragStart={(e) => e.preventDefault()}
      >
        {artists.map((a, k) => (
          <div
            key={a.name}
            ref={(el) => {
              sleeves.current[k] = el;
            }}
            id={`${id}-${k}`}
            role="option"
            aria-selected={k === focus}
            aria-label={`${k + 1}. ${a.name}`}
            className="app-now-crate-sleeve"
            data-k={k}
            data-front={k === focus || undefined}
          >
            <Art image={a.image} seed={`artist · ${a.name}`} n={12} className="app-now-crate-art" />
            <span className="app-now-crate-shade" aria-hidden />
            <span className="app-now-crate-rank" aria-hidden>
              <PixelLabel text={String(k + 1).padStart(2, "0")} cell={2} />
            </span>
          </div>
        ))}
        <span className="app-now-crate-ledge" aria-hidden />
      </div>

      <a
        className="app-now-crate-name"
        href={front?.url}
        target="_blank"
        rel="noopener noreferrer"
        aria-label={front ? labels.open.replace("{name}", front.name) : undefined}
      >
        {front?.name}
        <PixelGlyph cells={G_ARROW} size={8} />
      </a>

      {/* ‹ every cover, small (where you are, and a tap to jump) › */}
      <div className="app-now-crate-pager">
        <button type="button" className="app-now-crate-step" onClick={() => step(-1)} disabled={focus === 0} aria-label={labels.prev}>
          <PixelGlyph cells={G_CHEVRON} size={10} className="app-now-crate-prev" />
        </button>
        <div className="app-now-crate-strip" aria-hidden>
          {artists.map((a, k) => (
            <button
              key={a.name}
              type="button"
              tabIndex={-1}
              className="app-now-crate-thumb"
              data-on={k === focus || undefined}
              onClick={() => go(k)}
            >
              <Art image={a.image} seed={`artist · ${a.name}`} n={12} />
            </button>
          ))}
        </div>
        <button type="button" className="app-now-crate-step" onClick={() => step(1)} disabled={focus === n - 1} aria-label={labels.next}>
          <PixelGlyph cells={G_CHEVRON} size={10} className="app-now-crate-next" />
        </button>
      </div>

      <p id={`${id}-h`} className="sr-only">
        {labels.hint}
      </p>
    </div>
  );
});
