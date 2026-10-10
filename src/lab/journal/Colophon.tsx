"use client";

import { useEffect, useRef, useState } from "react";
import { AnimatePresence, m } from "motion/react";
import { SplitText } from "@/components/ui/SplitText";
import { PressButton } from "@/components/ui/Pressable";
import { useToast } from "@/components/Toasts";
import { PixelGlyph, GLYPH_MAIL } from "@/components/glyphs";
import { SOCIALS } from "@/lib/places";
import { useSound } from "@/lib/sound";
import { spring } from "@/lib/motion";
import { goTo } from "./Masthead";
import { useIssue, useReduced } from "./hooks";
import { Kicker } from "./Signals";
import { Rise } from "./Rise";
import { useJ } from "./strings";

const LINKS = [
  { label: "GitHub", href: SOCIALS.github, handle: "@cempack" },
  { label: "YouTube", href: SOCIALS.youtube, handle: "@cempack" },
  { label: "Mastodon", href: SOCIALS.mastodon, handle: "@cempack" },
  { label: "X", href: SOCIALS.x, handle: "@cempack_" },
];

/**
 * Chapter six: a giant "Let's talk" that assembles in view, the address
 * with a copy button, the newsletter, elsewhere, and the colophon as the
 * page's last word.
 */
export function Colophon() {
  const { c, j } = useJ();
  const reduced = useReduced();
  const { notify } = useToast();
  const { blip } = useSound();
  const issue = useIssue();
  const [copied, setCopied] = useState(false);
  const [email, setEmail] = useState("");
  const [sent, setSent] = useState<"idle" | "done" | "bad">("idle");
  const timer = useRef(0);
  useEffect(() => () => window.clearTimeout(timer.current), []);

  const copy = () => {
    navigator.clipboard?.writeText(SOCIALS.email).catch(() => {});
    setCopied(true);
    notify(c.copied);
    blip("success");
    window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => setCopied(false), 1800);
  };

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) {
      setSent("bad");
      return;
    }
    // prototype: visual only — the real form posts to Ghost
    setSent("done");
    blip("success");
  };

  return (
    <section id="contact" data-chapter="contact" className="j-sec j-contact" aria-label={c.nav.contact}>
      <div className="j-wrap">
        <Kicker n="06" label={c.nav.contact} note={j.chapters.contact} />
        {reduced ? (
          <h2 className="j-hello">{c.hello}</h2>
        ) : (
          <SplitText key={c.hello} as="h2" text={c.hello} mode="inView" stagger={0.045} className="j-hello" />
        )}
        <p className="j-hello-sub">{c.helloSub}</p>

        <Rise className="j-email">
          <a href={`mailto:${SOCIALS.email}`} className="j-email-link" data-cursor={c.open}>
            <PixelGlyph cells={GLYPH_MAIL} size={28} className="j-email-glyph" />
            {SOCIALS.email}
          </a>
          <PressButton className="j-btn j-btn-solid j-email-copy" onClick={copy} aria-live="polite">
            <AnimatePresence mode="popLayout" initial={false}>
              <m.span
                key={copied ? "y" : "n"}
                initial={{ y: "100%", opacity: 0 }}
                animate={{ y: "0%", opacity: 1 }}
                exit={{ y: "-100%", opacity: 0 }}
                transition={spring.snappy}
                className="j-email-copy-t"
              >
                {copied ? c.copied : c.copyEmail}
              </m.span>
            </AnimatePresence>
          </PressButton>
        </Rise>

        <div className="j-contact-grid">
          <form className="j-news" onSubmit={submit} noValidate>
            <p className="j-index-k">{c.newsletter}</p>
            <p className="j-news-sub">{c.newsletterSub}</p>
            {sent === "done" ? (
              <m.p
                className="j-news-done"
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                transition={spring.default}
                role="status"
              >
                <em>{j.subscribed}</em>
              </m.p>
            ) : (
              <div className="j-news-field" data-bad={sent === "bad" || undefined}>
                <input
                  type="email"
                  inputMode="email"
                  autoComplete="email"
                  aria-label={c.emailPh}
                  placeholder={c.emailPh}
                  value={email}
                  onChange={(e) => {
                    setEmail(e.target.value);
                    if (sent === "bad") setSent("idle");
                  }}
                />
                <PressButton type="submit" className="j-btn j-btn-solid">
                  {c.subscribe}
                </PressButton>
              </div>
            )}
            {sent === "bad" && (
              <p className="j-news-err" role="alert">
                {j.invalid}
              </p>
            )}
          </form>

          <div className="j-else">
            <p className="j-index-k">{j.elsewhere}</p>
            <ul>
              {LINKS.map((l) => (
                <li key={l.label}>
                  <a href={l.href} target="_blank" rel="noreferrer me" className="j-else-row" data-cursor={c.open}>
                    <span className="j-else-name">{l.label}</span>
                    <span className="j-else-handle">{l.handle}</span>
                    <span className="j-row-arrow" aria-hidden>
                      ↗
                    </span>
                  </a>
                </li>
              ))}
            </ul>
          </div>
        </div>

        <footer className="j-foot">
          <div className="j-foot-col">
            <p className="j-index-k">{j.colophon}</p>
            <p className="j-foot-text">{j.colophonText}</p>
          </div>
          <div className="j-foot-col j-foot-meta">
            <p>
              © {issue?.year ?? ""} {j.rights}
            </p>
            <p className="j-dim">{c.madeIn}</p>
          </div>
          <div className="j-foot-col j-foot-end">
            <PressButton className="j-btn j-btn-line" onClick={() => goTo("cover")}>
              {c.palette.top}
              <span className="j-arrow" aria-hidden>
                ↑
              </span>
            </PressButton>
          </div>
        </footer>
        <p className="j-foot-mark" aria-hidden>
          Elliot Moreau
        </p>
      </div>
    </section>
  );
}
