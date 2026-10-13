"use client";

import { useEffect, useRef } from "react";
import type { MotionValue } from "motion/react";
import { useArtPalette } from "@/hooks/useTheme";
import type { ArtPalette } from "@/lib/theme";
import { CELL, clamp, ease, pixelLoop } from "@/lib/pixel3d";
import { glyphFills, type IconId } from "@/components/os/icons";
import { introOver } from "../intro";
import { makeShards, type Shards as Scene } from "./scene";

/**
 * The app that can't be opened, in pieces (scene.ts): the Dock tile of
 * the page you most likely meant (the Desktop when there's no guess),
 * come apart into cubes. Drag right across it and they fly home and
 * light up; let go near the end and it snaps together and opens, short
 * of it and it drifts apart again. It arrives whole and breaks once; a
 * near-certain typo starts in pieces and builds itself while the alert
 * counts down. Pull the alert about and the loose pieces trail behind.
 *
 * Pointer only, so it's hidden from assistive tech: the alert's buttons
 * do the same thing.
 */

/** each tile's accent, as in the Dock (ICON_ACCENT) */
const ACCENT: Partial<Record<IconId, keyof ArtPalette>> = {
  home: "signal",
  work: "ion",
  writing: "ember",
  atlas: "lilac",
  now: "flare",
  contact: "signal",
};

/** whole after the boot, for a moment, before it breaks (s) */
const HOLD = 1.1;
const BREAK = 1.3;
const SNAP = 0.3;
/** let go past this and it finishes itself */
const LET_GO = 0.85;
/** a hover pulls the pieces in this far, as an invitation */
const TEMPT = 0.06;
/** how far the loose pieces may trail the alert (css px) */
const SWAY = 36;

const smooth = (k: number) => k * k * (3 - 2 * k);
const linearish = (k: number) => k * (0.6 + 0.4 * k);

type Anim = { from: number; to: number; t0: number; dur: number; curve: (k: number) => number; then?: () => void };
type Control = {
  scene: Scene;
  wake: () => void;
  auto: (ms: number | null) => void;
};

const seedOf = (s: string) => {
  let h = 404;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0;
  return h >>> 0;
};

