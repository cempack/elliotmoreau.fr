"use client";

import Link from "next/link";
import { useI18n } from "@/i18n/client";
import { APPS, type AppId } from "./apps";

/**
 * CONTRACT (owner: window agent)
 * The frame every app page renders inside. Glass window with a title bar:
 * traffic lights (close/minimize → home with the "app-close" transition,
 * zoom → toggles full-bleed width), title, optional `toolbar` slot (right
 * side of the title bar) and optional `sidebar` slot (left column on ≥lg,
 * collapses to a top segmented row on mobile). The title bar is sticky.
 * Physical: grab the title bar and the window follows 1:1 with rubber-band
 * resistance; fling it down hard (projected past a threshold) to close it
 * into the dock, otherwise it springs home carrying the release velocity.
 * Wraps content in <ViewTransition> so app-open/app-close types animate
 * the window from/to the dock. Under reduced motion: cross-fade only.
 */
export function AppWindow({
  app,
  title,
  toolbar,
  sidebar,
  children,
  className = "",
}: {
  app: AppId;
  title?: string;
  toolbar?: React.ReactNode;
  sidebar?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
}) {
  const { t, path } = useI18n();
  const def = APPS.find((a) => a.id === app)!;
  return (
    <section
      aria-labelledby={`win-${app}`}
      className={`glass mx-auto my-[calc(var(--menubar-h)+1.5rem)] w-[min(1280px,calc(100vw-2rem))] rounded-[var(--radius-window)] ${className}`}
    >
      <div className="flex items-center gap-3 border-b border-[var(--hairline)] px-4 py-3">
        <Link href={path("/")} aria-label={t.shell.window.close} className="h-3 w-3 rounded-full bg-flare" />
        <h1 id={`win-${app}`} className="text-headline font-semibold">
          {title ?? t.shell.apps[def.label]}
        </h1>
        <div className="ml-auto">{toolbar}</div>
      </div>
      <div className="flex">
        {sidebar && <aside className="hidden w-60 shrink-0 border-r border-[var(--hairline)] p-4 lg:block">{sidebar}</aside>}
        <div className="min-w-0 flex-1">{children}</div>
      </div>
    </section>
  );
}
