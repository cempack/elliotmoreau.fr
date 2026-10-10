"use client";

import { useEffect, useRef, useState } from "react";
import { AnimatePresence, m } from "motion/react";
import { GLYPH_CHAT, GLYPH_CODE, GLYPH_PLAY, GLYPH_X, PixelGlyph, type Cells } from "@/components/glyphs";
import { PressAnchor, PressButton } from "@/components/ui/Pressable";
import { SplitText } from "@/components/ui/SplitText";
import { useToast } from "@/components/Toasts";
import { SOCIALS } from "@/lib/places";
import { useSound } from "@/lib/sound";
import { spring } from "@/lib/motion";
import { GlassPane, useLiquidGlass, sheenLeave, sheenMove } from "./LiquidGlass";
import { Blob } from "./Backdrop";
import { jumpTo } from "./GlassNav";
import { useGlassCopy } from "./strings";

const LINKS: { label: string; href: string; glyph: Cells; handle: string }[] = [
  { label: "GitHub", href: SOCIALS.github, glyph: GLYPH_CODE, handle: "@cempack" },
  { label: "YouTube", href: SOCIALS.youtube, glyph: GLYPH_PLAY, handle: "@cempack" },
  { label: "Mastodon", href: SOCIALS.mastodon, glyph: GLYPH_CHAT, handle: "@cempack" },
  { label: "X", href: SOCIALS.x, glyph: GLYPH_X, handle: "@cempack_" },
];

/** The ending: one big line, the address on glass, a copy that confirms. */
export function GlassFooter() {
  const c = useGlassCopy();
  const { notify } = useToast();
  const { blip } = useSound();
  const [copied, setCopied] = useState(false);
  const timer = useRef(0);
  const { ref, layer } = useLiquidGlass<HTMLDivElement>({
    radius: "pill",
    bevel: 30,
    strength: 48,
    chroma: 0.05,
  });

  useEffect(() => () => window.clearTimeout(timer.current), []);

  const copy = () => {
    navigator.clipboard?.writeText(SOCIALS.email).catch(() => {});
    notify(`${c.copied} · ${SOCIALS.email}`);
    blip("success");
    setCopied(true);
    window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => setCopied(false), 1800);
  };

  return (
    <footer id="g-contact" className="g-foot">
      <Blob tone="moon" className="g-blob--foot-a" speed={90} />
      <Blob tone="glacier" className="g-blob--foot-b" speed={60} />
      <span className="g-eyebrow">{c.nav.contact}</span>
      <h2 className="g-foot-title">
        <SplitText key={c.lang} text={c.hello} by="char" stagger={0.03} />
      </h2>
      <p className="g-foot-sub">{c.helloSub}</p>

      <div
        ref={ref}
        className="lg lg--regular g-mail"
        onPointerMove={sheenMove}
        onPointerLeave={sheenLeave}
      >
        {layer}
        <a href={`mailto:${SOCIALS.email}`} className="g-mail-addr" data-cursor="Mail">
          {SOCIALS.email}
        </a>
        <PressButton className="g-btn g-btn--primary g-mail-copy" onClick={copy} aria-live="polite">
          <AnimatePresence mode="popLayout" initial={false}>
            <m.span
              key={copied ? "y" : "n"}
              initial={{ opacity: 0, y: 8, filter: "blur(4px)" }}
              animate={{ opacity: 1, y: 0, filter: "blur(0px)" }}
              exit={{ opacity: 0, y: -8, filter: "blur(4px)" }}
              transition={spring.snappy}
            >
              {copied ? c.copied : c.copyEmail}
            </m.span>
          </AnimatePresence>
        </PressButton>
      </div>

      <div className="g-socials-wrap">
        <span className="g-socials-k">{c.t("socials")}</span>
        <ul className="g-socials">
          {LINKS.map((l) => (
            <li key={l.label}>
              <PressAnchor
                href={l.href}
                target="_blank"
                rel="me noreferrer"
                className="lg lg--thin g-social"
                onPointerMove={sheenMove}
                onPointerLeave={sheenLeave}
              >
                <GlassPane />
                <PixelGlyph cells={l.glyph} size={14} />
                <span>{l.label}</span>
                <span className="g-social-h">{l.handle}</span>
              </PressAnchor>
            </li>
          ))}
        </ul>
      </div>

      <div className="g-foot-bar">
        <span>{c.madeIn}</span>
        <span className="g-foot-actions">
          <button
            type="button"
            onClick={() => {
              jumpTo("top");
              window.dispatchEvent(new CustomEvent("em:replay"));
            }}
          >
            {c.replay}
          </button>
          <button type="button" onClick={() => jumpTo("top")}>
            {c.t("top")} ↑
          </button>
        </span>
      </div>
    </footer>
  );
}
