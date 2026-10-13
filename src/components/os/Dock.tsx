"use client";

import "./dock.css";
import { useEffect } from "react";
import { usePathname } from "next/navigation";
import { appForPath } from "./apps";
import { DesktopDock } from "./dock/DesktopDock";
import { MobileTabBar } from "./dock/MobileTabBar";
import { useAppShortcuts, visibleIcon } from "./dock/launch";
import { takeKeyboardClose } from "./window/dock";

export { DOCK_ICON, DOCK_MAX } from "./dock/useMagnification";

/**
 * CONTRACT (owner: dock agent)
 * Fixed bottom glass dock. Pixel app icons from APPS (+ separator +
 * Terminal toggle via useTerminal()). Fine pointers: macOS magnification
 * following the pointer on springs (icons grow toward the cursor, neighbors
 * ease), tooltip labels; running/active dot under the current app; press
 * feedback on pointer-down. Navigation uses <Link transitionTypes={["app-open"]}>.
 * Mobile: becomes an iOS-style bottom bar (safe-area aware, 44px+ targets).
 * Keys 1–6 open apps when no input is focused.
 *
 * Height: `var(--dock-h)` is the space the dock occupies at the bottom of
 * the viewport (76px desktop; on phones the floating tab bar: its handle
 * band, the 62px capsule and the gap under it, home indicator included).
 * Pad with it.
 * Every icon carries `[data-dock-launch="<app id>"]`, so a window can
 * measure the icon it grows out of (window/dock.ts).
 * View transitions: while a transition runs (only then: a name would make
 * it a backdrop root and drop its glass) the dock is `os-dock` (phone:
 * `os-tabbar`) and holds still above the pages transitioning beneath it.
 */
export function Dock() {
  const pathname = usePathname();
  const active = appForPath(pathname);
  useAppShortcuts(active.id);
  useRiseAfterIntro();
  useFocusAfterKeyboardClose(pathname);
  return (
    <>
      <DesktopDock />
      <MobileTabBar />
    </>
  );
}

/**
 * A window closed from the keyboard: once the Desktop is in, focus lands
 * on that app's Dock icon (as on macOS), not on <body>.
 */
function useFocusAfterKeyboardClose(pathname: string) {
  useEffect(() => {
    const app = takeKeyboardClose();
    if (!app) return;
    const raf = requestAnimationFrame(() => {
      const at = document.activeElement;
      if (at && at !== document.body) return;
      visibleIcon(app)?.querySelector<HTMLElement>("a, button")?.focus({ preventScroll: true });
    });
    return () => cancelAnimationFrame(raf);
  }, [pathname]);
}

/**
 * When the boot clears into the Desktop, the dock rises into place. Only
 * if the intro actually covered the screen (first visit, or after a
 * Restart reload), never for returning visitors who skip it before paint.
 */
function useRiseAfterIntro() {
  useEffect(() => {
    // the boot overlay is server-rendered and hidden before paint for
    // returning visitors, so "visible at mount" means it really covers us
    const intro = document.querySelector(".em-intro");
    let covered = !!intro && intro.getClientRects().length > 0;
    const onDone = (e: Event) => {
      if (!covered) return;
      covered = false;
      if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
      for (const el of document.querySelectorAll<HTMLElement>("[data-os-dock]")) {
        if (!el.getClientRects().length) continue;
        el.animate([{ transform: "translateY(calc(100% + 24px))" }, { transform: "translateY(0)" }], {
          duration: 760,
          // the gate says when its cover lifts (Gate.tsx)
          delay: ((e as CustomEvent<{ delay?: number }>).detail?.delay ?? 0) + 200,
          easing: "cubic-bezier(0.22, 1, 0.36, 1)",
          fill: "backwards",
        });
      }
    };
    window.addEventListener("em:intro-done", onDone);
    return () => window.removeEventListener("em:intro-done", onDone);
  }, []);
}
