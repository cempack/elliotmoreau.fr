"use client";

import Image from "next/image";
import { m, useScroll, useTransform, type MotionStyle } from "motion/react";
import { LangToggle, SoundToggle } from "@/components/ui/Toggles";
import { usePalette } from "@/components/ui/CommandPalette";
import { PressButton } from "@/components/ui/Pressable";
import { lenisRef } from "@/lib/lenisRef";
import { useLiquidGlass, sheenLeave, sheenMove } from "./LiquidGlass";
import { useIsMac, useReduced } from "./env";
import { useGlassCopy } from "./strings";

/** Smooth in-page jump that lands below the floating nav. */
export function jumpTo(id: string) {
  const el = document.getElementById(id);
  if (!el) return;
  if (lenisRef.current) lenisRef.current.scrollTo(el, { offset: id === "top" ? 0 : -96 });
  else el.scrollIntoView({ behavior: "auto", block: "start" });
}

/**
 * Floating glass pill. Starts as clear, thin glass over the night and
 * thickens as content scrolls beneath it (blur, tint and shadow ride one
 * scroll-linked value), the way a toolbar gains material over text.
 */
export function GlassNav() {
  const c = useGlassCopy();
  const { open } = usePalette();
  const isMac = useIsMac();
  const reduced = useReduced();
  const { scrollY } = useScroll();
  const thick = useTransform(scrollY, [0, 320], [0, 1], { clamp: true });
  const { ref, layer } = useLiquidGlass<HTMLElement>({
    radius: "pill",
    bevel: 16,
    strength: 28,
    chroma: 0.06,
  });

  const links = [
    { id: "g-writing", label: c.nav.writing },
    { id: "g-work", label: c.nav.work },
    { id: "g-atlas", label: c.nav.atlas },
    { id: "g-contact", label: c.nav.contact },
  ];

  return (
    <header className="g-nav-wrap">
      <m.nav
        ref={ref}
        aria-label="Primary"
        className="lg lg--thin g-nav"
        style={{ "--thick": reduced ? 0.6 : thick } as MotionStyle}
        onPointerMove={sheenMove}
        onPointerLeave={sheenLeave}
      >
        {layer}
        <a
          href="#top"
          className="g-nav-id"
          onClick={(e) => {
            e.preventDefault();
            jumpTo("top");
          }}
        >
          <Image src="/avatar.jpg" alt="" width={32} height={32} className="g-nav-avatar" priority />
          <span>Elliot Moreau</span>
        </a>
        <ul className="g-nav-links">
          {links.map((l) => (
            <li key={l.id}>
              <a
                href={`#${l.id}`}
                onClick={(e) => {
                  e.preventDefault();
                  jumpTo(l.id);
                }}
              >
                {l.label}
              </a>
            </li>
          ))}
        </ul>
        <div className="g-nav-tools">
          <LangToggle id="glass-lang" className="g-seg" />
          <SoundToggle className="g-icon-btn" labels={{ on: c.soundOn, off: c.soundOff }} />
          <PressButton className="g-kbd-btn" onClick={open} aria-label={c.cmdK} aria-keyshortcuts="Meta+K Control+K">
            <svg width="15" height="15" viewBox="0 0 16 16" fill="none" aria-hidden>
              <circle cx="7" cy="7" r="4.75" stroke="currentColor" strokeWidth="1.6" />
              <path d="m10.5 10.5 3 3" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
            </svg>
            <kbd>{isMac ? "⌘K" : "Ctrl K"}</kbd>
          </PressButton>
        </div>
      </m.nav>
    </header>
  );
}
