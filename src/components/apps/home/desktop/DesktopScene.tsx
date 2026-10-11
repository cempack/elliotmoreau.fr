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
   own footprint inside the box, which is what has to fit: on desktop the
   two lines are 2 × 7 × 3 + 3 = 45 rows of 8 px (360) by 126 columns plus
   the extrusion. */
const BOX = { desk: { w: 1040, h: 448, fitW: 1040, fitH: 360 }, phone: { w: 700, h: 296, fitW: 700, fitH: 250 } };
/* HeroNameFx's drift tilts the stage up to ~10° each way in perspective:
   the corner nearest the eye grows ~20 box px past the word's footprint.
   The word gets that much air inside its band, and the band's soft edge
   (FADE, matching the CSS mask) on top. */
const DRIFT = 20;
const FADE = 8;
/** Clearance between the band and the glass around it (menu bar, desk). */
const AIR = 8;

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
  const deskRef = useRef<HTMLDivElement>(null);
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

  /* ── the wordmark's band and scale ──
     The live field is a canvas that redraws every frame, so it never sits
     under glass (a backdrop filter over it would re-render every frame
     too): on desktop the hero is confined to a band from just under the
     menu bar to just above the desk, with soft edges, and scaled as big as
     that band allows with room for the drift. */
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
      let shift = 0;
      let bandT = 0;
      let bandB = 0;
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
        // wide screens keep the name centred on the screen (symmetric
        // gutters); narrow ones centre it in the room left of the icons
        const symmetric = sw - 2 * rail >= 0.62 * b.fitW;
        const availW = symmetric ? sw - 2 * rail : sw - rail;
        shift = symmetric ? 0 : -rail / 2;
        // the band, in scene px (layout offsets: transforms don't count)
        const root = getComputedStyle(document.documentElement);
        const rem = parseFloat(root.fontSize) || 16;
        const menubar = (parseFloat(root.getPropertyValue("--menubar-h")) || 2.75) * rem;
        const stageTop = stage.offsetTop;
        const stageBottom = stageTop + stage.offsetHeight;
        // the highest glass on the desk (hello.txt or a widget)
        let deskTop = Infinity;
        const desk = deskRef.current;
        if (desk) {
          for (const el of [helloSlotRef.current, widgetsRef.current]) {
            if (el?.offsetParent && el.offsetHeight) deskTop = Math.min(deskTop, desk.offsetTop + el.offsetTop);
          }
        }
        if (!Number.isFinite(deskTop)) deskTop = stageBottom + AIR;
        const top0 = Math.min(stageTop, menubar + AIR);
        const bottom0 = Math.max(stageBottom, deskTop - AIR);
        bandT = top0 - stageTop;
        bandB = stageBottom - bottom0;
        k = Math.min(availW / b.fitW, (bottom0 - top0 - FADE) / (b.fitH + 2 * DRIFT));
      }
      k = Math.max(0.3, Math.min(k, phone ? 1 : 1.32));
      scene.style.setProperty("--app-home-k", k.toFixed(4));
      scene.style.setProperty("--app-home-hero-x", `${Math.round(shift)}px`);
      scene.style.setProperty("--app-home-band-t", `${Math.round(bandT)}px`);
      scene.style.setProperty("--app-home-band-b", `${Math.round(bandB)}px`);
    };
    fit();
    const ro = new ResizeObserver(fit);
    ro.observe(stage);
    ro.observe(scene);
    if (deskRef.current) ro.observe(deskRef.current);
    return () => ro.disconnect();
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
      const desk = Array.from(scene.querySelectorAll<HTMLElement>(".app-home-widget, .app-home-hello-slot")).filter(
        (el) => el.getClientRects().length
      );
      // left to right, as the eye reads the desk
      desk.sort((a, b) => a.getBoundingClientRect().left - b.getBoundingClientRect().left);
      desk.forEach((el, i) =>
        el.animate([{ transform: "translateY(64px) scale(0.965)" }, { transform: "none" }], {
          duration: 1100,
          delay: 60 + i * 70,
          easing: ease,
          fill: "backwards",
        })
      );
      scene.querySelectorAll<HTMLElement>(".app-home-icon").forEach((el, i) =>
        el.animate([{ opacity: 0, scale: "0.55" }, { opacity: 1, scale: "1" }], {
          duration: 700,
          delay: 220 + i * 55,
          easing: ease,
          fill: "backwards",
        })
      );
    };
    window.addEventListener("em:intro-done", play, { once: true });
    return () => window.removeEventListener("em:intro-done", play);
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
      win.focus();
      // phones: hello.txt is the Notes widget at the top of the home
      // screen, usually scrolled away by the time you reach the icons;
      // bring it back into view first, then nod once it has arrived
      const phone = !window.matchMedia("(min-width: 768px)").matches;
      const el = phone ? sceneRef.current?.querySelector<HTMLElement>(".app-home-hello") : null;
      const r = el?.getBoundingClientRect();
      const root = getComputedStyle(document.documentElement);
      const top = (parseFloat(root.getPropertyValue("--menubar-h")) || 2.75) * (parseFloat(root.fontSize) || 16);
      if (el && r && (r.top < top || r.bottom > window.innerHeight * 0.85)) {
        const y = Math.max(0, window.scrollY + r.top - top - 12);
        const lenis = lenisRef.current;
        if (lenis) lenis.scrollTo(y, { immediate: reduced, onComplete: () => helloRef.current?.nudge() });
        else {
          window.scrollTo({ top: y, behavior: "auto" });
          win.nudge();
        }
      } else {
        win.nudge();
      }
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

  /* ── leaving: the camera tilts down onto the desk. The name rises away
     a little faster than the page and shrinks into the distance; the desk
     lags a touch, heavier. They part, never overlap (no glass over the
     living wordmark). ── */
  const { scrollY } = useScroll();
  const deskY = useTransform(scrollY, [0, 900], [0, 60], { clamp: true });
  const heroY = useTransform(scrollY, [0, 900], [0, -170], { clamp: true });
  const heroS = useTransform(scrollY, [0, 900], [1, 0.84], { clamp: true });
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

      <m.div ref={deskRef} className="app-home-desk" style={reduced ? undefined : { y: deskY }}>
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
      {/* a sweep or ⌘A selects several icons at once: say how many */}
      <p className="sr-only" aria-live="polite">
        {selected.size > 1 ? t.home.icons.selected.replace("{n}", String(selected.size)) : ""}
      </p>

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
