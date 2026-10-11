"use client";

import { useEffect } from "react";
import { usePathname, useRouter } from "next/navigation";
import { useI18n } from "@/i18n/client";
import { APPS, appForPath } from "./apps";

/**
 * The shell's links don't prefetch as they appear (the Dock, the tab bar,
 * the menu bar and the desktop show every app at once, which used to pull
 * every route's code into the first seconds of a visit). Instead, once the
 * page has loaded (and a beat more) and the main thread is idle, each
 * other app is warmed up, one per idle slot, so opening it is still
 * instant. Skipped under Data Saver and on 2G/3G.
 */
export function IdlePrefetch() {
  const router = useRouter();
  const { path } = useI18n();
  const current = appForPath(usePathname()).id;

  useEffect(() => {
    // Data Saver or a slow link: nothing is warmed, an app loads when opened
    const conn = (navigator as Navigator & { connection?: { saveData?: boolean; effectiveType?: string } }).connection;
    if (conn?.saveData || /(^|-)(2g|3g)$/.test(conn?.effectiveType ?? "")) return;
    const queue = APPS.filter((a) => a.id !== current).map((a) => path(a.path));
    let handle = 0;
    let timer = 0;
    let dead = false;
    // Safari has no requestIdleCallback: a timer stands in
    const ric = typeof window.requestIdleCallback === "function";
    const idle = (fn: () => void) => (ric ? window.requestIdleCallback(fn, { timeout: 4000 }) : window.setTimeout(fn, 1200));
    const cancel = (h: number) => (ric ? window.cancelIdleCallback(h) : window.clearTimeout(h));
    const next = () => {
      if (dead) return;
      const url = queue.shift();
      if (!url) return;
      router.prefetch(url);
      handle = idle(next);
    };
    // a beat after load, so the first interactions keep the network to themselves
    const start = () => (timer = window.setTimeout(() => (handle = idle(next)), 2500));
    if (document.readyState === "complete") start();
    else window.addEventListener("load", start, { once: true });
    return () => {
      dead = true;
      cancel(handle);
      window.clearTimeout(timer);
      window.removeEventListener("load", start);
    };
  }, [router, path, current]);

  return null;
}
