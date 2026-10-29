"use client";

import { useEffect, useRef } from "react";
import { usePathname } from "next/navigation";
import { useI18n } from "@/i18n/client";
import { noteVisit } from "@/lib/visit";

/**
 * Counts a page view for the site's own stats (src/server/stats): the
 * page, the language, the site the visit came from (first page only), the
 * time zone (for the country) and whether the screen is touch. No cookie,
 * nothing stored for the count. Do Not Track or Global Privacy Control
 * turned on: nothing is sent at all. (Each page is also noted in the tab's
 * own record of the visit, lib/visit, which only ever leaves with a letter.)
 */
export function Beacon() {
  const pathname = usePathname();
  const { lang } = useI18n();
  const first = useRef(true);

  useEffect(() => {
    noteVisit(pathname);
    const nav = navigator as Navigator & { globalPrivacyControl?: boolean };
    if (nav.globalPrivacyControl || nav.doNotTrack === "1") return;
    if (/^\/(en\/|fr\/)?admin(\/|$)/.test(pathname)) return;
    // the first page of the visit carries where it came from (until it has been sent)
    const entry = first.current;
    let source: string | undefined;
    if (entry) {
      const q = new URLSearchParams(location.search);
      source = q.get("utm_source") ?? q.get("ref") ?? undefined;
    }
    let tz = "";
    try {
      tz = Intl.DateTimeFormat().resolvedOptions().timeZone;
    } catch {}
    const body = JSON.stringify({
      p: pathname,
      l: lang,
      tz,
      t: navigator.maxTouchPoints > 1 ? 1 : 0,
      ...(entry ? { e: 1, r: document.referrer || undefined, s: source } : {}),
    });
    // after the page has painted: never in the way of what the visitor came for
    const id = window.setTimeout(() => {
      first.current = false;
      const blob = new Blob([body], { type: "text/plain" });
      if (!navigator.sendBeacon?.("/api/hit", blob)) {
        fetch("/api/hit", { method: "POST", body, keepalive: true, headers: { "Content-Type": "text/plain" } }).catch(() => {});
      }
    }, 600);
    return () => window.clearTimeout(id);
  }, [pathname, lang]);

  return null;
}
