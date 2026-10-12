"use client";

import { useEffect, useRef } from "react";

/**
 * One transient surface at a time. The menu bar's panels, the Terminal,
 * Spotlight and the right-click menu announce themselves as they open; the
 * others step aside (a menu panel closes when the Terminal, Spotlight or a
 * right-click menu opens; on a phone, where the Terminal is a sheet, it
 * closes when a panel drops down).
 */
export type Surface = "menu" | "terminal" | "palette" | "context";

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
