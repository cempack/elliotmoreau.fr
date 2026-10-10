"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useI18n } from "@/i18n/client";
import { appForPath } from "./apps";

/**
 * CONTRACT (owner: menubar agent)
 * Fixed top glass bar (height var(--menubar-h)), above content, below
 * overlays. Left: emOS mark (opens an "About this site" panel: fastfetch-
 * style specs), the current app name, Restart. Right: now-playing mini
 * (eq bars, click → anchored popover), Control Center (sky phase, sound,
 * language), Spotlight (⌘K), clock (Paris; click → Notification Center
 * with live feed + "Paris vs you" time). Thickens with scroll. Condensed
 * on mobile. Popovers originate from their trigger and exit the same way.
 */
export function MenuBar() {
  const { t, path } = useI18n();
  const app = appForPath(usePathname());
  return (
    <header className="glass-thin fixed inset-x-0 top-0 z-50 flex h-[var(--menubar-h)] items-center gap-4 px-4 text-footnote">
      <Link href={path("/")} className="font-semibold">
        {t.shell.os}
      </Link>
      <span className="font-semibold">{t.shell.apps[app.label]}</span>
    </header>
  );
}
