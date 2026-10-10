"use client";

import { useState } from "react";
import { AnimatePresence, m, useScroll } from "motion/react";
import { LangToggle, SoundToggle } from "@/components/ui/Toggles";
import { usePalette } from "@/components/ui/CommandPalette";
import { PressButton } from "@/components/ui/Pressable";
import { lenisRef } from "@/lib/lenisRef";
import { spring } from "@/lib/motion";
import { useMotionPick } from "./hooks";
import { CHAPTERS, useJ, type ChapterId } from "./strings";

/** Glide to a chapter through Lenis (or jump natively without it). */
export function goTo(id: string) {
  const el = document.getElementById(id);
  if (!el) return;
  if (lenisRef.current) lenisRef.current.scrollTo(el, { offset: id === "cover" ? 0 : -8 });
  else el.scrollIntoView();
}

const NAV: ChapterId[] = ["writing", "atlas", "work", "listening", "contact"];

/**
 * Minimal masthead: wordmark, chapter links that double as the running
 * head (a hairline slides under the chapter you're reading), ⌘K, language
 * and sound. Transparent over the cover, inked once you start reading.
 */
export function Masthead({ active }: { active: ChapterId }) {
  const { c, j } = useJ();
  const { open } = usePalette();
  const { scrollY } = useScroll();
  const scrolled = useMotionPick(scrollY, (v) => v > 24, false);

  const label: Record<ChapterId, string> = {
    cover: j.chapters.cover,
    signals: j.chapters.signals,
    writing: c.nav.writing,
    atlas: c.nav.atlas,
    work: c.nav.work,
    listening: c.listening,
    contact: c.nav.contact,
  };

  return (
    <header className="j-mast" data-scrolled={scrolled || undefined}>
      <a
        href="#cover"
        className="j-mast-mark"
        onClick={(e) => {
          e.preventDefault();
          goTo("cover");
        }}
      >
        Elliot Moreau
      </a>
      <nav className="j-mast-nav" aria-label="Chapters">
        {NAV.map((id) => {
          const n = CHAPTERS.find((ch) => ch.id === id)?.n;
          const on = active === id;
          return (
            <a
              key={id}
              href={`#${id}`}
              aria-current={on ? "location" : undefined}
              className="j-mast-link"
              onClick={(e) => {
                e.preventDefault();
                goTo(id);
              }}
            >
              <span className="j-mast-n">{n}</span>
              {label[id]}
              {on && <m.span layoutId="j-mast-rule" className="j-mast-rule" transition={spring.default} />}
            </a>
          );
        })}
      </nav>
      <div className="j-mast-tools">
        <PressButton className="j-mast-k" onClick={open} aria-label={c.cmdK} aria-keyshortcuts="Meta+K Control+K">
          <span className="j-mast-k-label">{j.search}</span>
          <kbd>⌘K</kbd>
        </PressButton>
        <LangToggle id="j-lang" className="j-seg" />
        <SoundToggle className="j-mast-sound" labels={{ on: c.soundOn, off: c.soundOff }} />
      </div>
    </header>
  );
}

/**
 * Corner folio: the chapter number rolls like a counter as you read, in
 * the direction you're going.
 */
export function Folio({ active }: { active: ChapterId }) {
  const { j } = useJ();
  const idx = CHAPTERS.findIndex((ch) => ch.id === active);
  const [prev, setPrev] = useState(idx);
  const [dir, setDir] = useState(1);
  // derive scroll direction from the index change (during render, per React docs)
  if (prev !== idx) {
    setDir(idx > prev ? 1 : -1);
    setPrev(idx);
  }
  const ch = CHAPTERS[idx] ?? CHAPTERS[0];
  const total = CHAPTERS[CHAPTERS.length - 1].n;
  return (
    <div className="j-folio" data-hidden={active === "cover" || undefined} aria-hidden>
      <span className="j-folio-label">
        <AnimatePresence initial={false} mode="popLayout" custom={dir}>
          <m.span
            key={ch.id}
            custom={dir}
            variants={roll}
            initial="enter"
            animate="center"
            exit="exit"
            transition={spring.default}
            className="j-folio-roll"
          >
            {j.chapters[ch.id]}
          </m.span>
        </AnimatePresence>
      </span>
      <span className="j-folio-num">
        <AnimatePresence initial={false} mode="popLayout" custom={dir}>
          <m.span
            key={ch.n}
            custom={dir}
            variants={roll}
            initial="enter"
            animate="center"
            exit="exit"
            transition={spring.default}
            className="j-folio-roll"
          >
            {ch.n}
          </m.span>
        </AnimatePresence>
      </span>
      <span className="j-folio-total">/{total}</span>
    </div>
  );
}

const roll = {
  enter: (d: number) => ({ y: d > 0 ? "100%" : "-100%", opacity: 0 }),
  center: { y: "0%", opacity: 1 },
  exit: (d: number) => ({ y: d > 0 ? "-100%" : "100%", opacity: 0 }),
};
