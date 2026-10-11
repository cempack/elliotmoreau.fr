"use client";

import { useEffect, useRef, useState } from "react";
import { animate, m, useDragControls, useMotionValue } from "motion/react";
import { useI18n } from "@/i18n/client";
import { usePathname } from "next/navigation";
import { useReduced } from "@/hooks/env";
import { lenisRef } from "@/lib/lenisRef";
import { clamp, project, rubberband, spring, springFrom } from "@/lib/motion";
import { appForPath } from "../apps";
import { WinIcon } from "../window/WinIcon";
import { menubarBottom } from "../window/dock";
// the traffic lights are the app windows' own (one OS, one set of lights)
import "../window.css";
import { useTerminal, useTerminalWindow, type WinRect } from "../Terminal";
import { cwdLabel } from "./commands";

/**
 * The Terminal's two bodies.
 * Desktop: a free glass window. It grows out of the dock's Terminal icon
 * and shrinks back into it (scale around the icon's point), drags by its
 * title bar with 1:1 tracking, rubber-bands past the screen edges and, on
 * release, projects its momentum to a resting place inside the viewport
 * (bouncing only when it was actually thrown). Zoom toggles a large frame.
 * Phone: a bottom sheet (70svh) that rides above the on-screen keyboard
 * and swipes down to dismiss.
 */

const EDGE = 10;
/** room kept for the dock under a resting window */
const DOCK_ROOM = 100;

const vw = () => window.innerWidth;
const vh = () => window.innerHeight;

/** The dock's Terminal icon centre (or where it usually sits). */
function dockPoint() {
  const box = document.querySelector<HTMLElement>('[data-dock-launch="terminal"]')?.getBoundingClientRect();
  return box && box.width
    ? { x: box.left + box.width / 2, y: box.top + box.height / 2 }
    : { x: vw() / 2 + 180, y: vh() - 40 };
}

/**
 * First placement: centred over the dock's Terminal icon, resting in the
 * free band between menu bar and dock, a touch low, nearer its icon.
 */
function defaultRect(): WinRect {
  const w = Math.min(720, vw() - 48);
  const h = Math.min(468, Math.max(280, vh() - menubarBottom() - DOCK_ROOM - 40));
  const top = menubarBottom() + 14;
  const bottom = vh() - DOCK_ROOM - 12 - h;
  return {
    w,
    h,
    x: clamp(dockPoint().x - w * 0.56, 24, vw() - w - 24),
    y: Math.max(top, top + (bottom - top) * 0.55),
  };
}

function zoomRect(): WinRect {
  return { x: 16, y: menubarBottom() + 12, w: vw() - 32, h: Math.max(280, vh() - menubarBottom() - 12 - DOCK_ROOM) };
}

function bounds(w: number, h: number) {
  return {
    minX: EDGE,
    maxX: Math.max(EDGE, vw() - w - EDGE),
    minY: menubarBottom() + 6,
    maxY: Math.max(menubarBottom() + 6, vh() - h - EDGE),
  };
}

function fit(r: WinRect): WinRect {
  const w = Math.min(r.w, vw() - 2 * EDGE);
  const h = Math.min(r.h, vh() - menubarBottom() - 6 - EDGE);
  const b = bounds(w, h);
  return { w, h, x: clamp(r.x, b.minX, b.maxX), y: clamp(r.y, b.minY, b.maxY) };
}

/** Past an edge, the window resists more the further it goes. */
const BAND = 160;
function band(v: number, min: number, max: number) {
  if (v < min) return min - rubberband(min - v, BAND);
  if (v > max) return max + rubberband(v - max, BAND);
  return v;
}

/**
 * Release velocity from the last ~90ms of pointer samples, so a flick
 * reads as a flick and a pause before letting go reads as a set-down.
 */
type Sample = { t: number; x: number; y: number };
function releaseVelocity(samples: Sample[]) {
  const last = samples[samples.length - 1];
  if (!last || performance.now() - last.t > 90) return { vx: 0, vy: 0 };
  const first = samples.find((s) => last.t - s.t <= 90) ?? last;
  const dt = (last.t - first.t) / 1000;
  if (dt < 0.008) return { vx: 0, vy: 0 };
  return { vx: (last.x - first.x) / dt, vy: (last.y - first.y) / dt };
}

/** The dock's Terminal icon, as a transform-origin inside the window. */
function dockOrigin(r: WinRect) {
  const p = dockPoint();
  return `${(((p.x - r.x) / r.w) * 100).toFixed(1)}% ${(((p.y - r.y) / r.h) * 100).toFixed(1)}%`;
}

