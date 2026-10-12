"use client";

import { useEffect } from "react";
import { usePathname, useRouter } from "next/navigation";
import { useI18n } from "@/i18n/client";
import { APPS, appForPath } from "./apps";

/** what this visit already warmed: a navigation never starts the queue over */
const warmed = new Set<string>();

/** the shell's lazy pieces, warmed after the apps (their first open used to wait for them) */
const CHUNKS: [string, () => Promise<unknown>][] = [
  ["spotlight", () => import("./SpotlightDialog")],
  ["control", () => import("./menubar/ControlCenter")],
  ["notifications", () => import("./menubar/Notifications")],
  ["music", () => import("./menubar/Music")],
  ["about", () => import("./menubar/About")],
  ["placeart", () => import("@/components/apps/atlas/PixelMap")],
];

/**
 * The shell's links don't prefetch as they appear (the Dock, the tab bar,
 * the menu bar and the desktop show every app at once, which used to pull
 * every route's code into the first seconds of a visit). Instead, a beat
 * after the page has loaded, while the main thread is idle, every other
 * app is warmed up, one per idle slot, then the panels' code (Spotlight,
 * Control Center, the notifications...), so opening any of them is
 * instant. The queue runs once per visit, whatever the navigations.
 * Skipped under Data Saver and on 2G/3G.
 */
export function IdlePrefetch() {
  const router = useRouter();
  const { path } = useI18n();
  const current = appForPath(usePathname());
  const here = path(current.path);

  // the app on screen is loaded already
  useEffect(() => {
    warmed.add(`app:${here}`);
  }, [here]);

  useEffect(() => {
    // Data Saver or a slow link: nothing is warmed, an app loads when opened
    const conn = (navigator as Navigator & { connection?: { saveData?: boolean; effectiveType?: string } }).connection;
    if (conn?.saveData || /(^|-)(2g|3g)$/.test(conn?.effectiveType ?? "")) return;
    const queue: [string, () => unknown][] = [
      ...APPS.map((a): [string, () => unknown] => [`app:${path(a.path)}`, () => router.prefetch(path(a.path))]),
      ...CHUNKS.map(([k, load]): [string, () => unknown] => [`chunk:${k}`, () => load().catch(() => warmed.delete(`chunk:${k}`))]),
    ].filter(([k]) => !warmed.has(k));
    let handle = 0;
    let timer = 0;
    let dead = false;
    // Safari has no requestIdleCallback: a timer stands in
    const ric = typeof window.requestIdleCallback === "function";
    const idle = (fn: () => void) => (ric ? window.requestIdleCallback(fn, { timeout: 3000 }) : window.setTimeout(fn, 600));
    const cancel = (h: number) => (ric ? window.cancelIdleCallback(h) : window.clearTimeout(h));
    const next = () => {
      if (dead) return;
      const item = queue.shift();
      if (!item) return;
      const [k, run] = item;
      if (!warmed.has(k)) {
        warmed.add(k);
        run();
      }
      handle = idle(next);
    };
    // a beat after load, so the first interactions keep the network to themselves
    const start = () => (timer = window.setTimeout(() => (handle = idle(next)), 1200));
    if (document.readyState === "complete") start();
    else window.addEventListener("load", start, { once: true });
    return () => {
      dead = true;
      cancel(handle);
      window.clearTimeout(timer);
      window.removeEventListener("load", start);
    };
  }, [router, path]);

  return null;
}
