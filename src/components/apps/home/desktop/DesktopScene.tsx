"use client";

import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { m, useScroll, useTransform } from "motion/react";
import { useI18n } from "@/i18n/client";
import { useFinePointer, useReduced } from "@/hooks/env";
import { lenisRef } from "@/lib/lenisRef";
import { useSound } from "@/lib/sound";
import { HeroNameFx } from "@/components/HeroNameFx";
import { DesktopIcons } from "./DesktopIcons";
import { HelloWindow, type HelloHandle } from "./HelloWindow";
import { ClockWidget, MusicWidget, PushWidget } from "./Widgets";
import { DESKTOP_ICONS, type DesktopIconId } from "./icons";
import { desktopMemory } from "./store";
import { INTERACTIVE, intersects, type Rect } from "./physics";

/* The wordmark's stage box. HeroNameFx sizes its pixel field from its box
   (8 CSS px cells up to 150 × 80), so a fixed box keeps the letters at a
   whole-cell scale with square cells, and a transform scales the result
   to the screen: s = 3 on desktop, s = 2 on phones. FIT is the wordmark's
   own footprint inside the box, which is what has to fit. */
const BOX = { desk: { w: 1040, h: 448, fitW: 1040, fitH: 380 }, phone: { w: 700, h: 296, fitW: 700, fitH: 250 } };

type Marquee = {
  pid: number;
  sx: number;
  sy: number;
  moved: boolean;
  additive: boolean;
  base: Set<DesktopIconId>;
};

/**
 * The first screen of `/`: a desktop directed like a film still. The pixel
 * wordmark is the hero; hello.txt and two Sonoma-style widgets sit on the
 * desk below it; the app icons line the right edge on a snap grid. Drag on
 * empty desktop for a marquee selection. Phones get an iOS home screen.
 */