export function DesktopWindow({
  shaking,
  children,
}: {
  shaking: boolean;
  children: React.ReactNode;
}) {
  const { t } = useI18n();
  const cwd = cwdLabel(appForPath(usePathname()));
  const { setOpen } = useTerminal();
  const { rect: saved, setRect: save } = useTerminalWindow();
  const reduced = useReduced();

  const [init] = useState(() => fit(saved ?? defaultRect()));
  const x = useMotionValue(init.x);
  const y = useMotionValue(init.y);
  const w = useMotionValue(init.w);
  const h = useMotionValue(init.h);
  const [origin, setOrigin] = useState(() => dockOrigin(init));
  const [zoomed, setZoomed] = useState(false);
  const normal = useRef<WinRect>(init);
  const grab = useRef<{ id: number; px: number; py: number; ox: number; oy: number; samples: Sample[] } | null>(null);
  const [dragging, setDragging] = useState(false);

  const current = (): WinRect => ({ x: x.get(), y: y.get(), w: w.get(), h: h.get() });
  const settle = (r: WinRect) => {
    save(r);
    setOrigin(dockOrigin(r));
  };

  // keep the window on screen when the viewport changes
  useEffect(() => {
    const onResize = () => {
      const r = fit(zoomed ? zoomRect() : current());
      x.set(r.x);
      y.set(r.y);
      w.set(r.w);
      h.set(r.h);
      settle(r);
    };
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  });

  const onPointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    if (e.button !== 0 || (e.target as HTMLElement).closest("button")) return;
    e.currentTarget.setPointerCapture(e.pointerId);
    x.stop();
    y.stop();
    grab.current = {
      id: e.pointerId,
      px: e.clientX,
      py: e.clientY,
      ox: x.get(),
      oy: y.get(),
      samples: [{ t: performance.now(), x: e.clientX, y: e.clientY }],
    };
    setDragging(true);
  };

  const onPointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    const g = grab.current;
    if (!g || g.id !== e.pointerId) return;
    const b = bounds(w.get(), h.get());
    x.set(band(g.ox + e.clientX - g.px, b.minX, b.maxX));
    y.set(band(g.oy + e.clientY - g.py, b.minY, b.maxY));
    g.samples.push({ t: performance.now(), x: e.clientX, y: e.clientY });
    if (g.samples.length > 12) g.samples.shift();
  };

  const onPointerUp = (e: React.PointerEvent<HTMLDivElement>) => {
    const g = grab.current;
    if (!g || g.id !== e.pointerId) return;
    grab.current = null;
    setDragging(false);
    const b = bounds(w.get(), h.get());
    const { vx, vy } = releaseVelocity(g.samples);
    const tx = clamp(x.get() + project(vx, 0.996), b.minX, b.maxX);
    const ty = clamp(y.get() + project(vy, 0.996), b.minY, b.maxY);
    const r = { ...current(), x: tx, y: ty };
    if (!zoomed) normal.current = r;
    settle(r);
    if (reduced) {
      x.set(tx);
      y.set(ty);
      return;
    }
    const thrown = Math.hypot(vx, vy) > 700;
    const tr = thrown ? spring.flick : spring.default;
    animate(x, tx, { ...tr, velocity: vx });
    animate(y, ty, { ...tr, velocity: vy });
  };

  const toggleZoom = () => {
    const to = fit(zoomed ? normal.current : zoomRect());
    if (!zoomed) normal.current = current();
    setZoomed(!zoomed);
    settle(to);
    const tr = reduced ? { duration: 0 } : spring.default;
    animate(x, to.x, tr);
    animate(y, to.y, tr);
    animate(w, to.w, tr);
    animate(h, to.h, tr);
  };

  const hidden = reduced ? { opacity: 0 } : { opacity: 0, scale: 0.18 };
  const close = () => setOpen(false);

  return (
    <m.div className="os-term-pos" style={{ x, y }}>
      <m.div
        className="os-term-anim"
        style={{ transformOrigin: origin }}
        initial={hidden}
        animate={{ opacity: 1, scale: 1 }}
        exit={{
          ...hidden,
          // going home: hold the glass while it shrinks, fade as it lands
          transition: {
            scale: springFrom(0.36),
            opacity: { duration: 0.22, ease: [0.64, 0, 0.78, 0], delay: 0.08 },
          },
        }}
        transition={{
          scale: springFrom(0.42),
          opacity: { duration: 0.18, ease: [0.22, 1, 0.36, 1] },
        }}
      >
        <div className={`os-term-shake ${shaking ? "is-shaking" : ""}`}>
          <m.div
            className={`os-term os-term-win ${dragging ? "is-dragging" : ""}`}
           
            role="dialog"
            tabIndex={-1}
            aria-label={t.system.term.dialog}
            style={{ width: w, height: h }}
            // focus in the terminal dims the app window's lights (an attribute, not an html:has rule)
            onFocus={() => (document.documentElement.dataset.termFocus = "")}
            onBlur={(e) => {
              if (!e.currentTarget.contains(e.relatedTarget as Node | null)) delete document.documentElement.dataset.termFocus;
            }}
            onKeyDown={(e) => {
              if (e.key === "Escape") {
                e.stopPropagation();
                close();
              }
            }}
          >
            <div className="os-term-glass" aria-hidden />
            <div
              className="os-term-titlebar"
              onPointerDown={onPointerDown}
              onPointerMove={onPointerMove}
              onPointerUp={onPointerUp}
              onPointerCancel={onPointerUp}
              onDoubleClick={(e) => {
                if (!(e.target as HTMLElement).closest("button")) toggleZoom();
              }}
            >
              <div className="os-win-lights os-term-lights">
                <button
                  type="button"
                  className="os-win-light"
                  aria-label={t.system.term.minimize}
                  onClick={close}
                >
                  <WinIcon kind="min" />
                </button>
                <button
                  type="button"
                  className="os-win-light os-win-light--zoom"
                  aria-label={t.system.term.zoom}
                  aria-pressed={zoomed}
                  onClick={toggleZoom}
                >
                  <WinIcon kind={zoomed ? "unmax" : "max"} />
                </button>
                <button
                  type="button"
                  className="os-win-light os-win-light--close"
                  aria-label={t.system.term.close}
                  onClick={close}
                >
                  <WinIcon kind="close" />
                </button>
              </div>
              <p className="os-term-title">
                <span className="os-term-title-glyph" aria-hidden />
                elliot@emos<span className="os-term-title-sep">:</span>{cwd}
              </p>
            </div>
            {children}
          </m.div>
        </div>
      </m.div>
    </m.div>
  );
}

