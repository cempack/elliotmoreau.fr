"use client";

import "../terminal.css";
import { useCallback, useEffect, useRef, useState } from "react";
import { AnimatePresence } from "motion/react";
import { useFinePointer, useMedia } from "@/hooks/env";
import { useTerminal } from "../Terminal";
import { Session } from "./Session";
import { DesktopWindow, MobileSheet } from "./Frame";

export default function TerminalView() {
  const { open } = useTerminal();
  const phone = useMedia("(max-width: 767px)");
  const fine = useFinePointer();
  const [shaking, setShaking] = useState(false);
  const timer = useRef(0);
  const shake = useCallback(() => {
    window.clearTimeout(timer.current);
    setShaking(true);
    timer.current = window.setTimeout(() => setShaking(false), 560);
  }, []);
  useEffect(() => () => window.clearTimeout(timer.current), []);

  return (
    <AnimatePresence>
      {open &&
        (phone ? (
          <MobileSheet key="sheet" shaking={shaking}>
            <Session mobile autoFocus={fine} onShake={shake} />
          </MobileSheet>
        ) : (
          <DesktopWindow key="window" shaking={shaking}>
            <Session mobile={false} autoFocus={fine} onShake={shake} />
          </DesktopWindow>
        ))}
    </AnimatePresence>
  );
}
