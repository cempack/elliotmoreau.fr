"use client";

import { useEffect, useRef, useState } from "react";
import { AnimatePresence, m, useInView } from "motion/react";
import { useI18n } from "@/i18n/client";
import { Glass } from "@/components/os/Glass";
import { scrollToTop } from "@/components/os/dock/launch";
import { EmosMark } from "@/components/os/menubar/glyphs";
import { GLYPH_CHAT, GLYPH_CODE, GLYPH_PLAY, GLYPH_X, PixelGlyph, type Cells } from "@/components/glyphs";
import { PixelLabel } from "@/components/PixelLabel";
import { useToast } from "@/components/Toasts";
import { PressAnchor, PressButton } from "@/components/ui/Pressable";
import { useFinePointer, useReduced } from "@/hooks/env";
import { SOCIALS } from "@/lib/places";
import { spring } from "@/lib/motion";
import { useSound } from "@/lib/sound";
import { PowerOff, reboot } from "./PowerOff";
import { fill } from "./util";

const LINKS: { label: string; href: string; glyph: Cells; handle: string; me?: boolean }[] = [
  { label: "GitHub", href: SOCIALS.github, glyph: GLYPH_CODE, handle: "@cempack" },
  { label: "YouTube", href: SOCIALS.youtube, glyph: GLYPH_PLAY, handle: "@cempack" },
  { label: "Mastodon", href: SOCIALS.mastodon, glyph: GLYPH_CHAT, handle: "@cempack@mastodon.social", me: true },
  { label: "X", href: SOCIALS.x, glyph: GLYPH_X, handle: "@cempack_" },
];

/**
 * Chapter 6, "Shut down": the closing line in giant type (it assembles
 * letter by letter, then on a mouse each letter's weight leans toward the
 * pointer), the address on glass with a copy that confirms, the socials,
 * and the system footer: Shut down powers emOS off like a CRT (PowerOff),
 * Restart replays the boot, the arrow goes home.
 * The veil lifts a little here, so the story ends on the pixel landscape
 * it started from.
 */
export function Finale() {
  const { t } = useI18n();
  const s = t.story.finale;
  const { notify } = useToast();
  const { blip } = useSound();
  const [copied, setCopied] = useState(false);
  const [off, setOff] = useState(false);
  const timer = useRef(0);

  useEffect(() => () => window.clearTimeout(timer.current), []);

  const copy = () => {
    navigator.clipboard?.writeText(SOCIALS.email).catch(() => {});
    notify(s.copiedToast);
    blip("success");
    setCopied(true);
    window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => setCopied(false), 1800);
  };

  const top = () => {
    scrollToTop();
    document.getElementById("content")?.focus({ preventScroll: true });
  };

  return (
    <section className="app-story-fin" data-veil="0.7" aria-labelledby="story-fin-title">
      <div className="app-story-fin-inner">
        <p className="app-story-kicker">
          <span aria-hidden className="app-story-kicker-n">
            <PixelLabel text="06" cell={2} />
          </span>
          <span>{s.kicker}</span>
        </p>
        <h2 id="story-fin-title" className="app-story-fin-title">
          <WeightLine text={s.title} />
        </h2>
        <p className="app-story-fin-sub">{s.sub}</p>

        <Glass thickness="regular" className="app-story-fin-mail">
          <a href={`mailto:${SOCIALS.email}`} className="app-story-fin-addr" aria-label={fill(s.write, { email: SOCIALS.email })}>
            {SOCIALS.email}
          </a>
          <PressButton className="app-story-fin-copy" onClick={copy}>
            <AnimatePresence mode="popLayout" initial={false}>
              <m.span
                key={copied ? "y" : "n"}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -10 }}
                transition={spring.snappy}
              >
                {copied ? s.copied : s.copy}
              </m.span>
            </AnimatePresence>
          </PressButton>
        </Glass>

        <div className="app-story-fin-social">
          <span className="app-story-fin-k">{s.elsewhere}</span>
          <ul>
            {LINKS.map((l) => (
              <li key={l.label}>
                <PressAnchor href={l.href} target="_blank" rel={l.me ? "me noreferrer" : "noreferrer"} className="app-story-fin-link">
                  <PixelGlyph cells={l.glyph} size={14} />
                  <span className="app-story-fin-link-name">{l.label}</span>
                  <span className="app-story-fin-link-handle">{l.handle}</span>
                </PressAnchor>
              </li>
            ))}
          </ul>
        </div>
      </div>

      <footer className="app-story-foot">
        <span className="app-story-foot-made">
          <EmosMark size={14} />
          {s.made}
        </span>
        <span className="app-story-foot-actions">
          <button
            type="button"
            className="app-story-foot-btn"
            aria-label={s.shutDownLabel}
            aria-haspopup="dialog"
            onClick={() => {
              blip("close");
              setOff(true);
            }}
          >
            <svg width="12" height="12" viewBox="0 0 7 7" shapeRendering="crispEdges" fill="currentColor" aria-hidden>
              <rect x="3" y="0" width="1" height="3" />
              <rect x="1" y="1" width="1" height="1" />
              <rect x="5" y="1" width="1" height="1" />
              <rect x="0" y="2" width="1" height="3" />
              <rect x="6" y="2" width="1" height="3" />
              <rect x="1" y="5" width="1" height="1" />
              <rect x="5" y="5" width="1" height="1" />
              <rect x="2" y="6" width="3" height="1" />
            </svg>
            {s.shutDown}
          </button>
          <button type="button" className="app-story-foot-btn" onClick={reboot} aria-label={s.restartLabel}>
            <svg width="12" height="12" viewBox="0 0 7 7" shapeRendering="crispEdges" fill="currentColor" aria-hidden>
              <rect x="2" y="0" width="3" height="1" />
              <rect x="6" y="0" width="1" height="3" />
              <rect x="1" y="1" width="1" height="1" />
              <rect x="5" y="1" width="1" height="1" />
              <rect x="4" y="2" width="3" height="1" />
              <rect x="0" y="2" width="1" height="3" />
              <rect x="6" y="4" width="1" height="1" />
              <rect x="1" y="5" width="1" height="1" />
              <rect x="5" y="5" width="1" height="1" />
              <rect x="2" y="6" width="3" height="1" />
            </svg>
            {s.restart}
          </button>
          <button type="button" className="app-story-foot-btn" onClick={top}>
            {s.top}
            <svg width="11" height="11" viewBox="0 0 7 7" shapeRendering="crispEdges" fill="currentColor" aria-hidden>
              <rect x="3" y="1" width="1" height="6" />
              <rect x="2" y="2" width="1" height="1" />
              <rect x="4" y="2" width="1" height="1" />
              <rect x="1" y="3" width="1" height="1" />
              <rect x="5" y="3" width="1" height="1" />
            </svg>
          </button>
        </span>
      </footer>
      {off && <PowerOff onDone={() => setOff(false)} />}
    </section>
  );
}

