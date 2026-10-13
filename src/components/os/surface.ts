"use client";

import { useEffect, useRef } from "react";

/**
 * One transient surface at a time. The menu bar's panels, the Terminal,
 * Spotlight, the right-click menu and the windows overview announce
 * themselves as they open; the others step aside (a menu panel closes when
 * the Terminal, Spotlight or a right-click menu opens; the Terminal and the
 * overview never sit on top of each other; on a phone, where the Terminal
 * is a sheet, it closes when a panel drops down).
 */
export type Surface = "menu" | "terminal" | "palette" | "context" | "overview";

const EVENT = "em:surface";

export function claimSurface(id: Surface) {
  window.dispatchEvent(new CustomEvent<Surface>(EVENT, { detail: id }));
}

/** Calls `onOther(id)` whenever a different surface opens. */
export function useSurfaceYield(self: Surface, onOther: (id: Surface) => void) {
  const cb = useRef(onOther);
  useEffect(() => {
    cb.current = onOther;
  });
  useEffect(() => {
    const on = (e: Event) => {
      const id = (e as CustomEvent<Surface>).detail;
      if (id !== self) cb.current(id);
    };
    window.addEventListener(EVENT, on);
    return () => window.removeEventListener(EVENT, on);
  }, [self]);
}
