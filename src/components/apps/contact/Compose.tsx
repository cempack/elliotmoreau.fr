"use client";

import { useEffect, useId, useMemo, useRef, useState } from "react";
import { m } from "motion/react";
import { useI18n } from "@/i18n/client";
import { useIsMac, useMedia, useReduced } from "@/hooks/env";
import { useSound } from "@/lib/sound";
import { spring } from "@/lib/motion";
import { lenisRef } from "@/lib/lenisRef";
import { SOCIALS } from "@/lib/places";
import { PixelGlyph } from "@/components/glyphs";
import { PixelLabel } from "@/components/PixelLabel";
import { EmosMark } from "@/components/os/menubar/glyphs";
import { CopyButton } from "./Copy";
import { MAX_LINES, TEXT_CELLS } from "./Envelope";
import { Stage, type StageHandle } from "./Stage";
import { G_INFO, G_SEND } from "./glyphs";
import { MAILTO_SAFE, draftFile, fill, launchMail, letterLines, mailtoHref, plural, slug, wordCount } from "./mail";
import { useDraft } from "./useDraft";

export type Phase = "compose" | "sending" | "sent" | "ready";

const CHIPS = [
  { id: "project", chip: "chipProject", subject: "subjectProject", prompt: "bodyProject" },
  { id: "collab", chip: "chipCollab", subject: "subjectCollab", prompt: "bodyCollab" },
  { id: "hiring", chip: "chipHiring", subject: "subjectHiring", prompt: "bodyHiring" },
  { id: "hi", chip: "chipHi", subject: "subjectHi", prompt: "bodyHi" },
] as const;

/**
 * New message: a Mail compose sheet (To, Subject with quick ideas, the
 * message) beside the envelope it will travel in. The envelope is a live
 * miniature of the draft. Send (or ⌘↵) folds it and flies it into the
 * Dock, then hands the message to the viewer's own mail app through a
 * mailto: link. Nothing is sent from the page, and the UI says so.
 *
 * The draft lives here, not in MailApp, so typing re-renders this sheet
 * only. `formId` lets a Send button outside the form (the window's
 * toolbar on phones) submit it; `onPhase` tells MailApp when to show it.
 */
