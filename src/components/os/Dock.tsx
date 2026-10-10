"use client";

import "./dock.css";
import { useEffect } from "react";
import { usePathname } from "next/navigation";
import { appForPath } from "./apps";
import { DesktopDock } from "./dock/DesktopDock";
import { MobileTabBar } from "./dock/MobileTabBar";
import { useAppShortcuts } from "./dock/launch";

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
 * the viewport (76px desktop; 60px + safe area on phones). Pad with it.
 * Launch origin: `--os-launch-x/y` on <html> (viewport px) hold the centre
 * of the icon an app was last launched from; every icon carries
 * `[data-dock-launch="<app id>"]` for measuring.
 * View transitions: the dock is `view-transition-name: os-dock` (phone:
 * `os-tabbar`) and holds still while pages transition beneath it.
 */
export function Dock() {
  const active = appForPath(usePathname());
  useAppShortcuts(active.id);
  useRiseAfterIntro();
  return (
    <>
      <DesktopDock />
      <MobileTabBar />
    </>
  );
}

/**
 * When the boot/lock screen lifts away, the dock rises into place. Only
 * if the intro actually covered the screen (first visit, or after a
 * Restart reload), never for returning visitors who skip it before paint.
 */
function useRiseAfterIntro() {
  useEffect(() => {
    // the boot overlay is server-rendered and hidden before paint for
    // returning visitors, so "visible at mount" means it really covers us
    const intro = document.querySelector(".em-intro");
    let covered = !!intro && intro.getClientRects().length > 0;
    const onDone = () => {
      if (!covered) return;
      covered = false;
      if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
      for (const el of document.querySelectorAll<HTMLElement>("[data-os-dock]")) {
        if (!el.getClientRects().length) continue;
        el.animate([{ transform: "translateY(calc(100% + 24px))" }, { transform: "translateY(0)" }], {
          duration: 760,
          delay: 140,
          easing: "cubic-bezier(0.22, 1, 0.36, 1)",
          fill: "backwards",
        });
      }
    };
    window.addEventListener("em:intro-done", onDone);
    return () => window.removeEventListener("em:intro-done", onDone);
  }, []);
}
