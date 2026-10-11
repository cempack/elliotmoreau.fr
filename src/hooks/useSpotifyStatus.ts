"use client";

import { useMemo, useSyncExternalStore } from "react";
import type { SpotifyStatus } from "@/lib/spotify";

/**
 * One live now-playing feed for the whole OS. Every consumer (menu bar,
 * mini player, Now, Mail, Terminal, the Desktop story) reads the same
 * module-level store, so they can never disagree.
 *
 * - Until the first poll answers, everyone shows the server's seed.
 * - The first subscriber starts ONE poller: it fetches right away, then
 *   every 30s while the tab is visible, and again when the tab comes back
 *   (if the last answer is stale). The last unsubscribe stops it.
 * - When the endpoint says it's disabled (no tokens, as in dev) or fails,
 *   the last good value (or the seed) stays.
 */
const POLL_MS = 30_000;
/** a returning tab or a remount refetches only past this age */
const STALE_MS = 15_000;

let live: SpotifyStatus | null | undefined; // undefined: no answer yet
let lastFetch = 0;
let inflight = false;
let timer = 0;
const listeners = new Set<() => void>();

function load(force = false) {
  if (inflight || document.hidden) return;
  if (!force && performance.now() - lastFetch < STALE_MS && lastFetch > 0) return;
  inflight = true;
  lastFetch = performance.now();
  fetch("/api/spotify/status", { cache: "no-store" })
    .then((r) => (r.ok ? r.json() : null))
    .then((j: SpotifyStatus | { disabled: true } | null) => {
      if (!j || "disabled" in j) return;
      live = j;
      listeners.forEach((l) => l());
    })
    .catch(() => {})
    .finally(() => {
      inflight = false;
    });
}

const onVisibility = () => {
  if (!document.hidden) load();
};

function subscribe(listener: () => void) {
  listeners.add(listener);
  if (listeners.size === 1) {
    load();
    timer = window.setInterval(() => load(true), POLL_MS);
    document.addEventListener("visibilitychange", onVisibility);
  }
  return () => {
    listeners.delete(listener);
    if (listeners.size === 0) {
      window.clearInterval(timer);
      document.removeEventListener("visibilitychange", onVisibility);
    }
  };
}

/** Live now-playing, seeded from server data (`useSiteData().spotify`). */
export function useSpotifyStatus(seed: SpotifyStatus | null) {
  const status = useSyncExternalStore(
    subscribe,
    () => (live === undefined ? seed : live),
    () => seed
  );
  return useMemo(
    () => ({
      status,
      track: status?.now ?? status?.recent ?? null,
      playing: Boolean(status?.now?.playing),
    }),
    [status]
  );
}