export function Shards({
  icon,
  intro,
  auto,
  reduced,
  ox,
  oy,
  hint,
  onBroken,
  onDone,
}: {
  icon: IconId;
  /** arrives whole, then breaks once (else it starts in pieces) */
  intro: boolean;
  /** going there by itself: the countdown's length in ms, null when it isn't */
  auto: number | null;
  reduced: boolean;
  /** the alert's own movement (the loose pieces trail it) */
  ox: MotionValue<number>;
  oy: MotionValue<number>;
  hint: string;
  onBroken: () => void;
  /** it's whole: go where it leads */
  onDone: () => void;
}) {
  const P = useArtPalette();
  const hostRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const ctlRef = useRef<Control | null>(null);
  const cb = useRef({ onBroken, onDone, intro });
  useEffect(() => {
    cb.current = { onBroken, onDone, intro };
  });

  useEffect(() => {
    const host = hostRef.current;
    const canvas = canvasRef.current;
    if (!host || !canvas) return;
    const scene = makeShards(seedOf(icon));
    let anim: Anim | null = null;
    let drag: { id: number; x: number } | null = null;
    let done = false;
    /** clock time a countdown ends, -1 when none runs */
    let autoEnd = -1;
    let state = "";

    // the loose pieces hang off the alert on a soft spring
    const sheet = { x: ox.get(), y: oy.get() };
    const fol = { x: sheet.x, y: sheet.y, vx: 0, vy: 0 };

    const loop = pixelLoop({
      host,
      canvas,
      size: (w, h) => [Math.ceil(w / CELL), Math.ceil(h / CELL)],
      frame: (R, t, dt) => {
        if (anim) {
          const a = anim;
          const k = clamp((t - a.t0) / a.dur, 0, 1);
          scene.progress = a.from + (a.to - a.from) * a.curve(k);
          if (k >= 1) {
            anim = null;
            a.then?.();
          }
        }
        const h = Math.min(dt, 1 / 30);
        fol.vx += ((sheet.x - fol.x) * 90 - fol.vx * 14) * h;
        fol.vy += ((sheet.y - fol.y) * 90 - fol.vy * 14) * h;
        fol.x += fol.vx * h;
        fol.y += fol.vy * h;
        let swaying = Math.abs(fol.x - sheet.x) + Math.abs(fol.y - sheet.y) > 0.25 || Math.abs(fol.vx) + Math.abs(fol.vy) > 2;
        if (!swaying || scene.progress >= 1) {
          fol.x = sheet.x;
          fol.y = sheet.y;
          fol.vx = fol.vy = 0;
          swaying = false;
        }
        scene.setSway(clamp(fol.x - sheet.x, -SWAY, SWAY), clamp(fol.y - sheet.y, -SWAY, SWAY));
        scene.frame(R);

        const p = scene.progress;
        const next = anim || drag ? "moving" : p <= TEMPT + 0.001 ? "apart" : p >= 1 ? "whole" : "part";
        if (next !== state) host.dataset.state = state = next;
        return anim || swaying ? 0 : Infinity;
      },
    });

    const go = (to: number, dur: number, curve: (k: number) => number, then?: () => void) => {
      if (reduced || dur <= 0) {
        anim = null;
        scene.progress = to;
        then?.();
      } else anim = { from: scene.progress, to, t0: loop.clock(), dur, curve, then };
      loop.wake();
    };

    // whole as it arrives; it breaks once the boot is out of the way
    let timer = 0;
    const whole = cb.current.intro && !reduced;
    scene.progress = whole ? 1 : 0;
    const breakUp = () => {
      timer = window.setTimeout(() => {
        if (anim || drag || done || autoEnd >= 0) return;
        go(0, BREAK, ease, () => cb.current.onBroken());
      }, HOLD * 1000);
    };
    if (whole) {
      if (introOver()) breakUp();
      else window.addEventListener("em:intro-done", breakUp, { once: true });
    }

    const finish = () => {
      done = true;
      go(1, SNAP * (1.4 - scene.progress), ease, () => cb.current.onDone());
    };
    const settle = () => {
      if (done) return;
      const p = scene.progress;
      const left = autoEnd - loop.clock();
      if (p >= LET_GO) finish();
      else if (autoEnd >= 0 && left > 0) go(1, left, linearish);
      else if (p > 0) go(0, 0.45 + p * 0.7, smooth);
    };

    const down = (e: PointerEvent) => {
      if (e.button !== 0 || done) return;
      window.clearTimeout(timer);
      drag = { id: e.pointerId, x: e.clientX };
      anim = null;
    };
    const move = (e: PointerEvent) => {
      if (!drag || e.pointerId !== drag.id) {
        // a resting mouse over the pieces draws them in a touch
        if (e.pointerType === "mouse" && e.buttons === 0 && !anim && !done && scene.progress === 0 && autoEnd < 0) go(TEMPT, 0.35, ease);
        return;
      }
      const dx = e.clientX - drag.x;
      if (!dx) return;
      if (!host.hasPointerCapture(e.pointerId)) host.setPointerCapture(e.pointerId);
      drag.x = e.clientX;
      scene.progress += dx / (host.clientWidth * 0.8);
      loop.wake();
    };
    const up = (e: PointerEvent) => {
      if (!drag || e.pointerId !== drag.id) return;
      drag = null;
      settle();
    };
    const leave = (e: PointerEvent) => {
      if (!drag && !done && e.pointerType === "mouse" && autoEnd < 0 && scene.progress > 0 && scene.progress <= TEMPT + 0.001) go(0, 0.5, smooth);
    };
    host.addEventListener("pointerdown", down);
    host.addEventListener("pointermove", move);
    host.addEventListener("pointerup", up);
    host.addEventListener("pointercancel", up);
    host.addEventListener("pointerleave", leave);

    const pull = () => {
      sheet.x = ox.get();
      sheet.y = oy.get();
      if (scene.progress < 1) loop.wake();
    };
    const offX = ox.on("change", pull);
    const offY = oy.on("change", pull);

    ctlRef.current = {
      scene,
      wake: loop.wake,
      // a countdown builds it in its own time; Stay lets it drift apart again
      auto(ms) {
        if (done) return;
        if (ms != null) {
          window.clearTimeout(timer);
          autoEnd = loop.clock() + ms / 1000;
          if (!drag) go(1, ms / 1000, linearish);
        } else if (autoEnd >= 0) {
          autoEnd = -1;
          if (!drag) go(0, 0.9, smooth);
        }
      },
    };

    return () => {
      window.clearTimeout(timer);
      window.removeEventListener("em:intro-done", breakUp);
      host.removeEventListener("pointerdown", down);
      host.removeEventListener("pointermove", move);
      host.removeEventListener("pointerup", up);
      host.removeEventListener("pointercancel", up);
      host.removeEventListener("pointerleave", leave);
      offX();
      offY();
      loop.dispose();
      ctlRef.current = null;
    };
  }, [icon, reduced, ox, oy]);

  // the drawing and its colours, from the live theme; the effects below run again when the scene is remade
  useEffect(() => {
    const c = ctlRef.current;
    if (!c) return;
    c.scene.setIcon({
      fills: glyphFills(icon),
      pal: P as unknown as Record<string, string>,
      accent: P[ACCENT[icon] ?? "signal"],
    });
    c.wake();
  }, [icon, P, reduced, ox, oy]);

  useEffect(() => {
    ctlRef.current?.auto(auto);
  }, [auto, icon, reduced, ox, oy]);

  return (
    <div ref={hostRef} className="app-nf-shards" data-no-drag aria-hidden>
      <canvas ref={canvasRef} className="app-nf-shards-canvas" />
      <span className="app-nf-shards-hint">{hint}</span>
    </div>
  );
}
