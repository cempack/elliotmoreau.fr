"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";

/**
 * The sky follows the real time in Paris: dawn, day, dusk, night. The
 * wallpaper, glass tints and a few accents read `html[data-sky]`. A head
 * script (SKY_SCRIPT) sets it before first paint so there is no flash;
 * Control Center can pin a phase ("mode"), persisted in localStorage.
 */
export type SkyPhase = "dawn" | "day" | "dusk" | "night";
export type SkyMode = "auto" | SkyPhase;

export const SKY_PHASES: SkyPhase[] = ["dawn", "day", "dusk", "night"];

/** Paris hour (0–23, fractional) → phase. */
export function phaseForHour(h: number): SkyPhase {
  if (h >= 5.5 && h < 8.5) return "dawn";
  if (h >= 8.5 && h < 17.5) return "day";
  if (h >= 17.5 && h < 21) return "dusk";
  return "night";
}

export function parisHour(d = new Date()) {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Europe/Paris",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).formatToParts(d);
  const h = Number(parts.find((p) => p.type === "hour")?.value ?? 0);
  const m = Number(parts.find((p) => p.type === "minute")?.value ?? 0);
  return (h % 24) + m / 60;
}

/** Inline, pre-paint: mirrors phaseForHour + the saved mode. Keep in sync. */
export const SKY_SCRIPT = `try{var m=localStorage.getItem("em-sky")||"auto";var p=m;if(m==="auto"){var f=new Intl.DateTimeFormat("en-GB",{timeZone:"Europe/Paris",hour:"2-digit",minute:"2-digit",hour12:false}).formatToParts(new Date());var h=+f.find(function(x){return x.type==="hour"}).value%24+(+f.find(function(x){return x.type==="minute"}).value)/60;p=h>=5.5&&h<8.5?"dawn":h>=8.5&&h<17.5?"day":h>=17.5&&h<21?"dusk":"night"}document.documentElement.dataset.sky=p;document.documentElement.dataset.skyMode=m}catch(e){}`;

type SkyCtx = { phase: SkyPhase; mode: SkyMode; setMode: (m: SkyMode) => void; hour: number | null };
const Ctx = createContext<SkyCtx>({ phase: "night", mode: "auto", setMode: () => {}, hour: null });

export function SkyProvider({ children }: { children: React.ReactNode }) {
  const [mode, setModeState] = useState<SkyMode>("auto");
  const [hour, setHour] = useState<number | null>(null);

  useEffect(() => {
    const read = () => {
      let m: SkyMode = "auto";
      try {
        const saved = localStorage.getItem("em-sky") as SkyMode | null;
        if (saved) m = saved;
      } catch {}
      setModeState(m);
      setHour(parisHour());
    };
    const first = window.setTimeout(read, 0);
    const id = window.setInterval(() => setHour(parisHour()), 60_000);
    return () => {
      window.clearTimeout(first);
      window.clearInterval(id);
    };
  }, []);

  const phase: SkyPhase = mode === "auto" ? (hour == null ? "night" : phaseForHour(hour)) : mode;

  useEffect(() => {
    if (hour == null && mode === "auto") return;
    document.documentElement.dataset.sky = phase;
    document.documentElement.dataset.skyMode = mode;
  }, [phase, mode, hour]);

  const setMode = useCallback((m: SkyMode) => {
    setModeState(m);
    try {
      localStorage.setItem("em-sky", m);
    } catch {}
  }, []);

  const value = useMemo(() => ({ phase, mode, setMode, hour }), [phase, mode, setMode, hour]);
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export const useSky = () => useContext(Ctx);
