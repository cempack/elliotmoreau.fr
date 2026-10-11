"use client";

import "./window.css";
import { ViewTransition, useEffect, useLayoutEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { m, type MotionStyle } from "motion/react";
import { useI18n } from "@/i18n/client";
import { useSound } from "@/lib/sound";
import { spring } from "@/lib/motion";
import { useReduced } from "@/hooks/env";
import { PixelGlyph } from "@/components/glyphs";
import { APPS, type AppId } from "./apps";
import { AppIcon } from "./icons";
import { Glass } from "./Glass";
import { useWindowDrag } from "./window/useWindowDrag";
import { dockIconCenter, markKeyboardClose, setEnterOrigin, setExitOrigin } from "./window/dock";
import { getZoomPref, setZoomPref } from "./window/zoomPref";
import { G_CLOSE, G_MIN, G_UNZOOM, G_ZOOM } from "./window/glyphs";

export { WinNav, WinNavItem } from "./window/WinNav";

/** Page transition classes by navigation type (see window.css). */
const ENTER = { "app-open": "app-open", default: "app-in" };
const EXIT = { "app-close": "app-close", "app-open": "app-leave", default: "app-out" };

/**
 * CONTRACT (owner: window agent)
 * The frame every app page renders inside: a large Liquid Glass window
 * between the menu bar and the Dock (a full-screen sheet with a grabber
 * on phones). Props: `app`, `title` (defaults to the app name), `toolbar`
 * (right of the title bar), `sidebar` (left column ≥lg, a horizontal
 * segmented strip on smaller screens; see WinNav/WinNavItem), `children`,
 * `className` (on the <section>), optional `subtitle` (replaces the mono
 * "~/path" next to the title).
 *
 * - Traffic lights: close and minimize go home with the "app-close"
 *   transition, zoom toggles full width on a layout spring (double-click
 *   the title bar too). Glyphs show on hover/focus.
 * - The title bar is sticky under the menu bar; content scrolls with the
 *   page (no nested scroller). Descendants can stick below it with
 *   `top: var(--os-win-sticky-top)`.
 * - Physical: grab the title bar and the window follows 1:1 (rubber-band
 *   past its margins); throw it down toward the Dock to close it into its
 *   icon, otherwise it springs home carrying the release velocity.
 * - <ViewTransition>: "app-open" grows the window out of its Dock icon,
 *   "app-close" shrinks it back along the same path, anything else
 *   cross-fades. Reduced motion: 150ms cross-fades only. Render
 *   <AppWindow> as the outermost DOM element of the page (fragments are
 *   fine): React only runs enter/exit for a ViewTransition that no DOM
 *   node of the changing subtree wraps.
 */
export function AppWindow({
  app,
  title,
  subtitle,
  toolbar,
  sidebar,
  children,
  className = "",
}: {
  app: AppId;
  title?: string;
  subtitle?: React.ReactNode;
  toolbar?: React.ReactNode;
  sidebar?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
}) {
  const { t, path } = useI18n();
  const w = t.windowing.window;
  const def = APPS.find((a) => a.id === app) ?? APPS[0];
  const label = title ?? t.shell.apps[def.label];
  const home = path("/");
  const appHref = path(def.path);
  const router = useRouter();
  const { blip } = useSound();
  const reduced = useReduced();
  const [zoomed, setZoomed] = useState(getZoomPref);
  const [thrown, setThrown] = useState(false);
  const winRef = useRef<HTMLElement>(null);
  const barRef = useRef<HTMLDivElement>(null);
  const sentinelRef = useRef<HTMLSpanElement>(null);
  const titleId = `win-${app}`;

  const drag = useWindowDrag({
    winRef,
    barRef,
    reduced,
    onGrab: () => router.prefetch(home),
    onThrow: () => {
      // it flies into the Dock itself: no exit animation on top of that
      setThrown(true);
      blip("close");
    },
    onClose: () => router.push(home, { transitionTypes: ["app-close"] }),
    target: () => dockIconCenter(app, appHref),
  });

  // where the page transition grows from / shrinks into (window.css reads these)
  useLayoutEffect(() => {
    const el = winRef.current;
    if (!el) return;
    setEnterOrigin(el, app, appHref);
    const raf = requestAnimationFrame(() => setEnterOrigin(el, app, appHref, true));
    return () => {
      cancelAnimationFrame(raf);
      setExitOrigin(el, app, appHref);
    };
  }, [app, appHref]);

  // the title bar gains its own material once content scrolls under it
  useEffect(() => {
    const bar = barRef.current;
    const sentinel = sentinelRef.current;
    if (!bar || !sentinel) return;
    let io: IntersectionObserver | null = null;
    let raf = 0;
    const observe = () => {
      io?.disconnect();
      const top = parseFloat(getComputedStyle(bar).top) || 0;
      io = new IntersectionObserver(
        ([en]) => {
          if (!en.isIntersecting && en.boundingClientRect.top < top) bar.dataset.stuck = "";
          else delete bar.dataset.stuck;
        },
        { rootMargin: `${-Math.round(top) - 1}px 0px 0px 0px`, threshold: 0 },
      );
      io.observe(sentinel);
    };
    const onResize = () => {
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(observe);
    };
    observe();
    window.addEventListener("resize", onResize);
    return () => {
      io?.disconnect();
      cancelAnimationFrame(raf);
      window.removeEventListener("resize", onResize);
    };
  }, []);

  // keyboard activation (detail 0) hands focus to the Dock icon afterwards
  const onCloseClick = (e: React.MouseEvent) => {
    blip("close");
    if (e.detail === 0) markKeyboardClose(app);
  };

  const toggleZoom = () => {
    const next = !zoomed;
    setZoomPref(next);
    setZoomed(next);
    blip("toggle");
  };

  return (
    // the ViewTransition must sit above any DOM node of the page, or React
    // never runs its enter/exit (nested boundaries only animate updates)
    <ViewTransition enter={ENTER} exit={thrown ? "none" : EXIT} update="none" share="none" default="none">
      <m.section
        ref={winRef}
        layout
        // only zoom resizes the window on a spring: content changes (a
        // filter, a sheet, a growing list) just reflow
        layoutDependency={zoomed}
        transition={{ layout: spring.default }}
        aria-labelledby={titleId}
        data-app={app}
        data-zoomed={zoomed || undefined}
        className={`os-win ${className}`}
        style={{ ...drag.style, "--os-win-accent": def.accent } as MotionStyle}
      >
        <Glass thickness="thick" className="os-win-glass" aria-hidden />
        <span className="os-win-glow" aria-hidden />
        <span ref={sentinelRef} className="os-win-sentinel" aria-hidden />

        <m.div
          ref={barRef}
          layout="position"
          layoutDependency={zoomed}
          className="os-win-bar"
          data-cursor-hide=""
          {...drag.handlers}
          onDoubleClick={(e) => {
            if ((e.target as Element).closest("a,button,input")) return;
            if (window.matchMedia("(min-width: 768px)").matches) toggleZoom();
          }}
        >
          <span className="os-win-grabber" aria-hidden />
          <div className="os-win-lights">
            <Link
              href={home}
              transitionTypes={["app-close"]}
              onClick={onCloseClick}
              aria-label={w.close}
              className="os-win-light os-win-light--close"
            >
              <PixelGlyph cells={G_CLOSE} size={7} />
            </Link>
            <Link
              href={home}
              transitionTypes={["app-close"]}
              onClick={onCloseClick}
              aria-label={w.minimize}
              className="os-win-light os-win-light--min"
            >
              <PixelGlyph cells={G_MIN} size={7} />
            </Link>
            <button
              type="button"
              onClick={toggleZoom}
              aria-label={zoomed ? w.unzoom : w.zoom}
              aria-pressed={zoomed}
              className="os-win-light os-win-light--zoom"
            >
              <PixelGlyph cells={zoomed ? G_UNZOOM : G_ZOOM} size={7} />
            </button>
          </div>

          <div className="os-win-heading">
            <AppIcon app={app} size={20} />
            <h1 id={titleId} className="os-win-title">
              {label}
            </h1>
            {subtitle ? (
              <span className="os-win-sub">{subtitle}</span>
            ) : (
              <span className="os-win-sub os-win-sub--path" aria-hidden>
                ~{def.path === "/" ? "" : def.path}
              </span>
            )}
          </div>

          {toolbar && <div className="os-win-toolbar">{toolbar}</div>}

          <Link
            href={home}
            transitionTypes={["app-close"]}
            onClick={onCloseClick}
            aria-label={w.close}
            className="os-win-x"
          >
            <span>
              <PixelGlyph cells={G_CLOSE} size={14} />
            </span>
          </Link>
        </m.div>

        <m.div layout="position" layoutDependency={zoomed} className="os-win-body" data-has-side={sidebar ? "" : undefined}>
          {sidebar && (
            <aside className="os-win-side" aria-label={w.sections} data-lenis-prevent>
              {sidebar}
            </aside>
          )}
          <div className="os-win-main">{children}</div>
        </m.div>

        <span className="os-win-rim" aria-hidden />
      </m.section>
    </ViewTransition>
  );
}
