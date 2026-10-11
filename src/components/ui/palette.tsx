"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import dynamic from "next/dynamic";

type Ctx = { open: () => void; close: () => void; isOpen: boolean };
export const PaletteCtx = createContext<Ctx>({ open: () => {}, close: () => {}, isOpen: false });
export const usePalette = () => useContext(PaletteCtx);

const SpotlightDialog = dynamic(() => import("@/components/os/SpotlightDialog"), { ssr: false });

/** Light provider: owns the shortcut and mounts the real palette on first use. */
export function PaletteProvider({ children }: { children: React.ReactNode }) {
  const [want, setWant] = useState(false);
  const [isOpen, setIsOpen] = useState(false);
  const api = useRef<Ctx | null>(null);
  const open = useCallback(() => {
    setWant(true);
    if (api.current) api.current.open();
    else setIsOpen(true);
  }, []);
  const close = useCallback(() => api.current?.close(), []);
  const setApi = useCallback((a: Ctx) => {
    api.current = a;
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
