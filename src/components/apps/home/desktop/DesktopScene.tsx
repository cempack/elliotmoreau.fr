"use client";

import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { m, useMotionValue, useMotionValueEvent, useScroll, useTransform, type MotionStyle } from "motion/react";
import { useI18n } from "@/i18n/client";
import { useFinePointer, useHydrated, useReduced } from "@/hooks/env";
import { lenisRef } from "@/lib/lenisRef";
import { useSound } from "@/lib/sound";
import { DesktopIcons } from "./DesktopIcons";
import { HelloWindow, type HelloHandle } from "./HelloWindow";
import { ClockWidget, LatestPostWidget, PushWidget } from "./Widgets";
import { WidgetPager } from "./WidgetPager";
import { DESKTOP_ICONS, type DesktopIconId } from "./icons";
import { desktopMemory } from "./store";
import { INTERACTIVE, intersects, type Rect } from "./physics";
import { letterRects } from "./hero";
import { Wordmark } from "./Wordmark";
import { isPhone, menubarPx, pipRect, watchPip } from "./layout";

/* The wordmark's stage box. The field sizes its pixel grid from its box
   (8 CSS px cells up to 150 × 80), so a fixed box keeps the letters at a
   whole-cell scale with square cells, and a transform scales the result
   to the screen: s = 3 on desktop, s = 2 on phones. FIT is the wordmark's
   own footprint inside the box, which is what has to fit: on desktop the
   two lines are 2 × 7 × 3 + 3 = 45 rows of 8 px (360) by 126 columns plus
   the extrusion. */
const BOX = { desk: { w: 1040, h: 448, fitW: 1040, fitH: 360 }, phone: { w: 700, h: 296, fitW: 700, fitH: 250 } };
/* The wordmark's drift tilts the stage up to ~10° each way in perspective:
   the corner nearest the eye grows ~20 box px past the word's footprint.
   The word gets that much air inside its band, and the band's soft edge
   (FADE, matching the CSS mask) on top. */
const DRIFT = 20;
const FADE = 8;
/** Clearance between the band and the glass around it (menu bar, desk). */
const AIR = 8;
/** Where the letters are in each box, so only the name itself replays. */
const LETTERS = { desk: letterRects(BOX.desk.w, BOX.desk.h), phone: letterRects(BOX.phone.w, BOX.phone.h) };
/** Hover/click slack around the letters: the drift tilts them a little. */
const LETTER_PAD = 14;

/* leaving: how far the name rises and shrinks over the first 900px */
const LEAVE = 900;
const RISE = -170;
const SHRINK = 0.16;
const leaving = (s: number) => Math.min(1, Math.max(0, s / LEAVE));

