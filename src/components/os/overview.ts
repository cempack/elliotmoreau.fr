"use client";

import { useSyncExternalStore } from "react";
import { captureCurrent } from "./windowShots";
import { claimSurface } from "./surface";

/**
 * Whether the overview (every open window, over the river) is showing.
 * One flag for the whole shell: the keyboard, a trackpad pinch, Spotlight
 * and the phone's tab bar all open it; the overview closes itself.
 */
let open = false;
const listeners = new Set<() => void>();
const emit = () => listeners.forEach((l) => l());

export function setOverview(v: boolean) {
  if (open === v) return;
  // the window on screen, as it is this instant, before it steps back
  if (v) captureCurrent();
  open = v;
  emit();
  // the Terminal, a menu panel, a right-click menu step aside
  if (v) claimSurface("overview");
}
export const openOverview = () => setOverview(true);
export const closeOverview = () => setOverview(false);

/** a navigation the overview itself started (the current window was closed): it stays */
let stay = false;
export const stayThroughNavigation = () => {
  stay = true;
};
export function takeStay() {
  const v = stay;
  stay = false;
  return v;
}

export function useOverviewOpen() {
  return useSyncExternalStore(
    (cb) => {
      listeners.add(cb);
      return () => {
        listeners.delete(cb);
      };
    },
    () => open,
    () => false
  );
}
