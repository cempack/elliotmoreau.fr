"use client";

import { useEffect, useRef, useState } from "react";
import { useI18n } from "@/i18n/client";
import { PixelGlyph, type Cells } from "@/components/glyphs";
import { restartOS } from "../menubar/util";

/** the power symbol, in 7×7 */
const G_POWER: Cells = [
  [3, 0], [1, 1], [3, 1], [5, 1], [0, 2], [3, 2], [6, 2], [0, 3], [6, 3], [0, 4], [6, 4], [1, 5], [5, 5], [2, 6], [3, 6], [4, 6],
];
/** the screen has gone dark by then: the power button comes up */
const DARK_MS = 900;

/**
 * Shut Down: the screen goes dark like a display powering off, and stays
 * dark with one power button. Pressing it (or any key) turns emOS back on:
 * the boot, the old way, then the Desktop.
 */
export default function Off() {
  const { t } = useI18n();
  const s = t.system.intro.off;
  const [dark, setDark] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const btnRef = useRef<HTMLButtonElement>(null);
  const on = useRef(false);

  const powerOn = () => {
    if (on.current) return;
    on.current = true;
    restartOS();
  };
  const powerRef = useRef(powerOn);
  useEffect(() => {
    powerRef.current = powerOn;
  });

  // nothing underneath answers any more
  useEffect(() => {
    const el = rootRef.current;
    const parent = el?.parentElement;
    if (!el || !parent) return;
    const others = Array.from(parent.children).filter((n) => n !== el && !n.hasAttribute("inert"));
    others.forEach((n) => n.setAttribute("inert", ""));
    const id = window.setTimeout(() => setDark(true), DARK_MS);
    return () => {
      window.clearTimeout(id);
      others.forEach((n) => n.removeAttribute("inert"));
    };
  }, []);

  // once dark: the button takes the keyboard, and any key turns it on
  useEffect(() => {
    if (!dark) return;
    btnRef.current?.focus({ preventScroll: true });
    const onKey = (e: KeyboardEvent) => {
      if (e.repeat || e.metaKey || e.ctrlKey || e.altKey || e.key === "Tab" || e.key === "Shift") return;
      e.preventDefault();
      powerRef.current();
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, [dark]);

  return (
    <div ref={rootRef} className="os-off" role="dialog" aria-modal="true" aria-label={s.label} data-dark={dark || undefined}>
      {dark && (
        <div className="os-off-ui">
          <button ref={btnRef} type="button" className="os-off-power" aria-label={s.power} onClick={powerOn}>
            <PixelGlyph cells={G_POWER} size={28} />
          </button>
          <p className="os-off-hint">
            <span className="os-off-hint-key">{s.hint}</span>
            <span className="os-off-hint-touch">{s.hintTouch}</span>
          </p>
        </div>
      )}
    </div>
  );
}
