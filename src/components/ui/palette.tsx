"use client";

import { createContext, startTransition, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import dynamic from "next/dynamic";

type Ctx = { open: () => void; close: () => void; isOpen: boolean };
export const PaletteCtx = createContext<Ctx>({ open: () => {}, close: () => {}, isOpen: false });
export const usePalette = () => useContext(PaletteCtx);

const load = () => import("@/components/os/SpotlightDialog");
const SpotlightDialog = dynamic(load, { ssr: false });

/**
 * Light provider: owns the shortcut and mounts the real palette. Once the
 * page is idle it is built, closed, in the background (a transition React
 * can interrupt), so even the first ⌘K only has to show it; pressed before
 * that, it mounts and opens at once.
 */
export function PaletteProvider({ children }: { children: React.ReactNode }) {
  const [want, setWant] = useState(false);
  const [isOpen, setIsOpen] = useState(false);
  const api = useRef<Ctx | null>(null);
  /** asked for before the palette was there: it opens as soon as it registers */
  const openOnMount = useRef(false);
  const open = useCallback(() => {
    if (api.current) return api.current.open();
    openOnMount.current = true;
    setWant(true);
    // first open on a touch screen: the real field arrives a moment later,
    // but iOS raises its keyboard only for a focus inside the tap itself. A
    // stand-in field takes that focus and hands it on (the keyboard stays up
    // as focus moves from field to field)
    if (window.matchMedia("(pointer: coarse)").matches) {
      const stand = document.createElement("input");
      stand.setAttribute("aria-hidden", "true");
      stand.tabIndex = -1;
      stand.style.cssText = "position:fixed;top:0;left:0;width:1px;height:1px;opacity:0;border:0;padding:0;font-size:16px";
      document.body.appendChild(stand);
      stand.focus({ preventScroll: true });
      window.setTimeout(() => stand.remove(), 2500);
    }
    setIsOpen(true);
  }, []);
  const close = useCallback(() => api.current?.close(), []);
  const setApi = useCallback((a: Ctx) => {
    api.current = a;
    if (openOnMount.current) {
      openOnMount.current = false;
      a.open();
    }
  }, []);

  // warm: the code, then the palette itself (closed), while nothing else is happening
  useEffect(() => {
    let dead = false;
    const ric = typeof window.requestIdleCallback === "function";
    const go = () =>
      load()
        .then(() => !dead && startTransition(() => setWant(true)))
        .catch(() => {});
    const h = ric ? window.requestIdleCallback(go, { timeout: 4000 }) : window.setTimeout(go, 1500);
    return () => {
      dead = true;
      if (ric) window.cancelIdleCallback(h);
      else window.clearTimeout(h);
    };
  }, []);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (api.current) return;
      const t = e.target as HTMLElement | null;
      const typing = !!t?.closest?.("input,textarea,[contenteditable=true]");
      if (((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") || (e.key === "/" && !typing)) {
        e.preventDefault();
        open();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);
  const value = useMemo(() => ({ open, close, isOpen }), [open, close, isOpen]);
  return (
    <PaletteCtx.Provider value={value}>
      {children}
      {want && <SpotlightDialog register={setApi} onState={setIsOpen} />}
    </PaletteCtx.Provider>
  );
}