/** Page offset of an element's layout box (transforms don't count). */
function pageTop(el: HTMLElement) {
  let y = 0;
  for (let n: HTMLElement | null = el; n; n = n.offsetParent as HTMLElement | null) y += n.offsetTop;
  return y;
}

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
  const hydrated = useHydrated();
  // the live field (a canvas loop) only runs after hydration and never
  // under reduced motion; until then, and instead, the still wordmark
  const live = hydrated && !reduced;
  const { blip } = useSound();
  const sceneRef = useRef<HTMLElement>(null);
  const stageRef = useRef<HTMLDivElement>(null);
  const wrapRef = useRef<HTMLDivElement>(null);
  const heroRef = useRef<HTMLDivElement>(null);
  const widgetsRef = useRef<HTMLDivElement>(null);
  const helloSlotRef = useRef<HTMLDivElement>(null);
  const deskRef = useRef<HTMLDivElement>(null);
  const marqueeRef = useRef<HTMLDivElement>(null);
  const helloRef = useRef<HelloHandle>(null);
  const mq = useRef<Marquee | null>(null);
  const suppressClick = useRef(false);
  /** the press that began this click cleared a selection (no replay then) */
  const deselect = useRef(false);
  /** the pointer is over the letters (the cursor says Replay) */
  const overName = useRef(false);
  /** the band's resting geometry, for the scroll clip */
  const geo = useRef({ top: 0, h: 0, origin: 0.3, bar: 44 });
  const [selected, setSelectedState] = useState<Set<DesktopIconId>>(() => new Set());
  const [helloClosed, setHelloClosed] = useState(() => desktopMemory.helloClosed());

  /* ── leaving: the camera tilts down onto the desk. The name rises away
     a little faster than the page and shrinks into the distance; the desk
     lags a touch, heavier. They part, never overlap (no glass over the
     living wordmark). ── */
  const { scrollY } = useScroll();
  const deskY = useTransform(scrollY, [0, LEAVE], [0, 60], { clamp: true });
  const heroY = useTransform(scrollY, (s) => RISE * leaving(s));
  const heroS = useTransform(scrollY, (s) => 1 - SHRINK * leaving(s));
  const hintO = useTransform(scrollY, [0, 120], [1, 0], { clamp: true });

  /* ── the name never goes under the menu bar's glass ──
     The live field redraws every frame; a backdrop filter over it would
     re-render every frame too. As the page scrolls (and the name rises
     faster than it), the band's top edge is held at the menu bar's lower
     edge: a hard clip there, the soft fade just under it. Once the whole
     band is behind that line it leaves the layout, which also stops the
     field's loop (it watches its own visibility). */
  const clip = useMotionValue("0px");
  const reducedRef = useRef(reduced);
  useEffect(() => {
    reducedRef.current = reduced;
  }, [reduced]);
  const clipToBar = (s: number) => {
    const g = geo.current;
    if (!g.h) return;
    const p = reducedRef.current ? 0 : leaving(s);
    const k = 1 - SHRINK * p;
    const oy = g.top + g.origin * g.h;
    // the local y (in the band) that the transform puts on the bar's edge
    const ly = g.origin * g.h + (g.bar + s - RISE * p - oy) / k;
    const v = Math.max(0, Math.min(g.h, ly));
    clip.set(`${v.toFixed(1)}px`);
    const wrap = wrapRef.current;
    if (!wrap) return;
    if (v >= g.h - 1) wrap.dataset.gone = "";
    else delete wrap.dataset.gone;
  };
  useMotionValueEvent(scrollY, "change", clipToBar);

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
      const phone = isPhone();
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
        // a phone held sideways is short: the name keeps to ~40% of it
        k = Math.min(sw / b.fitW, (0.42 * window.innerHeight) / b.h);
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
        const menubar = menubarPx();
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
      // whole device pixels per 8 px cell, so the pixelated field stays
      // crisp at rest (no 16/17 px cells alternating), unless that would
      // cost the name more than a few percent of its size (1× screens
      // step in eighths)
      const dpr = window.devicePixelRatio || 1;
      const kq = Math.floor(k * 8 * dpr) / (8 * dpr);
      if (kq >= k * 0.96) k = kq;
      scene.style.setProperty("--app-home-k", k.toFixed(4));
      scene.style.setProperty("--app-home-hero-x", `${Math.round(shift)}px`);
      scene.style.setProperty("--app-home-band-t", `${Math.round(bandT)}px`);
      scene.style.setProperty("--app-home-band-b", `${Math.round(bandB)}px`);
      // where the band rests on the page, and where the menu bar ends
      const wrap = wrapRef.current;
      if (wrap) {
        const bar = document.querySelector(".os-menubar")?.getBoundingClientRect().bottom;
        geo.current = { top: pageTop(wrap), h: wrap.offsetHeight, origin: phone ? 0 : 0.3, bar: bar || menubarPx() };
        clipToBar(scrollY.get());
      }
    };
    fit();
    const ro = new ResizeObserver(fit);
    ro.observe(stage);
    ro.observe(scene);
    if (deskRef.current) ro.observe(deskRef.current);
    window.addEventListener("resize", fit);
    return () => {
      ro.disconnect();
      window.removeEventListener("resize", fit);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /* ── a phone held sideways: the mini player comes to rest over the
     widget column, so the widgets step down below it (the icon grid
     already keeps a slot free for it). In page px at the top: the player
     is fixed, so where it rests on the screen is where it is on the page. */
  useEffect(() => {
    const mq = window.matchMedia("(pointer: coarse) and (max-height: 520px) and (min-width: 600px)");
    let applied = 0;
    const measure = () => {
      const el = widgetsRef.current;
      if (!el) return;
      let shift = 0;
      const pip = mq.matches ? pipRect() : null;
      if (pip) {
        const r = el.getBoundingClientRect();
        const top0 = r.top + window.scrollY - applied;
        if (intersects({ left: r.left, top: top0, right: r.right, bottom: top0 + r.height }, pip)) shift = Math.ceil(pip.bottom - top0 + 12);
      }
      if (shift === applied) return;
      applied = shift;
      el.style.marginTop = shift ? `${shift}px` : "";
    };
    measure();
    const unwatch = watchPip(measure);
    mq.addEventListener("change", measure);
    return () => {
      unwatch();
      mq.removeEventListener("change", measure);
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

  /* ── the name, and only the name, replays ──
     The field is ~1000 × 420 px; clicking its empty corners is clicking
     the desktop (to deselect, say), not the wordmark. */
  const overLetters = (x: number, y: number) => {
    const el = heroRef.current;
    if (!el) return false;
    const r = el.getBoundingClientRect();
    if (!r.width || !r.height) return false;
    const phone = isPhone();
    const b = phone ? BOX.phone : BOX.desk;
    const lx = ((x - r.left) / r.width) * b.w;
    const ly = ((y - r.top) / r.height) * b.h;
    return (phone ? LETTERS.phone : LETTERS.desk).some(
      (q) => lx >= q.left - LETTER_PAD && lx <= q.right + LETTER_PAD && ly >= q.top - LETTER_PAD && ly <= q.bottom + LETTER_PAD
    );
  };

  const onHeroMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (e.pointerType !== "mouse" || !live) return;
    const over = overLetters(e.clientX, e.clientY);
    if (over === overName.current) return;
    overName.current = over;
    const el = e.currentTarget;
    if (over) el.dataset.cursor = t.home.hero.cursor;
    else delete el.dataset.cursor;
    // the glass cursor reads its label on pointerover
    e.target.dispatchEvent(new PointerEvent("pointerover", { bubbles: true, pointerType: "mouse" }));
  };

  const onHeroLeave = (e: React.PointerEvent<HTMLDivElement>) => {
    overName.current = false;
    delete e.currentTarget.dataset.cursor;
  };

  const onHeroClick = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!live || deselect.current || !overLetters(e.clientX, e.clientY)) return;
    window.dispatchEvent(new CustomEvent("em:replay"));
  };

  /* ── icons may not land on the widgets, hello.txt or the mini player ──
     (all in scene px as the desktop rests, scrolled to the top) */
  const blockers = useCallback((): Rect[] => {
    const scene = sceneRef.current;
    if (!scene) return [];
    const s = scene.getBoundingClientRect();
    // the desk lags the scroll by a transform: measure it where it rests
    const lag = reduced ? 0 : deskY.get();
    const out: Rect[] = [];
    for (const el of [widgetsRef.current, helloSlotRef.current]) {
      if (!el || !el.getClientRects().length) continue;
      const r = el.getBoundingClientRect();
      if (r.width === 0) continue;
      out.push({ left: r.left - s.left - 8, top: r.top - lag - s.top - 8, right: r.right - s.left + 8, bottom: r.bottom - lag - s.top + 8 });
    }
    // the mini player is fixed: where it rests over the screen at the top
    const pip = pipRect();
    if (pip) {
      const top0 = s.top + window.scrollY;
      out.push({ left: pip.left - s.left - 8, top: pip.top - top0 - 8, right: pip.right - s.left + 8, bottom: pip.bottom - top0 + 8 });
    }
    return out;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [reduced]);

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
    const act = () => {
      const win = helloRef.current;
      if (!win) return;
      if (desktopMemory.helloClosed()) {
        win.open(readmeCenter());
        desktopMemory.setHelloClosed(false);
        setHelloClosed(false);
        blip("open");
        requestAnimationFrame(() => helloRef.current?.focus());
      } else {
        win.focus();
        win.nudge();
      }
    };
    if (window.scrollY <= 4) {
      act();
      return;
    }
    // activated from further down (keyboard): bring the desk back first,
    // then open or nudge where it can be seen
    const l = lenisRef.current;
    if (l && !reduced) l.scrollTo(0, { onComplete: act });
    else {
      if (l) l.scrollTo(0, { immediate: true });
      else window.scrollTo({ top: 0 });
      requestAnimationFrame(act);
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
    deselect.current = selected.size > 0;
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
        <m.div
          ref={wrapRef}
          className="app-home-hero-wrap"
          style={(reduced ? { "--app-home-clip": clip } : { y: heroY, scale: heroS, "--app-home-clip": clip }) as unknown as MotionStyle}
        >
          <div
            ref={heroRef}
            className="app-home-hero"
            aria-hidden
            data-live={live || undefined}
            onPointerMove={onHeroMove}
            onPointerLeave={onHeroLeave}
            onClick={onHeroClick}
          >
            <Wordmark desk={BOX.desk} phone={BOX.phone} live={live} />
          </div>
        </m.div>
      </div>

      <m.div ref={deskRef} className="app-home-desk" style={reduced ? undefined : { y: deskY }}>
        {/* hello.txt first in reading order; the grid puts the widgets on its left */}
        <div ref={helloSlotRef} className="app-home-hello-slot">
          <HelloWindow ref={helloRef} closed={helloClosed} onClose={closeHello} reduced={reduced} />
        </div>
        <WidgetPager
          viewRef={widgetsRef}
          label={t.home.widgets.label}
          reduced={reduced}
          pages={[
            <>
              <ClockWidget />
              <PushWidget />
            </>,
            <LatestPostWidget key="post" />,
          ]}
        />
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
