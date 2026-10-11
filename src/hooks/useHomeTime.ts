"use client";

import { useEffect, useState } from "react";

/**
 * Local time in France, ticking. `null` until mounted so server HTML and
 * first client render agree (no hydration mismatch).
 */
export function useHomeTime({ seconds = false }: { seconds?: boolean } = {}) {
  const [now, setNow] = useState<Date | null>(null);

  useEffect(() => {
    const tick = () => setNow(new Date());
    const first = window.setTimeout(tick, 0);
    const id = window.setInterval(tick, seconds ? 1000 : 15_000);
    return () => {
      window.clearTimeout(first);
      window.clearInterval(id);
    };
  }, [seconds]);

  if (!now) return { time: null, hour: null };
  const fmt = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Europe/Paris",
    hour: "2-digit",
    minute: "2-digit",
    ...(seconds ? { second: "2-digit" } : {}),
    hour12: false,
  });
  const time = fmt.format(now);
  const hour = Number(time.slice(0, 2));
  return { time, hour };
}
