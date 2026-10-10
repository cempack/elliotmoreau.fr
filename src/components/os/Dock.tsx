"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useI18n } from "@/i18n/client";
import { APPS, appForPath } from "./apps";
import { AppIcon } from "./icons";

/**
 * CONTRACT (owner: dock agent)
 * Fixed bottom glass dock. Pixel app icons from APPS (+ separator +
 * Terminal toggle via useTerminal()). Fine pointers: macOS magnification
 * following the pointer on springs (icons grow toward the cursor, neighbors
 * ease), tooltip labels; running/active dot under the current app; press
 * feedback on pointer-down. Navigation uses <Link transitionTypes={["app-open"]}>.
 * Mobile: becomes an iOS-style bottom bar (safe-area aware, 44px+ targets).
 * Keys 1–6 open apps when no input is focused.
 */
export function Dock() {
  const { t, path } = useI18n();
  const active = appForPath(usePathname());
  return (
    <nav aria-label="Dock" className="glass fixed bottom-3 left-1/2 z-50 flex -translate-x-1/2 gap-2 rounded-[24px] p-2">
      {APPS.map((a) => (
        <Link
          key={a.id}
          href={path(a.path)}
          aria-label={t.shell.apps[a.label]}
          aria-current={active.id === a.id ? "page" : undefined}
        >
          <AppIcon app={a.id} size={44} />
        </Link>
      ))}
    </nav>
  );
}
