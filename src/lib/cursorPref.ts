import { useSyncExternalStore } from "react";
import { CURSOR_KEY as KEY } from "./cursor-script";

/**
 * The pixel cursors or the system's own: for anyone whose system cursor is
 * enlarged or recoloured (a custom cursor ignores those settings). Kept in
 * this browser; CURSOR_SCRIPT (lib/cursor-script) applies it before first
 * paint, as html[data-cursor="system"], which hands every --cursor-* back
 * to the system (lib/cursors). Switched from Spotlight.
 */

const listeners = new Set<() => void>();
const read = () => document.documentElement.dataset.cursor === "system";

export function setSystemCursor(on: boolean) {
  if (on) document.documentElement.dataset.cursor = "system";
  else delete document.documentElement.dataset.cursor;
  try {
    if (on) localStorage.setItem(KEY, "system");
    else localStorage.removeItem(KEY);
  } catch {}
  listeners.forEach((l) => l());
}

function subscribe(cb: () => void) {
  listeners.add(cb);
  return () => {
    listeners.delete(cb);
  };
}

export function useSystemCursor() {
  return useSyncExternalStore(subscribe, read, () => false);
}
