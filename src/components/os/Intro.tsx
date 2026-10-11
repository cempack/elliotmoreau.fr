"use client";

import "./intro.css";
import { useEffect, useState } from "react";
import dynamic from "next/dynamic";
import { usePathname } from "next/navigation";
import { stripLocale } from "@/i18n/config";
import { restartOS } from "./menubar/util";

const Gate = dynamic(() => import("./intro/Gate"));

/** Restart emOS: back to the Desktop, into the boot. */
export const rebootOS = restartOS;
/** Lock the screen (Spotlight, Terminal, the emOS menu). */
export const lockOS = () => window.dispatchEvent(new CustomEvent("em:lock"));

type Mode = "first" | "relock";

export function Intro() {
  const pathname = usePathname();
  // the boot belongs to arriving on the Desktop, not to a deep link
  const [mode, setMode] = useState<Mode | null>(() => (stripLocale(pathname) === "/" ? "first" : null));
  const [n, setN] = useState(0);

  useEffect(() => {
    const root = document.documentElement;
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (root.dataset.intro === "done" || reduced) {
      root.dataset.intro = "done";
      queueMicrotask(() => setMode((m) => (m === "first" ? null : m)));
    }
    const onLock = () => {
      setMode("relock");
      setN((v) => v + 1);
    };
    window.addEventListener("em:lock", onLock);
    return () => window.removeEventListener("em:lock", onLock);
  }, []);

  if (!mode) return null;
  return <Gate key={`${mode}-${n}`} mode={mode} onDone={() => setMode(null)} />;
}

