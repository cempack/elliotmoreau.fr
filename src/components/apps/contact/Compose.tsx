"use client";

import { useEffect, useId, useMemo, useRef, useState } from "react";
import { m } from "motion/react";
import { useI18n } from "@/i18n/client";
import { useIsMac, useMedia, useReduced } from "@/hooks/env";
import { useSound } from "@/lib/sound";
import { spring } from "@/lib/motion";
import { SOCIALS } from "@/lib/places";
import { PixelGlyph } from "@/components/glyphs";
import { EmosMark } from "@/components/os/menubar/glyphs";
import { CopyButton } from "./Copy";
import { MAX_LINES, TEXT_CELLS } from "./Envelope";
import { Stage, type StageHandle } from "./Stage";
import { G_INFO, G_SEND } from "./glyphs";
import { MAILTO_SAFE, fill, launchMail, letterLines, mailtoHref, wordCount } from "./mail";
import type { useDraft } from "./useDraft";

type Phase = "compose" | "sending" | "sent" | "ready";

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
 */
export function Compose({ state }: { state: ReturnType<typeof useDraft> }) {
  const { t } = useI18n();
  const c = t.contact;
  const { draft, saved, update } = state;
  const reduced = useReduced();
  const coarse = useMedia("(pointer: coarse)");
  const isMac = useIsMac();
  const { blip } = useSound();
  const email = SOCIALS.email;
  const uid = useId();

  const [phase, setPhase] = useState<Phase>("compose");
  const [returned, setReturned] = useState(false);
  const [lifted, setLifted] = useState(false);
  const liftTimer = useRef(0);
  useEffect(() => () => window.clearTimeout(liftTimer.current), []);

  const stageRef = useRef<StageHandle>(null);
  const sendRef = useRef<HTMLButtonElement>(null);
  const subjectRef = useRef<HTMLInputElement>(null);
  const bodyRef = useRef<HTMLTextAreaElement>(null);
  const resultRef = useRef<HTMLHeadingElement>(null);
  const focusNext = useRef<"subject" | "body" | "result" | null>(null);

  const href = mailtoHref(email, draft);
  const words = wordCount(draft.body);
  const wordsLabel = words === 1 ? c.word : fill(c.words, { n: words });
  const empty = !draft.subject.trim() && !draft.body.trim();
  const tooLong = href.length > MAILTO_SAFE;
  const activeChip = CHIPS.find((ch) => c[ch.subject] === draft.subject.trim());
  const placeholder = activeChip ? `${c.bodyPlaceholder}\n\n${c[activeChip.prompt]}` : c.bodyPlaceholder;
  const subjectCells = draft.subject.trim() ? Math.max(3, Math.min(10, Math.round(draft.subject.trim().length * 0.36))) : 0;
  const lines = useMemo(() => letterLines(draft.body, MAX_LINES, 34, TEXT_CELLS), [draft.body]);

  // focus lands where the last action points, once the new state is on screen
  useEffect(() => {
    const f = focusNext.current;
    if (!f) return;
    focusNext.current = null;
    const el = f === "subject" ? subjectRef.current : f === "body" ? bodyRef.current : resultRef.current;
    el?.focus();
  }, [phase]);

  const typing = () => {
    setLifted(true);
    window.clearTimeout(liftTimer.current);
    liftTimer.current = window.setTimeout(() => setLifted(false), 900);
  };

  /** the envelope reached the Dock (or sealed in place): over to the mail app */
  const land = () => {
    state.sent();
    const opened = launchMail(href);
    focusNext.current = "result";
    setPhase(opened ? "sent" : "ready");
  };

  const send = () => {
    if (phase !== "compose") return;
    window.clearTimeout(liftTimer.current);
    setLifted(false);
    if (!reduced) {
      setPhase("sending");
      blip("close");
    }
    stageRef.current?.send();
  };

  const backToCompose = (clear: boolean) => {
    if (clear) state.clear();
    else state.restore();
    focusNext.current = clear ? "subject" : "body";
    setReturned(true);
    setPhase("compose");
    stageRef.current?.reset();
    blip("open");
  };

  const pickChip = (ch: (typeof CHIPS)[number], viaPointer: boolean) => {
    const on = activeChip?.id === ch.id;
    update({ subject: on ? "" : c[ch.subject] });
    blip("tick");
    typing();
    if (!on && viaPointer && !draft.body.trim()) bodyRef.current?.focus();
  };

  const busy = phase === "sending";
  const done = phase === "sent" || phase === "ready";
  const keys = isMac ? "⌘↵" : "Ctrl ↵";

  return (
    <div className="app-contact-compose">
      <div className="app-contact-col">
        <header className="app-contact-head">
          <p className="app-contact-eyebrow">{c.composeEyebrow}</p>
          <h2 className="app-contact-title">{c.composeTitle}</h2>
          <p className="app-contact-lead">{c.composeLead}</p>
        </header>

        {!done ? (
          <m.form
            key="compose"
            className="app-contact-card"
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
                  fail={c.keyCopyFailed}
                  className="app-contact-btn app-contact-btn--small"
                >
                  <span>{c.copyMessage}</span>
                </CopyButton>
              </div>
            )}

            <div className="app-contact-foot">
              <p className="app-contact-status" aria-live="polite">
                {busy ? (
                  <span className="app-contact-status-busy">{c.flying}</span>
                ) : empty ? (
                  <span>{c.draftEmpty}</span>
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
            </p>
            <div className="app-contact-actions">
              <a
                href={href}
                className={`app-contact-btn ${phase === "ready" ? "app-contact-btn--primary" : ""}`}
                onClick={() => {
                  if (phase === "ready") setPhase("sent");
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
          originRef={sendRef}
          onThrow={() => {
            window.clearTimeout(liftTimer.current);
            setLifted(false);
            setPhase("sending");
          }}
          onLand={land}
        />
        <div className="app-contact-reply app-contact-reply--inline">
          <p>{c.replyNote}</p>
          <p>{c.langNote}</p>
        </div>
      </div>
    </div>
  );
}
