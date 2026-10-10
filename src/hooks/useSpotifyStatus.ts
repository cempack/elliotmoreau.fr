"use client";

import { useEffect, useState } from "react";
import type { SpotifyStatus } from "@/lib/spotify";

/**
 * Live now-playing, seeded from server data. Polls every 30s while the tab
 * is visible; keeps the seed when the endpoint says it's disabled (dev).
 */
export function useSpotifyStatus(initial: SpotifyStatus | null) {
  const [status, setStatus] = useState(initial);

  useEffect(() => {
    let alive = true;
    const load = () => {
      if (document.hidden) return;
      fetch("/api/spotify/status")
        .then((r) => (r.ok ? r.json() : null))
        .then((j: SpotifyStatus | { disabled: true } | null) => {
          if (alive && j && !("disabled" in j)) setStatus(j);
        })
        .catch(() => {});
    };
    const id = window.setInterval(load, 30_000);
    document.addEventListener("visibilitychange", load);
    return () => {
      alive = false;
      window.clearInterval(id);
      document.removeEventListener("visibilitychange", load);
    };
  }, []);

  const track = status?.now ?? status?.recent ?? null;
  const playing = Boolean(status?.now?.playing);
  return { status, track, playing };
}
