"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useI18n } from "@/i18n/client";
import { useFinePointer, useReduced } from "@/hooks/env";
import { DesktopIcons } from "./DesktopIcons";
import { Hello } from "./Hello";
import { useTerminal } from "@/components/os/Terminal";
import { termQueue } from "@/components/os/terminal/queue";
import { ClockWidget } from "./Sundial";
import { SunHandle } from "./SunHandle";
import { PushWidget } from "./BrickWall";
import { LatestPostWidget } from "./Kiosk";
import { type DesktopIconId } from "./icons";
import { INTERACTIVE, intersects, type Rect } from "./physics";
import { isPhone } from "./layout";

type Marquee = {
  pid: number;
  sx: number;
  sy: number;
  moved: boolean;
  additive: boolean;
  base: Set<DesktopIconId>;
};

/**
 * `/`: one screen, nothing scrolls. On a desk, the intro sits top left,
 * the widgets top right beside the app icons, which line the right edge
 * on a snap grid; drag on empty desktop for a marquee. Phones get a home
 * screen that fits above the tab bar. (The name plays in the boot.)
 */
export function DesktopScene() {
  const { t } = useI18n();
  const term = useTerminal();
  const reduced = useReduced();
  const fine = useFinePointer();
  const sceneRef = useRef<HTMLElement>(null);
  const widgetsRef = useRef<HTMLDivElement>(null);
  const helloSlotRef = useRef<HTMLDivElement>(null);
  const marqueeRef = useRef<HTMLDivElement>(null);
  const mq = useRef<Marquee | null>(null);
  const suppressClick = useRef(false);
  const [selected, setSelectedState] = useState<Set<DesktopIconId>>(() => new Set());

  const setSelected = useCallback((next: Set<DesktopIconId>) => {
    setSelectedState((prev) => {
      if (prev.size === next.size && [...next].every((i) => prev.has(i))) return prev;
      return next;
    });
  }, []);

  // the home screen doesn't bounce (desktop.css: html[data-home])
  useEffect(() => {
    const root = document.documentElement;
    root.dataset.home = "";
    return () => {
      delete root.dataset.home;
    };
  }, []);

  /* ── when the lock screen lifts (first visit this session), the desk
     rises into place under it and the icons pop in, top to bottom ── */
  useEffect(() => {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const intro = document.querySelector(".em-intro");
    if (!intro || !intro.getClientRects().length) return;
    const play = () => {
      const scene = sceneRef.current;
      if (!scene) return;
      const ease = "linear(0, 0.157 4.6%, 0.452 11%, 0.703 18.2%, 0.86 25.2%, 0.946 32.3%, 0.985 40%, 0.998 50%, 1)";
      const desk = Array.from(scene.querySelectorAll<HTMLElement>(".app-home-hello-slot, .app-home-widget")).filter(
        (el) => el.getClientRects().length
      );
      desk.forEach((el, i) =>
        el.animate([{ opacity: 0, transform: "translateY(28px) scale(0.98)" }, { opacity: 1, transform: "none" }], {
          duration: 900,
          delay: 40 + i * 60,
          easing: ease,
          fill: "backwards",
        })
      );
      scene.querySelectorAll<HTMLElement>(".app-home-icon").forEach((el, i) =>
        el.animate([{ opacity: 0, scale: "0.6" }, { opacity: 1, scale: "1" }], {
          duration: 650,
          delay: 200 + i * 45,
          easing: ease,
          fill: "backwards",
        })
      );
    };
    window.addEventListener("em:intro-done", play, { once: true });
    return () => window.removeEventListener("em:intro-done", play);
  }, []);

  /* ── icons never land on the widgets or hello.txt ── */
  const blockers = useCallback((): Rect[] => {
    const scene = sceneRef.current;
    if (!scene) return [];
    const s = scene.getBoundingClientRect();
    const out: Rect[] = [];
    for (const el of [widgetsRef.current, helloSlotRef.current]) {
      if (!el || !el.getClientRects().length) continue;
      const r = el.getBoundingClientRect();
      if (r.width === 0) continue;
      out.push({ left: r.left - s.left - 8, top: r.top - s.top - 8, right: r.right - s.left + 8, bottom: r.bottom - s.top + 8 });
    }
    return out;
  }, []);

  /* ── the README icon: the terminal opens on cat README.md ── */
  const onReadme = () => {
    termQueue.push(`cat ${t.system.term.cat.readme}`);
    term.setOpen(true);
  };

  /* ── marquee selection on empty desktop ── */
  const iconRects = () =>
    Array.from(sceneRef.current?.querySelectorAll<HTMLElement>("[data-desktop-icon]") ?? []).map((el) => ({
      id: el.dataset.desktopIcon as DesktopIconId,
      r: (el.querySelector(".app-home-icon-tile") ?? el).getBoundingClientRect(),
      l: el.querySelector(".app-home-icon-label")?.getBoundingClientRect(),
    }));

  const onPointerDown = (e: React.PointerEvent<HTMLElement>) => {
    if (e.pointerType === "touch" || e.button !== 0) return;
    const target = e.target as Element;
    if (target.closest(`${INTERACTIVE},.app-home-icon,.app-home-hello,.app-home-widgets`)) return;
    if (isPhone()) return;
    const additive = e.shiftKey || e.metaKey || e.ctrlKey;
    mq.current = { pid: e.pointerId, sx: e.clientX, sy: e.clientY, moved: false, additive, base: additive ? new Set(selected) : new Set() };
  };

  const onPointerMove = (e: React.PointerEvent<HTMLElement>) => {
    const g = mq.current;
    const scene = sceneRef.current;
    const box = marqueeRef.current;
    if (!g || g.pid !== e.pointerId || !scene || !box) return;
    if (!g.moved) {
      if (Math.hypot(e.clientX - g.sx, e.clientY - g.sy) < 4) return;
      g.moved = true;
      scene.setPointerCapture(e.pointerId);
      box.dataset.on = "";
      // no text selection while sweeping
      window.getSelection()?.removeAllRanges();
    }
    const s = scene.getBoundingClientRect();
    const sel: Rect = {
      left: Math.min(g.sx, e.clientX),
      top: Math.min(g.sy, e.clientY),
      right: Math.max(g.sx, e.clientX),
      bottom: Math.max(g.sy, e.clientY),
    };
    box.style.transform = `translate3d(${sel.left - s.left}px, ${sel.top - s.top}px, 0)`;
    box.style.width = `${sel.right - sel.left}px`;
    box.style.height = `${sel.bottom - sel.top}px`;
    const next = new Set(g.base);
    for (const { id, r, l } of iconRects()) {
      const hit = intersects(sel, r) || (l ? intersects(sel, l) : false);
      if (!hit) continue;
      if (g.additive && g.base.has(id)) next.delete(id);
      else next.add(id);
    }
    setSelected(next);
  };

  const onPointerUp = (e: React.PointerEvent<HTMLElement>) => {
    const g = mq.current;
    if (!g || g.pid !== e.pointerId) return;
    mq.current = null;
    if (marqueeRef.current) delete marqueeRef.current.dataset.on;
    if (g.moved) {
      // the sweep ends on whatever is under the hand: don't let it click
      suppressClick.current = true;
      window.setTimeout(() => (suppressClick.current = false), 0);
      return;
    }
    if (!g.additive) setSelected(new Set());
  };

  return (
    <section
      ref={sceneRef}
      aria-label={t.home.desktop}
      className="app-home-scene"
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={onPointerUp}
      onClickCapture={(e) => {
        if (suppressClick.current) {
          e.preventDefault();
          e.stopPropagation();
        }
      }}
    >
      <h1 className="sr-only">{t.home.name}</h1>

      {/* the wallpaper's sun, held with a mouse or trackpad (the sundial is the handle on touch) */}
      {fine && <SunHandle />}

      <div ref={helloSlotRef} className="app-home-hello-slot">
        <Hello />
      </div>

      <div ref={widgetsRef} className="app-home-widgets" role="group" aria-label={t.home.widgets.label}>
        <ClockWidget />
        <LatestPostWidget />
        <PushWidget />
      </div>

      <DesktopIcons
        sceneRef={sceneRef}
        selected={selected}
        setSelected={setSelected}
        blockers={blockers}
        onReadme={onReadme}
        reduced={reduced}
        fine={fine}
      />

      <div ref={marqueeRef} className="app-home-marquee" aria-hidden />
      {/* a sweep or ⌘A selects several icons at once: say how many */}
      <p className="sr-only" aria-live="polite">
        {selected.size > 1 ? t.home.icons.selected.replace("{n}", String(selected.size)) : ""}
      </p>
    </section>
  );
}
