"use client";

import { useEffect, useState } from "react";

const fmts = new Map<boolean, Intl.DateTimeFormat>();
function fmt(seconds: boolean) {
  let f = fmts.get(seconds);
  if (!f) {
    f = new Intl.DateTimeFormat("en-GB", {
      timeZone: "Europe/Paris",
      hour: "2-digit",
      minute: "2-digit",
      ...(seconds ? { second: "2-digit" } : {}),
      hour12: false,
    });
    fmts.set(seconds, f);
  }
  return f;
}

/**
 * Local time in France, ticking. `null` until mounted so server HTML and
 * first client render agree (no hydration mismatch). The state is the
 * formatted string, so a tick that lands inside the same minute (or
 * second) renders nothing.
 */
export function useHomeTime({ seconds = false }: { seconds?: boolean } = {}) {
  const [time, setTime] = useState<string | null>(null);

  useEffect(() => {
    const tick = () => setTime(fmt(seconds).format(new Date()));
    const first = window.setTimeout(tick, 0);
    const id = window.setInterval(tick, seconds ? 1000 : 15_000);
    return () => {
      window.clearTimeout(first);
      window.clearInterval(id);
    };
  }, [seconds]);

  if (!time) return { time: null, hour: null };
  return { time, hour: Number(time.slice(0, 2)) };
}
