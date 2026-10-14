"use client";

import "./overview.css";
import { useEffect, useRef } from "react";
import dynamic from "next/dynamic";
import { usePathname } from "next/navigation";
import { AnimatePresence } from "motion/react";
import { closeOverview, openOverview, setOverview, takeStay, useOverviewOpen } from "./overview";
import { useSurfaceYield } from "./surface";

/* the overview itself only loads to be shown (IdlePrefetch warms it) */
const Layer = dynamic(() => import("./WindowsOverviewLayer").then((m) => m.Layer), { ssr: false });

/** a trackpad pinch arrives as ctrl+wheel with fractional deltas (a mouse wheel's are whole) */
const isPinch = (e: WheelEvent) => e.ctrlKey && !Number.isInteger(e.deltaY);

/**
 * Every open window, over the river: each app opened in this visit as a
 * live miniature of its window (its own pixels, as it was left), scattered
 * over the Garonne with a line of what's in it. Numbered workspaces sit
 * on top. Click a window to dive back into it, throw it away to close it,
 * drag it onto another workspace to move it there; Esc, a click on the
 * river or a pinch in puts the windows back. Ctrl+↑ or a trackpad pinch
 * out opens it from anywhere, so do the Dock, Spotlight and, on phones, a
 * swipe up on the tab bar.
 */
export function WindowsOverview() {
  const open = useOverviewOpen();
  const pathname = usePathname();

  // the Terminal opening from here (its Dock icon, the ` key): the windows go back first
  useSurfaceYield("overview", (id) => {
    if (id === "terminal") closeOverview();
  });

  // the keyboard and the trackpad, from anywhere
  useEffect(() => {
    let pinch = 0;
    let idle = 0;
    const onWheel = (e: WheelEvent) => {
      if (!isPinch(e)) return;
      const shown = document.documentElement.hasAttribute("data-overview");
      // a pinch out opens it; a pinch in, while it shows, closes it
      if ((!shown && e.deltaY <= 0) || (shown && e.deltaY >= 0)) return;
      e.preventDefault();
      pinch += e.deltaY;
      window.clearTimeout(idle);
      idle = window.setTimeout(() => (pinch = 0), 260);
      if (!shown && pinch > 26) {
        pinch = 0;
        openOverview();
      } else if (shown && pinch < -26) {
        pinch = 0;
        closeOverview();
      }
    };
    // Safari reports a pinch as a gesture
    const onGesture = (e: Event) => {
      const scale = (e as Event & { scale?: number }).scale ?? 1;
      const shown = document.documentElement.hasAttribute("data-overview");
      if (!shown && scale < 0.82) {
        e.preventDefault();
        openOverview();
      } else if (shown && scale > 1.2) {
        e.preventDefault();
        closeOverview();
      }
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "ArrowUp" || !e.ctrlKey || e.metaKey || e.altKey || e.shiftKey || e.repeat) return;
      const t = e.target as HTMLElement | null;
      if (t?.closest?.("input,textarea,select,[contenteditable='true'],.os-term")) return;
      if (!document.documentElement.hasAttribute("data-overview") && document.querySelector("dialog[open],[aria-modal='true']")) return;
      e.preventDefault();
      setOverview(!document.documentElement.hasAttribute("data-overview"));
    };
    window.addEventListener("wheel", onWheel, { passive: false });
    window.addEventListener("gesturechange", onGesture);
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("wheel", onWheel);
      window.removeEventListener("gesturechange", onGesture);
      window.removeEventListener("keydown", onKey);
      window.clearTimeout(idle);
    };
  }, []);

  // the windows step back while it shows (overview.css)
  useEffect(() => {
    const root = document.documentElement;
    if (open) root.setAttribute("data-overview", "");
    else root.removeAttribute("data-overview");
    return () => root.removeAttribute("data-overview");
  }, [open]);

  // a navigation (a card, a link, the back button) puts it away
  const shownOn = useRef(pathname);
  useEffect(() => {
    if (open && shownOn.current !== pathname && !takeStay()) closeOverview();
    shownOn.current = pathname;
  }, [pathname, open]);

  return <AnimatePresence>{open && <Layer key="overview" />}</AnimatePresence>;
}

