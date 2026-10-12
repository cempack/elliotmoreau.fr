"use client";

import "./intro.css";
import { useEffect, useState } from "react";
import dynamic from "next/dynamic";
import { usePathname } from "next/navigation";
import { stripLocale } from "@/i18n/config";
import { restartOS } from "./menubar/util";

const Gate = dynamic(() => import("./intro/Gate"));
const Off = dynamic(() => import("./intro/Off"));

/** Restart emOS: back to the Desktop, into the boot. */
export const rebootOS = restartOS;
/** Shut emOS down (Spotlight, Terminal, the emOS menu): the screen goes dark, a power button turns it back on. */
export const shutdownOS = () => window.dispatchEvent(new CustomEvent("em:shutdown"));

export function Intro() {
  const pathname = usePathname();
  // the arrival belongs to landing on the Desktop, not to a deep link
  const [boot, setBoot] = useState(() => stripLocale(pathname) === "/");
  const [off, setOff] = useState(false);

  useEffect(() => {
    const root = document.documentElement;
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (root.dataset.intro === "done" || reduced) {
      root.dataset.intro = "done";
      queueMicrotask(() => setBoot(false));
    }
    const onOff = () => setOff(true);
    window.addEventListener("em:shutdown", onOff);
    return () => window.removeEventListener("em:shutdown", onOff);
  }, []);

  return (
    <>
      {boot && <Gate onDone={() => setBoot(false)} />}
      {off && <Off />}
    </>
  );
}