export function MobileSheet({ shaking, children }: { shaking: boolean; children: React.ReactNode }) {
  const { t } = useI18n();
  const { setOpen } = useTerminal();
  const reduced = useReduced();
  const controls = useDragControls();
  const sheet = useRef<HTMLDivElement>(null);
  const close = () => setOpen(false);

  // ride above the on-screen keyboard (visualViewport shrinks, the layout
  // viewport doesn't), and hold the page still underneath
  useEffect(() => {
    const el = sheet.current;
    const vv = window.visualViewport;
    lenisRef.current?.stop();
    const update = () => {
      if (!el || !vv) return;
      const kb = Math.max(0, window.innerHeight - vv.height - vv.offsetTop);
      el.style.setProperty("--os-term-kb", `${Math.round(kb)}px`);
    };
    update();
    vv?.addEventListener("resize", update);
    vv?.addEventListener("scroll", update);
    return () => {
      vv?.removeEventListener("resize", update);
      vv?.removeEventListener("scroll", update);
      lenisRef.current?.start();
    };
  }, []);

  return (
    <div className="os-term-sheetwrap">
      <m.div
        className="os-term-scrim"
        aria-hidden
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        transition={{ duration: 0.25 }}
        onClick={close}
      />
      <m.div
        ref={sheet}
        tabIndex={-1}
        className={`os-term os-term-sheet ${shaking ? "is-shaking" : ""}`}
       
        role="dialog"
        aria-label={t.system.term.dialog}
        initial={reduced ? { opacity: 0 } : { y: "100%" }}
        animate={reduced ? { opacity: 1 } : { y: 0 }}
        exit={reduced ? { opacity: 0 } : { y: "100%" }}
        transition={spring.default}
        drag={reduced ? false : "y"}
        dragListener={false}
        dragControls={controls}
        dragConstraints={{ top: 0, bottom: 0 }}
        dragElastic={{ top: 0.04, bottom: 0.7 }}
        onDragEnd={(_e, info) => {
          if (info.offset.y > 120 || info.velocity.y > 600) close();
        }}
        onKeyDown={(e) => {
          if (e.key === "Escape") {
            e.stopPropagation();
            close();
          }
        }}
      >
        <div className="os-term-glass" aria-hidden />
        <div className="os-term-sheethead" onPointerDown={(e) => controls.start(e)}>
          <span className="os-term-grabber" aria-hidden />
          <p className="os-term-title">
            <span className="os-term-title-glyph" aria-hidden />
            {t.system.term.title}
          </p>
          <button type="button" className="os-term-done" aria-label={t.system.term.close} onClick={close}>
            <WinIcon kind="close" />
          </button>
        </div>
        {children}
      </m.div>
    </div>
  );
}