export function Compose({ formId, onPhase }: { formId: string; onPhase: (p: Phase) => void }) {
  const { t, lang } = useI18n();
  const c = t.contact;
  const state = useDraft();
  const { draft, saved, update } = state;
  const reduced = useReduced();
  // phones aim for the tab bar below: "hold, then flick down"; elsewhere, "throw it into the Dock"
  const coarse = useMedia("(pointer: coarse), (max-width: 767px)");
  const isMac = useIsMac();
  const { blip } = useSound();
  const email = SOCIALS.email;
  const uid = useId();

  const [phase, setPhaseState] = useState<Phase>("compose");
  const [returned, setReturned] = useState(false);
  const [lifted, setLifted] = useState(false);
  /** Paris time the letter left, for the postmark */
  const [postmark, setPostmark] = useState("");
  const liftTimer = useRef(0);
  useEffect(() => () => window.clearTimeout(liftTimer.current), []);
  const go = (p: Phase) => {
    setPhaseState(p);
    onPhase(p);
  };

  const stageRef = useRef<StageHandle>(null);
  const sendRef = useRef<HTMLButtonElement>(null);
  const footRef = useRef<HTMLDivElement>(null);
  const footEndRef = useRef<HTMLSpanElement>(null);
  const subjectRef = useRef<HTMLInputElement>(null);
  const bodyRef = useRef<HTMLTextAreaElement>(null);
  const resultRef = useRef<HTMLHeadingElement>(null);
  const focusNext = useRef<"subject" | "body" | "result" | null>(null);
  /** the subject the visitor typed, kept while a quick idea stands in for it */
  const custom = useRef("");

  const href = mailtoHref(email, draft);
  const words = wordCount(draft.body);
  const wordsLabel = plural(lang, words, c.wordOne, c.words);
  const empty = !draft.subject.trim() && !draft.body.trim();
  const tooLong = href.length > MAILTO_SAFE;
  const activeChip = CHIPS.find((ch) => c[ch.subject] === draft.subject.trim());
  const placeholder = activeChip ? `${c.bodyPlaceholder}\n\n${c[activeChip.prompt]}` : c.bodyPlaceholder;
  const subjectCells = draft.subject.trim() ? Math.max(3, Math.min(10, Math.round(draft.subject.trim().length * 0.36))) : 0;
  const lines = useMemo(() => letterLines(draft.body, MAX_LINES, 34, TEXT_CELLS), [draft.body]);

  // the window subtitle names the file once the draft is saved
  useEffect(() => {
    if (saved) draftFile.set(slug(draft.subject));
  }, [saved, draft.subject]);
  useEffect(() => () => draftFile.set(""), []);

  // focus lands where the last action points, once the new state is on screen
  useEffect(() => {
    const f = focusNext.current;
    if (!f) return;
    focusNext.current = null;
    if (f !== "result") {
      (f === "subject" ? subjectRef.current : bodyRef.current)?.focus();
      return;
    }
    const h = resultRef.current;
    const card = h?.closest<HTMLElement>(".app-contact-result");
    if (!h || !card) return;
    // keep the confirmation clear of the sticky title bar before focusing it
    const top = parseFloat(getComputedStyle(card).scrollMarginTop) || 0;
    const r = card.getBoundingClientRect();
    if (r.top < top || r.top > window.innerHeight * 0.55) {
      const y = Math.max(0, window.scrollY + r.top - top);
      const l = lenisRef.current;
      if (l) l.scrollTo(y, reduced ? { immediate: true } : { duration: 0.6 });
      else window.scrollTo({ top: y, behavior: reduced ? "auto" : "smooth" });
    }
    h.focus({ preventScroll: true });
  }, [phase, reduced]);

  // the footer pins above the Dock while the card runs below the fold; it gets its own material only then
  useEffect(() => {
    const foot = footRef.current;
    const end = footEndRef.current;
    if (!foot || !end || phase !== "compose") return;
    let io: IntersectionObserver | null = null;
    let raf = 0;
    const observe = () => {
      io?.disconnect();
      const pin = parseFloat(getComputedStyle(foot).bottom);
      if (getComputedStyle(foot).position !== "sticky" || Number.isNaN(pin)) {
        delete foot.dataset.stuck;
        return;
      }
      io = new IntersectionObserver(
        ([en]) => {
          if (!en.isIntersecting && en.rootBounds && en.boundingClientRect.top > en.rootBounds.bottom) foot.dataset.stuck = "";
          else delete foot.dataset.stuck;
        },
        { rootMargin: `0px 0px ${-Math.round(pin) - 1}px 0px`, threshold: 0 }
      );
      io.observe(end);
    };
    const onResize = () => {
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(observe);
    };
    observe();
    window.addEventListener("resize", onResize);
    return () => {
      io?.disconnect();
      cancelAnimationFrame(raf);
      window.removeEventListener("resize", onResize);
    };
  }, [phase]);

  const typing = () => {
    setLifted(true);
    window.clearTimeout(liftTimer.current);
    liftTimer.current = window.setTimeout(() => setLifted(false), 900);
  };

  /** the envelope is nearly in the Dock (or sealed in place): over to the mail app */
  const land = () => {
    state.sent();
    setPostmark(
      new Intl.DateTimeFormat("en-GB", { timeZone: "Europe/Paris", hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).format(
        new Date()
      )
    );
    const opened = launchMail(href);
    focusNext.current = "result";
    go(opened ? "sent" : "ready");
  };

  const send = () => {
    if (phase !== "compose") return;
    window.clearTimeout(liftTimer.current);
    setLifted(false);
    if (!reduced) {
      go("sending");
      blip("close");
    }
    stageRef.current?.send();
  };

  const backToCompose = (clear: boolean) => {
    if (clear) state.clear();
    else state.restore();
    focusNext.current = clear ? "subject" : "body";
    setReturned(true);
    go("compose");
    stageRef.current?.reset();
    blip("open");
  };

  const pickChip = (ch: (typeof CHIPS)[number], viaPointer: boolean) => {
    const on = activeChip?.id === ch.id;
    if (!activeChip) custom.current = draft.subject;
    // off again: whatever the visitor had typed comes back
    update({ subject: on ? custom.current : c[ch.subject] });
    blip("tick");
    typing();
    if (!on && viaPointer && !draft.body.trim()) bodyRef.current?.focus();
  };

  const busy = phase === "sending";
  const done = phase === "sent" || phase === "ready";
  const keys = isMac ? "⌘↵" : "Ctrl ↵";

  return (
    <div className="app-contact-compose">
      <div className="app-contact-intro">
        <header className="app-contact-head">
          <p className="app-contact-eyebrow">{c.composeEyebrow}</p>
          <h2 className="app-contact-title">{c.composeTitle}</h2>
        </header>
        <p className="app-contact-lead">{c.composeLead}</p>
      </div>

      <div className="app-contact-stagecol">
        <Stage
          ref={stageRef}
          subject={subjectCells}
          lines={lines}
          lifted={lifted}
          interactive={phase === "compose" && !reduced}
          reduced={reduced}
          coarse={coarse}
          empty={empty}
          origin={() => {
            const own = sendRef.current?.getBoundingClientRect();
            if (own?.width) return own;
            return document.querySelector(`[form="${formId}"]`)?.getBoundingClientRect() ?? null;
          }}
          onThrow={() => {
            window.clearTimeout(liftTimer.current);
            setLifted(false);
            go("sending");
          }}
          onLand={land}
        />
      </div>

      {!done ? (
        <m.form
          key="compose"
          id={formId}
          className="app-contact-card app-contact-sheet"
          aria-label={c.composeLabel}
          aria-busy={busy || undefined}
          initial={returned ? (reduced ? { opacity: 0 } : { opacity: 0, y: 14 }) : false}
          animate={{ opacity: 1, y: 0 }}
          transition={reduced ? { duration: 0.15 } : spring.gentle}
          onSubmit={(e) => {
            e.preventDefault();
            send();
          }}
          onKeyDown={(e) => {
            if (e.key === "Enter" && (e.metaKey || e.ctrlKey) && !e.nativeEvent.isComposing) {
              e.preventDefault();
              send();
            }
          }}
        >
          <div className="app-contact-row">
            <span className="app-contact-row-label" id={`${uid}-to`}>
              {c.to}
            </span>
            <div className="app-contact-to" role="group" aria-labelledby={`${uid}-to`}>
              <span className="app-contact-to-chip">
                <span className="app-contact-avatar" aria-hidden>
                  <EmosMark size={14} />
                </span>
                <span className="app-contact-to-name">{c.me}</span>
                <span className="app-contact-to-addr">{email}</span>
              </span>
              <CopyButton
                text={email}
                ok={c.copied}
                fail={fill(c.copyFailed, { email })}
                label={fill(c.copyAddressLabel, { email })}
                className="app-contact-iconbtn"
              />
            </div>
          </div>

          <div className="app-contact-row app-contact-row--subject">
            <label className="app-contact-row-label" htmlFor={`${uid}-subject`}>
              {c.subject}
            </label>
            <input
              ref={subjectRef}
              id={`${uid}-subject`}
              className="app-contact-input"
              type="text"
              name="subject"
              autoComplete="off"
              enterKeyHint="next"
              maxLength={160}
              value={draft.subject}
              placeholder={c.subjectPlaceholder}
              readOnly={busy}
              onChange={(e) => {
                update({ subject: e.target.value });
                typing();
              }}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.metaKey && !e.ctrlKey && !e.nativeEvent.isComposing) {
                  e.preventDefault();
                  bodyRef.current?.focus();
                }
              }}
            />
          </div>

          <div className="app-contact-chips" role="group" aria-label={c.subjectIdeas}>
            {CHIPS.map((ch) => (
              <button
                key={ch.id}
                type="button"
                className="app-contact-chip"
                aria-pressed={activeChip?.id === ch.id}
                disabled={busy}
                onClick={(e) => pickChip(ch, e.detail > 0)}
              >
                {activeChip?.id === ch.id && (
                  <m.span
                    layoutId={reduced ? undefined : "app-contact-chip-thumb"}
                    className="app-contact-chip-thumb"
                    transition={spring.snappy}
                    aria-hidden
                  />
                )}
                <span className="app-contact-chip-label">{c[ch.chip]}</span>
              </button>
            ))}
          </div>

          <div className="app-contact-body">
            <label className="sr-only" htmlFor={`${uid}-body`}>
              {c.message}
            </label>
            <textarea
              ref={bodyRef}
              id={`${uid}-body`}
              className="app-contact-textarea"
              name="body"
              rows={9}
              value={draft.body}
              placeholder={placeholder}
              readOnly={busy}
              onChange={(e) => {
                update({ body: e.target.value });
                typing();
              }}
            />
          </div>

          {tooLong && (
            <div className="app-contact-long" role="note">
              <p>{c.longNote}</p>
              <CopyButton
                text={`${draft.subject.trim() ? `${draft.subject.trim()}\n\n` : ""}${draft.body}`}
                ok={c.copiedMessage}
                fail={c.copyMessageFailed}
                className="app-contact-btn app-contact-btn--small"
              >
                <span>{c.copyMessage}</span>
              </CopyButton>
            </div>
          )}

          <div ref={footRef} className="app-contact-foot">
            <span className="sr-only" aria-live="polite">
              {busy ? c.flying : ""}
            </span>
            <p className="app-contact-status">
              {busy ? (
                <span className="app-contact-status-busy">{c.flying}</span>
              ) : empty ? (
                <span className="app-contact-status-opens">
                  <PixelGlyph cells={G_INFO} size={10} />
                  <span>{c.opensMail}</span>
                </span>
              ) : (
                <>
                  <span className="tabular">{wordsLabel}</span>
                  {saved && (
                    <>
                      <span aria-hidden> · </span>
                      <span className="app-contact-status-saved">{c.draftSaved}</span>
                    </>
                  )}
                </>
              )}
            </p>
            <button
              ref={sendRef}
              type="submit"
              className="app-contact-btn app-contact-btn--primary app-contact-send"
              aria-label={c.sendLabel}
              aria-keyshortcuts={isMac ? "Meta+Enter" : "Control+Enter"}
              disabled={busy}
            >
              <PixelGlyph cells={G_SEND} size={12} />
              <span>{c.send}</span>
              <kbd className="app-contact-kbd" aria-hidden>
                {keys}
              </kbd>
            </button>
          </div>
          <span ref={footEndRef} className="app-contact-foot-end" aria-hidden />
        </m.form>
      ) : (
        <m.section
          key="result"
          className="app-contact-card app-contact-result"
          aria-labelledby={`${uid}-result`}
          initial={reduced ? { opacity: 0 } : { opacity: 0, y: 14 }}
          animate={{ opacity: 1, y: 0 }}
          transition={reduced ? { duration: 0.15 } : spring.gentle}
        >
          <p className="app-contact-eyebrow app-contact-eyebrow--signal">
            {phase === "sent" ? c.sentEyebrow : c.readyEyebrow}
          </p>
          <h3 id={`${uid}-result`} ref={resultRef} tabIndex={-1} className="app-contact-result-title">
            {phase === "sent" ? c.sentTitle : c.readyTitle}
          </h3>
          <p className="app-contact-result-body">{phase === "sent" ? c.sentBody : c.readyBody}</p>
          <p className="app-contact-result-summary">
            <span className="app-contact-result-subject">{draft.subject.trim() || c.noSubject}</span>
            <span aria-hidden> · </span>
            <span className="tabular">{wordsLabel}</span>
            {postmark && (
              <span className="app-contact-postmark" aria-hidden>
                <PixelLabel text={`Paris ${postmark}`} cell={2} />
              </span>
            )}
          </p>
          <div className="app-contact-actions">
            <a
              href={href}
              className={`app-contact-btn ${phase === "ready" ? "app-contact-btn--primary" : ""}`}
              onClick={() => {
                if (phase === "ready") go("sent");
              }}
            >
              <PixelGlyph cells={G_SEND} size={12} />
              <span>{phase === "sent" ? c.openAgain : c.openMail}</span>
            </a>
            <button type="button" className="app-contact-btn" onClick={() => backToCompose(false)}>
              {c.editMessage}
            </button>
            <button type="button" className="app-contact-btn app-contact-btn--ghost" onClick={() => backToCompose(true)}>
              {c.newMessage}
            </button>
          </div>
          <p className="app-contact-result-note">
            <span>{fill(c.nothingOpened, { email })}</span>
            <CopyButton
              text={email}
              ok={c.copied}
              fail={fill(c.copyFailed, { email })}
              label={fill(c.copyAddressLabel, { email })}
              className="app-contact-iconbtn"
            />
          </p>
        </m.section>
      )}

      <p className="app-contact-honest">
        <PixelGlyph cells={G_INFO} size={12} />
        <span>{c.honest}</span>
      </p>

      <div className="app-contact-reply app-contact-reply--inline">
        <p>{c.replyNote}</p>
        <p>{c.langNote}</p>
      </div>
    </div>
  );
}