const REST = 600;

/**
 * The closing line. Letters rise out of their word masks once in view;
 * then, on a fine pointer, each letter's weight leans toward the pointer
 * (a soft gaussian of the distance), easing back to rest when it leaves.
 * Words reserve their boldest width so the line never rewraps.
 */
function WeightLine({ text }: { text: string }) {
  const ref = useRef<HTMLSpanElement>(null);
  const inView = useInView(ref, { once: true, amount: 0.5 });
  const fine = useFinePointer();
  const reduced = useReduced();
  const live = fine && !reduced;
  const list = text.split(" ");
  let index = 0;

  useEffect(() => {
    const root = ref.current;
    const host = root?.parentElement;
    if (!live || !root || !host) return;
    const chars = Array.from(root.querySelectorAll<HTMLElement>("[data-ch]"));
    let centers: { x: number; y: number }[] = [];
    let raf = 0;
    let px = 0;
    let py = 0;
    const measure = () => {
      centers = chars.map((c) => {
        const r = c.getBoundingClientRect();
        return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
      });
    };
    const paint = () => {
      raf = 0;
      const radius = Math.max(120, host.clientWidth * 0.14);
      chars.forEach((c, i) => {
        const p = centers[i];
        if (!p) return;
        const d = Math.hypot(px - p.x, (py - p.y) * 1.4);
        const w = 300 + 560 * Math.exp(-((d / radius) ** 2));
        c.style.fontVariationSettings = `"wght" ${Math.round(w)}`;
      });
    };
    const enter = () => {
      measure();
      host.dataset.leaning = "";
    };
    const move = (e: PointerEvent) => {
      if (e.pointerType !== "mouse") return;
      if (!centers.length) measure();
      px = e.clientX;
      py = e.clientY;
      if (!raf) raf = requestAnimationFrame(paint);
    };
    const leave = () => {
      cancelAnimationFrame(raf);
      raf = 0;
      delete host.dataset.leaning;
      chars.forEach((c) => (c.style.fontVariationSettings = ""));
    };
    const reset = () => (centers = []);
    host.addEventListener("pointerenter", enter);
    host.addEventListener("pointermove", move, { passive: true });
    host.addEventListener("pointerleave", leave);
    window.addEventListener("scroll", reset, { passive: true });
    window.addEventListener("resize", reset);
    return () => {
      host.removeEventListener("pointerenter", enter);
      host.removeEventListener("pointermove", move);
      host.removeEventListener("pointerleave", leave);
      window.removeEventListener("scroll", reset);
      window.removeEventListener("resize", reset);
      cancelAnimationFrame(raf);
    };
  }, [live]);

  return (
    <>
      <span className="sr-only">{text}</span>
      <span ref={ref} aria-hidden className="app-story-wl" style={{ "--app-story-rest": REST } as React.CSSProperties}>
        {list.map((word, wi) => (
          <span key={wi}>
            {wi > 0 && " "}
            <span className="app-story-wl-word">
              <span className="app-story-wl-ghost">{word}</span>
              <span className="app-story-wl-live">
                {Array.from(word).map((ch, ci, all) => {
                  const i = index++;
                  const end = wi === list.length - 1 && ci === all.length - 1 && /[.!?]/.test(ch);
                  return (
                    <m.span
                      key={i}
                      data-ch=""
                      data-end={end || undefined}
                      className="app-story-wl-ch"
                      initial={{ y: "110%" }}
                      animate={inView ? { y: "0%" } : { y: "110%" }}
                      transition={{ type: "spring", visualDuration: 0.8, bounce: 0, delay: i * 0.028 }}
                    >
                      {ch}
                    </m.span>
                  );
                })}
              </span>
            </span>
          </span>
        ))}
      </span>
    </>
  );
}