export function DesktopScene() {
  const { t } = useI18n();
  const reduced = useReduced();
  const fine = useFinePointer();
  const { blip } = useSound();
  const sceneRef = useRef<HTMLElement>(null);
  const stageRef = useRef<HTMLDivElement>(null);
  const heroRef = useRef<HTMLDivElement>(null);
  const widgetsRef = useRef<HTMLDivElement>(null);
  const helloSlotRef = useRef<HTMLDivElement>(null);
  const marqueeRef = useRef<HTMLDivElement>(null);
  const helloRef = useRef<HelloHandle>(null);
  const mq = useRef<Marquee | null>(null);
  const suppressClick = useRef(false);
  const [selected, setSelectedState] = useState<Set<DesktopIconId>>(() => new Set());
  const [helloClosed, setHelloClosed] = useState(() => desktopMemory.helloClosed());

  const setSelected = useCallback((next: Set<DesktopIconId>) => {
    setSelectedState((prev) => {
      if (prev.size === next.size && [...next].every((i) => prev.has(i))) return prev;
      return next;
    });
  }, []);

  /* ── the wordmark's scale: as big as the stage allows ── */
  useLayoutEffect(() => {
    const scene = sceneRef.current;
    const stage = stageRef.current;
    if (!scene || !stage) return;
    const fit = () => {
      const phone = !window.matchMedia("(min-width: 768px)").matches;
      const b = phone ? BOX.phone : BOX.desk;
      const cs = getComputedStyle(scene);
      const num = (k: string, d: number) => {
        const v = parseFloat(cs.getPropertyValue(k));
        return Number.isFinite(v) ? v : d;
      };
      const sw = stage.clientWidth;
      let k: number;
      if (phone) {
        k = sw / b.fitW;
      } else {
        // keep clear of the icon column on the right, symmetrically, so
        // the name stays centred on the screen
        const cw = num("--app-home-cell-w", 96);
        const ch = num("--app-home-cell-h", 100);
        const top = num("--app-home-grid-t", 60);
        const bottom = num("--app-home-grid-b", 96);
        const reserve = num("--app-home-grid-reserve", 132);
        const right = num("--app-home-grid-r", 16);
        const pad = num("--app-home-pad", 32);
        const flowRows = Math.max(1, Math.floor((scene.clientHeight - top - bottom - reserve) / ch));
        const flowCols = Math.ceil(DESKTOP_ICONS.length / flowRows);
        const rail = Math.max(0, right + flowCols * cw + 16 - pad);
        const availW = sw - 2 * rail;
        k = Math.min(availW / b.fitW, stage.clientHeight / b.fitH);
      }
      k = Math.max(0.3, Math.min(k, phone ? 1 : 1.32));
      scene.style.setProperty("--app-home-k", k.toFixed(4));
    };
    fit();
    const ro = new ResizeObserver(fit);
    ro.observe(stage);
    ro.observe(scene);
    return () => ro.disconnect();
  }, []);

  /* HeroNameFx reads its replay hint from the legacy dictionary, which has
     no provider here: give its tooltip the real words */
  useEffect(() => {
    const el = heroRef.current?.querySelector<HTMLElement>("[title]");
    if (el && /^hero\./.test(el.title)) el.title = t.home.hero.replay;
  }, [t]);

  /* ── icons may not land on the widgets or hello.txt ── */
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

  /* ── hello.txt ⇄ README ── */
  const readmeCenter = () => {
    const el = sceneRef.current?.querySelector<HTMLElement>('[data-desktop-icon="readme"] .app-home-icon-tile');
    if (!el) return { x: window.innerWidth - 60, y: 120 };
    const r = el.getBoundingClientRect();
    return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
  };

  const closeHello = async () => {
    const win = helloRef.current;
    if (!win) return;
    const hadFocus = !!sceneRef.current?.querySelector(".app-home-hello")?.contains(document.activeElement);
    await win.close(readmeCenter());
    desktopMemory.setHelloClosed(true);
    setHelloClosed(true);
    if (hadFocus) sceneRef.current?.querySelector<HTMLElement>('[data-desktop-icon="readme"]')?.focus();
  };

  const onReadme = () => {
    const win = helloRef.current;
    if (!win) return;
    if (helloClosed) {
      win.open(readmeCenter());
      desktopMemory.setHelloClosed(false);
      setHelloClosed(false);
      blip("open");
      requestAnimationFrame(() => helloRef.current?.focus());
    } else {
      win.nudge();
      win.focus();
    }
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
    if (target.closest(`${INTERACTIVE},.app-home-icon,.app-home-hello,.app-home-widget`)) return;
    if (!window.matchMedia("(min-width: 768px)").matches) return;
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

  /* ── leaving: the desk drifts up a touch faster than the name recedes ── */
  const { scrollY } = useScroll();
  const deskY = useTransform(scrollY, [0, 900], [0, -90], { clamp: true });
  const heroY = useTransform(scrollY, [0, 900], [0, 140], { clamp: true });
  const heroS = useTransform(scrollY, [0, 900], [1, 0.9], { clamp: true });
  const hintO = useTransform(scrollY, [0, 120], [1, 0], { clamp: true });

  const toStory = () => {
    const y = sceneRef.current?.offsetHeight ?? window.innerHeight;
    if (lenisRef.current) lenisRef.current.scrollTo(y, { immediate: reduced });
    else window.scrollTo({ top: y, behavior: reduced ? "auto" : "smooth" });
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

      <div ref={stageRef} className="app-home-stage">
        <m.div className="app-home-hero-wrap" style={reduced ? undefined : { y: heroY, scale: heroS }}>
          <div ref={heroRef} className="app-home-hero" aria-hidden data-cursor={fine ? t.home.hero.cursor : undefined}>
            <HeroNameFx className="h-full" />
          </div>
        </m.div>
      </div>

      <m.div className="app-home-desk" style={reduced ? undefined : { y: deskY }}>
        {/* hello.txt first in reading order; the grid puts the widgets on its left */}
        <div ref={helloSlotRef} className="app-home-hello-slot">
          <HelloWindow ref={helloRef} closed={helloClosed} onClose={closeHello} reduced={reduced} />
        </div>
        <div ref={widgetsRef} className="app-home-widgets" role="group" aria-label={t.home.widgets.label}>
          <ClockWidget />
          <PushWidget />
          <MusicWidget />
        </div>
      </m.div>

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

      <m.button
        type="button"
        className="app-home-scroll"
        onClick={toStory}
        aria-label={t.home.scroll.aria}
        style={reduced ? undefined : { opacity: hintO }}
      >
        <span className="app-home-scroll-chev" aria-hidden>
          <svg width="10" height="12" viewBox="0 0 5 6" shapeRendering="crispEdges">
            <path d="M0 0h1v1H0zM4 0h1v1H4zM1 1h1v1H1zM3 1h1v1H3zM2 2h1v1H2zM0 3h1v1H0zM4 3h1v1H4zM1 4h1v1H1zM3 4h1v1H3zM2 5h1v1H2z" fill="currentColor" />
          </svg>
        </span>
        <span className="app-home-scroll-label">{t.home.scroll.label}</span>
      </m.button>
    </section>
  );
}
