"use client";

import "./window.css";
import { ViewTransition, addTransitionType, startTransition, useEffect, useLayoutEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { m, type MotionStyle } from "motion/react";
import { useI18n } from "@/i18n/client";
import { useSound } from "@/lib/sound";
import { useReduced } from "@/hooks/env";
import { viewTransitionActive } from "@/hooks/useSettled";
import { appDef, type AppId } from "./apps";
import { AppIcon } from "./icons";
import { Glass } from "./Glass";
import { useWindowDrag } from "./window/useWindowDrag";
import { dockIconCenter, markKeyboardClose, setEnterOrigin, setExitOrigin } from "./window/dock";
import { getZoomPref, setZoomPref } from "./window/zoomPref";
import { WinIcon } from "./window/WinIcon";
import { PathBar, type Crumb } from "./window/PathBar";
import { closeWorkspace } from "./workspaces";
import { captureWindow } from "./windowShots";
import { useContextMenu, useCopy } from "./context/ContextMenu";

export { WinNav, WinNavItem } from "./window/WinNav";
export { PathBar, type Crumb } from "./window/PathBar";

/** Page transition classes by navigation type (see window.css). */
const ENTER = { "app-open": "app-open", default: "app-in" };
const EXIT = { "app-close": "app-close", "app-open": "app-leave", default: "app-out" };
/** only zoom morphs the window in place; any other update inside just reflows */
const UPDATE = { "win-zoom": "win-zoom", default: "none" };

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
 * - Lights: zoom toggles full width, morphing in place as a view
 *   transition (the browser animates the snapshot; nothing re-lays out
 *   per frame, and no layout animation measures the page) (double-click the
 *   title bar too); close goes home with the "app-close" transition. No
 *   minimize: an app is open or it isn't. Glyphs show on hover/focus.
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
  path: crumbs,
  toolbar,
  sidebar,
  children,
  className = "",
}: {
  app: AppId;
  title?: string;
  subtitle?: React.ReactNode;
  /** the title bar's path after "~" (defaults to the app's own segment); each segment but the last is clickable */
  path?: Crumb[];
  toolbar?: React.ReactNode;
  sidebar?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
}) {
  const { t, path } = useI18n();
  const w = t.windowing.window;
  const def = appDef(app);
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
  const mainRef = useRef<HTMLDivElement>(null);
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
      // a throw is a close: its workspace leaves the bar too
      closeWorkspace(app);
    },
    onClose: () => router.push(home, { scroll: false, transitionTypes: ["app-close"] }),
    target: () => dockIconCenter(app, appHref),
  });

  // where the page transition grows from / shrinks into (window.css reads these)
  useLayoutEffect(() => {
    const el = winRef.current;
    if (!el) return;
    // only a window mounting inside a view transition is opening (a hard
    // load, or reduced motion, has no transition to aim)
    let raf = 0;
    if (viewTransitionActive()) {
      setEnterOrigin(el, app, appHref);
      raf = requestAnimationFrame(() => setEnterOrigin(el, app, appHref, true));
    }
    return () => {
      cancelAnimationFrame(raf);
      setExitOrigin(el, app, appHref);
      // the overview's miniature: the window as it was left (still in the DOM here)
      if (app !== "admin") captureWindow(app, el);
    };
  }, [app, appHref]);

  // the title bar gains its own material once content scrolls under it
  useEffect(() => {
    const bar = barRef.current;
    const main = mainRef.current;
    if (!bar || !main) return;
    const onScroll = () => {
      if (main.scrollTop > 2) bar.dataset.stuck = "";
      else delete bar.dataset.stuck;
    };
    // read once the window is in, not during the frame that opens it
    const raf = requestAnimationFrame(onScroll);
    main.addEventListener("scroll", onScroll, { passive: true });
    return () => {
      cancelAnimationFrame(raf);
      main.removeEventListener("scroll", onScroll);
    };
  }, []);

  // keyboard activation (detail 0) hands focus to the Dock icon afterwards
  const onCloseClick = (e: React.MouseEvent) => {
    blip("close");
    if (e.detail === 0) markKeyboardClose(app);
  };

  // closing (not minimising) also takes the app's workspace off the bar
  const onCloseWindow = (e: React.MouseEvent) => {
    onCloseClick(e);
    // a modified click opens the Desktop elsewhere and this window stays
    if (e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
    closeWorkspace(app);
  };

  const toggleZoom = () => {
    const next = !zoomed;
    setZoomPref(next);
    blip("toggle");
    if (reduced) return setZoomed(next);
    startTransition(() => {
      addTransitionType("win-zoom");
      setZoomed(next);
    });
  };

  // right-click anywhere in the window: what the lights do, and its address
  const copy = useCopy();
  const ctx = t.shell.context;
  useContextMenu(winRef, ({ keyboard }) => ({
    items: [
      { label: ctx.copyPage, onSelect: () => copy(window.location.href, ctx.linkCopied) },
      ...(window.matchMedia("(min-width: 768px)").matches ? [{ label: zoomed ? w.unzoom : w.zoom, onSelect: toggleZoom }] : []),
      {
        label: ctx.close,
        onSelect: () => {
          blip("close");
          if (keyboard) markKeyboardClose(app);
          closeWorkspace(app);
          router.push(home, { scroll: false, transitionTypes: ["app-close"] });
        },
      },
    ],
  }));

  return (
    // the ViewTransition must sit above any DOM node of the page, or React
    // never runs its enter/exit (nested boundaries only animate updates)
    <ViewTransition enter={ENTER} exit={thrown ? "none" : EXIT} update={UPDATE} share="none" default="none">
      <m.section
        ref={winRef}
        aria-labelledby={titleId}
        data-app={app}
        data-zoomed={zoomed || undefined}
        className={`os-win ${className}`}
        style={{ ...drag.style, "--os-win-accent": def.accent } as MotionStyle}
      >
        <Glass thickness="thick" className="os-win-glass" aria-hidden />
        <span className="os-win-glow" aria-hidden />

        <div
          ref={barRef}
          className="os-win-bar"
         
          {...drag.handlers}
          onDoubleClick={(e) => {
            if ((e.target as Element).closest("a,button,input")) return;
            if (window.matchMedia("(min-width: 768px)").matches) toggleZoom();
          }}
        >
          <span className="os-win-grabber" aria-hidden />
          <div className="os-win-lights">
            <button
              type="button"
              onClick={toggleZoom}
              aria-label={zoomed ? w.unzoom : w.zoom}
              aria-pressed={zoomed}
              className="os-win-light os-win-light--zoom"
            >
              <WinIcon kind={zoomed ? "unmax" : "max"} />
            </button>
            <Link
              href={home}
              scroll={false}
              transitionTypes={["app-close"]}
              onClick={onCloseWindow}
              aria-label={w.close}
              className="os-win-light os-win-light--close"
            >
              <WinIcon kind="close" />
            </Link>
          </div>

          <div className="os-win-heading">
            <AppIcon app={app} size={20} />
            <h1 id={titleId} className="os-win-title">
              {label}
            </h1>
            {subtitle ? (
              <span className="os-win-sub">{subtitle}</span>
            ) : (
              <PathBar crumbs={crumbs ?? (def.path === "/" ? [] : [{ label: def.path.slice(1) }])} />
            )}
          </div>

          {toolbar && <div className="os-win-toolbar">{toolbar}</div>}

          <Link
            href={home}
            scroll={false}
            transitionTypes={["app-close"]}
            onClick={onCloseWindow}
            aria-label={w.close}
            className="os-win-x"
          >
            <span>
              <WinIcon kind="close" />
            </span>
          </Link>
        </div>

        <div className="os-win-body" data-has-side={sidebar ? "" : undefined}>
          {sidebar && (
            <aside className="os-win-side" aria-label={w.sections} data-lenis-prevent>
              {sidebar}
            </aside>
          )}
          <div ref={mainRef} className="os-win-main" data-lenis-prevent>
            {children}
          </div>
        </div>

        <span className="os-win-rim" aria-hidden />
      </m.section>
    </ViewTransition>
  );
}
