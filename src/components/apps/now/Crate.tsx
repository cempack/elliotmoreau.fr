"use client";

import { animate, type AnimationPlaybackControls } from "motion/react";
import { memo, useEffect, useId, useRef, useState } from "react";
import { PixelLabel } from "@/components/PixelLabel";
import { useReduced } from "@/hooks/env";
import { clamp, project, rubberband, spring } from "@/lib/motion";
import { useSound } from "@/lib/sound";
import { Art } from "./bits";

/**
 * Elliot's top artists as sleeves standing in a small wooden crate, front
 * to back by rank, seen a little from above: the one in front shows its
 * face, the ones behind only their spines, each with its rank in pixel
 * digits. Ranks only: Spotify gives an order, not play counts.
 *
 * Flick through sideways (vertical stays the page's scroll): each sleeve
 * you pass tips forward onto the front wall in one stepped turn, and the
 * one now in front lifts a little and gives its name. On release the
 * throw is projected and lands on the nearest sleeve. A tap on the front
 * sleeve opens the artist; a tap on another brings it to the front. On a
 * keyboard it is a listbox: arrows, Home and End, Enter opens.
 */

type Artist = { name: string; image: string; url: string };

/** px of sideways drag per sleeve */
const PASS = 34;

export const Crate = memo(function Crate({ artists, labels }: { artists: Artist[]; labels: { title: string; hint: string } }) {
  const n = artists.length;
  const id = useId();
  const reduced = useReduced();
  const { blip } = useSound();
  const [focus, setFocus] = useState(0);
  const bin = useRef<HTMLDivElement>(null);
  const pos = useRef(0);
  const shown = useRef(0);
  const flight = useRef<AnimationPlaybackControls | null>(null);
  const g = useRef<{ pid: number; x0: number; y0: number; p0: number; lock: "x" | "y" | null; k: number; s: { t: number; x: number }[] } | null>(null);

  useEffect(() => () => flight.current?.stop(), []);

  /** draw the crate at a (fractional) position: the sleeve in front, and a lean past the ends */
  const show = (v: number) => {
    pos.current = v;
    const k = clamp(Math.round(v), 0, n - 1);
    if (k !== shown.current) {
      shown.current = k;
      setFocus(k);
      blip("tick");
    }
    const over = v < 0 ? v : v > n - 1 ? v - (n - 1) : 0;
    bin.current?.style.setProperty("--pull", `${(-over * PASS).toFixed(1)}px`);
  };

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
      // a direction lock after 10 px: sideways is ours, up and down scroll the page
      if (Math.hypot(dx, dy) < 10) return;
      d.lock = Math.abs(dx) > Math.abs(dy) ? "x" : "y";
      if (d.lock === "x") e.currentTarget.setPointerCapture(e.pointerId);
    }
    if (d.lock !== "x") return;
    d.s.push({ t: e.timeStamp, x: e.clientX });
    while (d.s.length > 2 && e.timeStamp - d.s[0].t > 80) d.s.shift();
    // drag left to flip forward; past the ends it resists
    const raw = d.p0 - dx / PASS;
    const v = raw < 0 ? -rubberband(-raw * PASS, 90) / PASS : raw > n - 1 ? n - 1 + rubberband((raw - n + 1) * PASS, 90) / PASS : raw;
    show(v);
  };
  const onPointerUp = (e: React.PointerEvent<HTMLDivElement>) => {
    const d = g.current;
    if (!d || d.pid !== e.pointerId) return;
    g.current = null;
    if (!d.lock) {
      bin.current?.focus({ preventScroll: true });
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
    const v = -vx / PASS;
    const to = Math.round(pos.current + project(-vx, 0.99) / PASS);
    go(to, v, Math.abs(vx) > 400);
  };
  const onPointerCancel = () => {
    if (!g.current) return;
    g.current = null;
    go(Math.round(pos.current));
  };

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
        ref={bin}
        className="app-now-crate-bin"
        role="listbox"
        tabIndex={0}
        aria-labelledby={`${id}-t`}
        aria-describedby={`${id}-h`}
        aria-orientation="horizontal"
        aria-activedescendant={`${id}-${focus}`}
        style={{ "--n": n } as React.CSSProperties}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerCancel}
        onLostPointerCapture={onPointerCancel}
        onKeyDown={onKeyDown}
        onDragStart={(e) => e.preventDefault()}
      >
        <span className="app-now-crate-side" aria-hidden />
        {artists.map((a, k) => (
          <div
            key={a.name}
            id={`${id}-${k}`}
            role="option"
            aria-selected={k === focus}
            aria-label={`${k + 1}. ${a.name}`}
            className="app-now-crate-sleeve"
            data-k={k}
            data-state={k < focus ? "tipped" : k === focus ? "front" : "back"}
            style={{ "--k": k, zIndex: k < focus ? 30 + k : 20 - k } as React.CSSProperties}
          >
            <span className="app-now-crate-face">
              <Art image={a.image} seed={`artist · ${a.name}`} n={12} />
            </span>
            <span className="app-now-crate-spine" data-first={k === 0 || undefined}>
              <PixelLabel text={String(k + 1)} cell={1} />
            </span>
          </div>
        ))}
        <span className="app-now-crate-front" aria-hidden />
      </div>
      <p className="app-now-crate-caption" aria-hidden>
        <span className="app-now-crate-rank tabular">{String(focus + 1).padStart(2, "0")}</span>
        <span className="app-now-crate-name">{front?.name}</span>
      </p>
      <p id={`${id}-h`} className="sr-only">
        {labels.hint}
      </p>
    </div>
  );
});
