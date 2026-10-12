"use client";

import { useEffect, useId, useLayoutEffect, useMemo, useRef, useState } from "react";
import { m } from "motion/react";
import { useI18n } from "@/i18n/client";
import { useIsMac, useReduced } from "@/hooks/env";
import { useSound } from "@/lib/sound";
import { spring } from "@/lib/motion";
import { contentTop, scrollToY, scrollTop, scrollerBottom, scrollerTop } from "@/lib/scroller";
import { SOCIALS } from "@/lib/places";
import { PixelGlyph } from "@/components/glyphs";
import { EmosMark } from "@/components/os/menubar/glyphs";
import { sendLetter, type SendError } from "./api";
import { CopyButton } from "./Copy";
import { MAX_LINES, TEXT_CELLS } from "./Envelope";
import { useMailStatus } from "./hours";
import { Meter, type MeterHandle } from "./Meter";
import { markAt, type Mark } from "./postmark";
import { ReadEstimate } from "./ReadEstimate";
import { Stage, type StageHandle } from "./Stage";
import { G_ARROW, G_OPEN, G_SEND } from "./glyphs";
import {
  EMAIL_RE,
  LETTER_MAX,
  MAILTO_SAFE,
  draftFile,
  fill,
  launchMail,
  letterLines,
  loadFrom,
  mailtoHref,
  plural,
  saveFrom,
  slug,
  wordCount,
  type From,
} from "./mail";
import { useDraft } from "./useDraft";

export type Phase = "compose" | "sending" | "sent" | "ready";
/** "send": the site delivers it (SMTP is set up); "mailto": the visitor's own mail app does */
export type Mode = "send" | "mailto";

const CHIPS = [
  { id: "project", chip: "chipProject", subject: "subjectProject", prompt: "bodyProject" },
  { id: "collab", chip: "chipCollab", subject: "subjectCollab", prompt: "bodyCollab" },
  { id: "hiring", chip: "chipHiring", subject: "subjectHiring", prompt: "bodyHiring" },
  { id: "hi", chip: "chipHi", subject: "subjectHi", prompt: "bodyHi" },
] as const;

/** a letter written faster than this is refused by the server; an honest quick one just waits the rest */
const MIN_COMPOSE_MS = 3_100;

type Refusal = "body" | "email" | "badEmail";

/**
 * Windows: once the message box scrolls inside itself, Lenis leaves the
 * wheel to it (`data-lenis-prevent`); phones grow it with the page instead.
 */
function scrollsInside(ta: HTMLTextAreaElement) {
  const inside = window.matchMedia("(min-width: 768px)").matches && ta.scrollHeight > ta.clientHeight + 1;
  ta.toggleAttribute("data-lenis-prevent", inside);
}

/** Spotlight's dead letter asks for the message field on arrival (a
    session flag, taken once; kept here until focus actually lands, so a
    remount on the way doesn't lose it) */
let bodyFocusPending = false;
function takeBodyFocus() {
  try {
    if (sessionStorage.getItem("em-mail-focus") === "body") {
      sessionStorage.removeItem("em-mail-focus");
      bodyFocusPending = true;
    }
  } catch {}
  return bodyFocusPending;
}

/** who it's from, remembered in this browser (restored after mount, saved shortly after a change) */
function useFrom() {
  const [from, setFrom] = useState<From>({ email: "", name: "" });
  const ready = useRef(false);
  useEffect(() => {
    const f = loadFrom();
    queueMicrotask(() => {
      if (f) setFrom(f);
      ready.current = true;
    });
  }, []);
  useEffect(() => {
    if (!ready.current) return;
    const id = window.setTimeout(() => saveFrom(from), 400);
    return () => window.clearTimeout(id);
  }, [from]);
  return [from, setFrom] as const;
}

/**
 * New message: a Mail compose sheet (To, From, Subject with quick ideas,
 * the message) beside the envelope it will travel in. One action, Send (or
 * ⌘↵), and everything around it shows what it does: the envelope is a
 * live miniature of the draft, the franking meter under it strikes a
 * Toulouse postmark on it, and it folds and flies into the Dock.
 *
 * With mail set up (mode "send"), Send delivers it from the site: the
 * envelope seals while the server sends, and flies only once Elliot's
 * mailbox has accepted it; the card then says when it's likely to be
 * read, and the letter joins the visitor's Sent mailbox. Without it (or if
 * the server says it can't), the message is handed to the viewer's own
 * mail app through a mailto: link, and the UI says so.
 *
 * The draft lives here, not in MailApp, so typing re-renders this sheet
 * only. `formId` lets a Send button outside the form (the window's
 * toolbar on phones) submit it; `onPhase` tells MailApp when to show it.
 */
export function Compose({
  formId,
  mode,
  onPhase,
  onDelivered,
  onOpenSent,
  onFallback,
}: {
  formId: string;
  mode: Mode;
  onPhase: (p: Phase) => void;
  /** the site delivered it: here is the visitor's key to the thread */
  onDelivered: (token: string, subject: string) => void;
  onOpenSent: (token: string) => void;
  /** the server can't send right now: the rest of the visit uses the mailto path */
  onFallback: () => void;
}) {
  const { t, lang } = useI18n();
  const c = t.contact;
  const state = useDraft();
  const { draft, saved, update } = state;
  const [from, setFrom] = useFrom();
  const status = useMailStatus();
  const reduced = useReduced();
  const isMac = useIsMac();
  const { blip } = useSound();
  const email = SOCIALS.email;
  const uid = useId();
  const sending = mode === "send";

  const [phase, setPhaseState] = useState<Phase>("compose");
  const [returned, setReturned] = useState(false);
  const [lifted, setLifted] = useState(false);
  /** the franking meter's postmark on the letter, once it is franked, and how hard it was struck */
  const [mark, setMark] = useState<Mark | null>(null);
  const [ink, setInk] = useState(1);
  /** Send was refused (nothing written, no address): the status says why for a moment */
  const [refused, setRefused] = useState<Refusal | null>(null);
  /** the server turned the letter down, or couldn't send it */
  const [sendError, setSendError] = useState<SendError | null>(null);
  /** delivered by the site: the token for "Open in Sent" */
  const [delivered, setDelivered] = useState<string | null>(null);
  /** the server couldn't send, so this one went the mailto way */
  const [fellBack, setFellBack] = useState(false);
  const liftTimer = useRef(0);
  const refuseTimer = useRef(0);
  const sendTimer = useRef(0);
  useEffect(
    () => () => {
      window.clearTimeout(liftTimer.current);
      window.clearTimeout(refuseTimer.current);
      window.clearTimeout(sendTimer.current);
    },
    []
  );
  const go = (p: Phase) => {
    setPhaseState(p);
    onPhase(p);
  };

  const stageRef = useRef<StageHandle>(null);
  const meterRef = useRef<MeterHandle>(null);
  const sendRef = useRef<HTMLButtonElement>(null);
  const footRef = useRef<HTMLDivElement>(null);
  const footEndRef = useRef<HTMLSpanElement>(null);
  const emailRef = useRef<HTMLInputElement>(null);
  const subjectRef = useRef<HTMLInputElement>(null);
  const bodyRef = useRef<HTMLTextAreaElement>(null);
  const hpRef = useRef<HTMLInputElement>(null);
  const resultRef = useRef<HTMLHeadingElement>(null);
  const focusNext = useRef<"subject" | "body" | "email" | "result" | null>(null);
  /** the subject the visitor typed, kept while a quick idea stands in for it */
  const custom = useRef("");
  /** when writing started (first keystroke, or the sheet appearing) and the server's answer */
  const startedAt = useRef<number | null>(null);
  const mountedAt = useRef(0);
  const outcome = useRef<Awaited<ReturnType<typeof sendLetter>> | null>(null);
  useEffect(() => {
    mountedAt.current = performance.now();
  }, []);

  const href = mailtoHref(email, draft);
  const words = wordCount(draft.body);
  const wordsLabel = plural(lang, words, c.wordOne, c.words);
  const empty = !draft.subject.trim() && !draft.body.trim();
  const tooLong = !sending && href.length > MAILTO_SAFE;
  const emailTyped = from.email.trim();
  /** what stops Send right now, if anything */
  const blocker: Refusal | null = sending
    ? !draft.body.trim()
      ? "body"
      : !emailTyped
        ? "email"
        : !EMAIL_RE.test(emailTyped)
          ? "badEmail"
          : null
    : empty
      ? "body"
      : null;
  const activeChip = CHIPS.find((ch) => c[ch.subject] === draft.subject.trim());
  const placeholder = activeChip ? `${c.bodyPlaceholder}\n\n${c[activeChip.prompt]}` : c.bodyPlaceholder;
  const subjectCells = draft.subject.trim() ? Math.max(3, Math.min(10, Math.round(draft.subject.trim().length * 0.36))) : 0;
  const lines = useMemo(() => letterLines(draft.body, MAX_LINES, 34, TEXT_CELLS), [draft.body]);
  const replyDays = Math.max(1, status.replyDays);

  // the window subtitle names the file once the draft is saved
  useEffect(() => {
    if (saved) draftFile.set(slug(draft.subject));
  }, [saved, draft.subject]);
  useEffect(() => () => draftFile.set(""), []);

  // arriving from Spotlight's dead letter: straight to the message
  useEffect(() => {
    if (!takeBodyFocus()) return;
    // after the window has opened (and anything restoring focus has run)
    const ids = [420, 900].map((ms) =>
      window.setTimeout(() => {
        const el = bodyRef.current;
        if (!el) return;
        if (document.activeElement !== el) el.focus({ preventScroll: true });
        if (document.activeElement === el) bodyFocusPending = false;
      }, ms)
    );
    return () => ids.forEach((id) => window.clearTimeout(id));
  }, []);

  // focus lands where the last action points, once the new state is on screen
  useEffect(() => {
    const f = focusNext.current;
    if (!f) return;
    focusNext.current = null;
    if (f !== "result") {
      (f === "subject" ? subjectRef.current : f === "email" ? emailRef.current : bodyRef.current)?.focus();
      return;
    }
    const h = resultRef.current;
    const card = h?.closest<HTMLElement>(".app-contact-result");
    if (!h || !card) return;
    // keep the confirmation clear of the sticky title bar before focusing it
    const top = parseFloat(getComputedStyle(card).scrollMarginTop) || 0;
    const rTop = card.getBoundingClientRect().top - scrollerTop();
    if (rTop < top || rTop > (scrollerBottom() - scrollerTop()) * 0.55) scrollToY(scrollTop() + rTop - top, !reduced);
    h.focus({ preventScroll: true });
  }, [phase, reduced, sendError]);

  /**
   * Windows: the message box takes whatever height is left above the Dock,
   * like a compose window's body, so the whole sheet and Send are in view
   * at once and a long message scrolls inside it. Only on very short
   * windows does the card still run past the fold (the footer then pins).
   * Measured before paint, written straight to the DOM (no re-render).
   */
  useLayoutEffect(() => {
    const ta = bodyRef.current;
    const form = ta?.form;
    const foot = footRef.current;
    const root = form?.parentElement;
    if (!ta || !form || !foot || !root || phase !== "compose") return;
    const wide = window.matchMedia("(min-width: 768px)");
    let raf = 0;
    const fit = () => {
      if (!wide.matches) {
        form.style.removeProperty("--app-contact-fit");
        scrollsInside(ta);
        return;
      }
      const r = ta.getBoundingClientRect();
      // where it sits with the window scrolled to the top
      const top = scrollerTop() + contentTop(ta);
      // what the sheet keeps below the textarea (its footer)
      const below = form.getBoundingClientRect().bottom - r.bottom;
      const pin = parseFloat(getComputedStyle(foot).bottom) || 0;
      // (2px short of the line, so the footer reads as resting, not pinned)
      const room = Math.floor(scrollerBottom() - pin - top - below) - 2;
      if (form.style.getPropertyValue("--app-contact-fit") !== `${room}px`) form.style.setProperty("--app-contact-fit", `${room}px`);
      scrollsInside(ta);
    };
    const later = () => {
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(fit);
    };
    fit();
    const ro = new ResizeObserver(later);
    ro.observe(root);
    window.addEventListener("resize", later);
    wide.addEventListener("change", later);
    return () => {
      ro.disconnect();
      cancelAnimationFrame(raf);
      window.removeEventListener("resize", later);
      wide.removeEventListener("change", later);
    };
  }, [phase, sending]);

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

  /** `at`: the input event's timestamp (same clock as performance.now()) */
  const typing = (at: number) => {
    if (startedAt.current == null) startedAt.current = at;
    if (sendError) setSendError(null);
    setLifted(true);
    window.clearTimeout(liftTimer.current);
    liftTimer.current = window.setTimeout(() => setLifted(false), 900);
  };

  /**
   * The letter is on its way. Sending from the site: delivered (the card
   * and Sent follow), refused or failed (back to the sheet, saying why), or
   * unavailable (over to the mail app after all). The mailto path: over to
   * the mail app, unless the browser would refuse (`canOpen` false), in
   * which case the card offers the click. Returns whether it went out.
   */
  const land = (canOpen: boolean) => {
    const r = outcome.current;
    if (r) {
      outcome.current = null;
      if (r.ok) {
        state.sent();
        setDelivered(r.token);
        onDelivered(r.token, draft.subject.trim());
        focusNext.current = "result";
        go("sent");
        return true;
      }
      if (r.error === "unavailable") {
        onFallback();
        setFellBack(true);
        state.sent();
        const opened = launchMail(href);
        focusNext.current = "result";
        go(opened ? "sent" : "ready");
        return opened;
      }
      setSendError(r.error);
      setMark(null);
      go("compose");
      stageRef.current?.reset();
      return false;
    }
    state.sent();
    const opened = canOpen && launchMail(href);
    focusNext.current = "result";
    go(opened ? "sent" : "ready");
    return opened;
  };

  /** Send, ⌘↵ and the toolbar pull the franking meter's lever; it strikes, then the letter leaves */
  const send = () => {
    if (phase !== "compose") return;
    meterRef.current?.pull();
  };

  /** the die struck the envelope: the postmark is on it, and off it goes */
  const onStrike = (strength: number) => {
    if (phase !== "compose") return;
    setMark(markAt(new Date()));
    setInk(strength);
    blip("tick");
    navigator.vibrate?.(8);
    window.clearTimeout(sendTimer.current);
    sendTimer.current = window.setTimeout(leave, reduced ? 0 : 140);
  };

  const onRefuse = () => {
    const why = blocker ?? "body";
    setRefused(why);
    if (why !== "body" || sending) (why === "body" ? bodyRef : emailRef).current?.focus();
    window.clearTimeout(refuseTimer.current);
    refuseTimer.current = window.setTimeout(() => setRefused(null), 2400);
  };

  /** the letter, to the server: an honest quick writer just waits out the minimum */
  const post = async () => {
    const elapsed = performance.now() - (startedAt.current ?? mountedAt.current);
    if (elapsed < MIN_COMPOSE_MS) await new Promise((r) => window.setTimeout(r, MIN_COMPOSE_MS - elapsed));
    const r = await sendLetter({
      email: from.email.trim(),
      name: from.name.trim(),
      subject: draft.subject.trim(),
      body: draft.body,
      lang,
      elapsed: Math.max(elapsed, MIN_COMPOSE_MS),
      hp: hpRef.current?.value ?? "",
    });
    outcome.current = r;
    return r.ok;
  };

  const leave = () => {
    window.clearTimeout(liftTimer.current);
    setLifted(false);
    if (sending) {
      setSendError(null);
      outcome.current = null;
      go("sending");
      if (!reduced) blip("close");
      stageRef.current?.send(post());
      return;
    }
    if (!reduced) {
      go("sending");
      blip("close");
    }
    stageRef.current?.send();
  };

  const backToCompose = (clear: boolean) => {
    setMark(null);
    setDelivered(null);
    setFellBack(false);
    if (clear) state.clear();
    else state.restore();
    startedAt.current = null;
    mountedAt.current = performance.now();
    focusNext.current = clear ? "subject" : "body";
    setReturned(true);
    go("compose");
    stageRef.current?.reset();
    blip("open");
  };

  const pickChip = (ch: (typeof CHIPS)[number], viaPointer: boolean, at: number) => {
    const on = activeChip?.id === ch.id;
    if (!activeChip) custom.current = draft.subject;
    // off again: whatever the visitor had typed comes back
    update({ subject: on ? custom.current : c[ch.subject] });
    blip("tick");
    typing(at);
    if (!on && viaPointer && !draft.body.trim()) bodyRef.current?.focus();
  };

  const busy = phase === "sending";
  const done = phase === "sent" || phase === "ready";
  const keys = isMac ? "⌘↵" : "Ctrl ↵";
  const refusal = refused === "email" ? c.needEmail : refused === "badEmail" ? c.badEmail : refused ? c.writeFirst : "";
  const errorText = sendError === "rate" ? c.errRate : sendError === "invalid" ? c.errInvalid : sendError ? c.errFailed : "";
  const emailInvalid = (refused === "email" || refused === "badEmail" || sendError === "invalid") && blocker !== null && blocker !== "body";
  const deliveredHere = phase === "sent" && delivered != null;

  return (
    <div className="app-contact-compose">
      <div className="app-contact-intro">
        <header className="app-contact-head">
          <p className="app-contact-eyebrow">{c.composeEyebrow}</p>
          <h2 className="app-contact-title">{c.composeTitle}</h2>
        </header>
        <p className="app-contact-lead">{sending ? c.composeLeadSend : c.composeLead}</p>
        <p className="app-contact-habits">
          {replyDays === 1 ? c.habitsOne : fill(c.habits, { n: replyDays })}{" "}
          <a href="#pgp" className="app-contact-habits-key">
            {c.keyLink}
          </a>
        </p>
      </div>

      <div className="app-contact-stagecol">
        <Stage
          ref={stageRef}
          phase={phase}
          mark={mark}
          markInk={ink}
          subject={subjectCells}
          lines={lines}
          lifted={lifted}
          reduced={reduced}
          origin={() => {
            const own = sendRef.current?.getBoundingClientRect();
            if (own?.width) return own;
            return document.querySelector(`[form="${formId}"]`)?.getBoundingClientRect() ?? null;
          }}
          onLand={land}
          doneLabel={delivered ? c.delivered : undefined}
        />
        <Meter
          ref={meterRef}
          empty={blocker !== null}
          load={sending ? draft.body.length / LETTER_MAX : href.length / MAILTO_SAFE}
          tooLong={sending ? draft.body.length >= LETTER_MAX : tooLong}
          scale={sending ? { load: c.meter.letterLoad, full: c.meter.letterFull } : undefined}
          reduced={reduced}
          onStrike={onStrike}
          onRefuse={onRefuse}
        />
      </div>

      {!done ? (
        <m.form
          key="compose"
          id={formId}
          className="app-contact-card app-contact-sheet"
          aria-label={c.composeLabel}
          aria-busy={busy || undefined}
          noValidate
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

          {sending && (
            <div className="app-contact-row app-contact-row--from" data-invalid={emailInvalid || undefined}>
              <label className="app-contact-row-label" htmlFor={`${uid}-email`}>
                {c.from}
              </label>
              <div className="app-contact-from">
                <input
                  ref={emailRef}
                  id={`${uid}-email`}
                  className="app-contact-input app-contact-from-email"
                  type="email"
                  name="email"
                  autoComplete="email"
                  inputMode="email"
                  autoCapitalize="off"
                  autoCorrect="off"
                  spellCheck={false}
                  enterKeyHint="next"
                  required
                  maxLength={254}
                  value={from.email}
                  placeholder={c.fromEmailPlaceholder}
                  aria-label={c.fromEmail}
                  aria-invalid={emailInvalid || undefined}
                  readOnly={busy}
                  onChange={(e) => {
                    setFrom((f) => ({ ...f, email: e.target.value }));
                    if (refused === "email" || refused === "badEmail") setRefused(null);
                    if (startedAt.current == null) startedAt.current = e.timeStamp;
                    if (sendError) setSendError(null);
                  }}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && !e.metaKey && !e.ctrlKey && !e.nativeEvent.isComposing) {
                      e.preventDefault();
                      (e.currentTarget.parentElement?.querySelector<HTMLInputElement>("input[name=name]") ?? subjectRef.current)?.focus();
                    }
                  }}
                />
                <span className="app-contact-from-sep" aria-hidden />
                <input
                  id={`${uid}-name`}
                  className="app-contact-input app-contact-from-name"
                  type="text"
                  name="name"
                  autoComplete="name"
                  enterKeyHint="next"
                  maxLength={80}
                  value={from.name}
                  placeholder={c.fromNamePlaceholder}
                  aria-label={c.fromName}
                  readOnly={busy}
                  onChange={(e) => setFrom((f) => ({ ...f, name: e.target.value }))}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && !e.metaKey && !e.ctrlKey && !e.nativeEvent.isComposing) {
                      e.preventDefault();
                      subjectRef.current?.focus();
                    }
                  }}
                />
              </div>
            </div>
          )}

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
                typing(e.timeStamp);
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
                onClick={(e) => pickChip(ch, e.detail > 0, e.timeStamp)}
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
              maxLength={sending ? LETTER_MAX : undefined}
              value={draft.body}
              placeholder={placeholder}
              readOnly={busy}
              onChange={(e) => {
                update({ body: e.target.value });
                typing(e.timeStamp);
                scrollsInside(e.currentTarget);
              }}
            />
          </div>

          {/* only bots fill this in */}
          <div className="app-contact-hp" aria-hidden>
            <label>
              {c.hpLabel}
              <input ref={hpRef} type="text" name="emos_url" tabIndex={-1} autoComplete="off" defaultValue="" />
            </label>
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

          {sendError && (
            <div className="app-contact-long app-contact-error" role="alert">
              <p>{errorText}</p>
              {sendError !== "invalid" && (
                <a href={href} className="app-contact-btn app-contact-btn--small">
                  <PixelGlyph cells={G_OPEN} size={12} />
                  <span>{c.useMailApp}</span>
                </a>
              )}
            </div>
          )}

          <div ref={footRef} className="app-contact-foot">
            <span className="sr-only" aria-live="polite">
              {busy ? (sending ? c.sending : c.flying) : refusal}
            </span>
            <p className="app-contact-status">
              {busy ? (
                <span className="app-contact-status-busy">{sending ? c.sending : c.flying}</span>
              ) : refused ? (
                <span className="app-contact-status-refused">{refusal}</span>
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
              aria-label={sending ? c.sendLabelSend : c.sendLabel}
              aria-keyshortcuts={isMac ? "Meta+Enter" : "Control+Enter"}
              disabled={busy}
            >
              <PixelGlyph cells={G_SEND} size={14} />
              <span>{c.send}</span>
              <kbd className="app-contact-kbd" aria-hidden>
                {keys}
              </kbd>
            </button>
          </div>
          <span ref={footEndRef} className="app-contact-foot-end" aria-hidden />
        </m.form>
      ) : deliveredHere ? (
        <m.section
          key="delivered"
          className="app-contact-card app-contact-result"
          aria-labelledby={`${uid}-result`}
          initial={reduced ? { opacity: 0 } : { opacity: 0, y: 14 }}
          animate={{ opacity: 1, y: 0 }}
          transition={reduced ? { duration: 0.15 } : spring.gentle}
        >
          <p className="app-contact-eyebrow app-contact-eyebrow--signal">{c.deliveredEyebrow}</p>
          <h3 id={`${uid}-result`} ref={resultRef} tabIndex={-1} className="app-contact-result-title">
            {c.deliveredTitle}
          </h3>
          <p className="app-contact-result-body">{c.deliveredBody}</p>
          <p className="app-contact-result-summary">
            <span className="app-contact-result-subject">{draft.subject.trim() || c.noSubject}</span>
            <span aria-hidden> · </span>
            <span className="tabular">{wordsLabel}</span>
          </p>
          <ReadEstimate />
          <div className="app-contact-actions app-contact-result-actions">
            <button type="button" className="app-contact-btn" onClick={() => onOpenSent(delivered!)}>
              <PixelGlyph cells={G_ARROW} size={14} />
              <span>{c.viewInSent}</span>
            </button>
            <button
              type="button"
              className="app-contact-btn app-contact-btn--ghost app-contact-result-new"
              onClick={() => backToCompose(true)}
            >
              {c.newMessage}
            </button>
          </div>
        </m.section>
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
          <p className="app-contact-result-body">{fellBack ? c.fallbackBody : phase === "sent" ? c.sentBody : c.readyBody}</p>
          <p className="app-contact-result-summary">
            <span className="app-contact-result-subject">{draft.subject.trim() || c.noSubject}</span>
            <span aria-hidden> · </span>
            <span className="tabular">{wordsLabel}</span>
          </p>
          <div className="app-contact-actions app-contact-result-actions">
            <a
              href={href}
              className={`app-contact-btn ${phase === "ready" ? "app-contact-btn--primary" : ""}`}
              onClick={(e) => {
                // a real click opens the mail app: the sealed letter makes the trip it waited for
                if (phase === "ready") {
                  if (!mark) setMark(markAt(new Date()));
                  go("sent");
                }
                stageRef.current?.deliver(e.currentTarget);
              }}
            >
              <PixelGlyph cells={G_OPEN} size={14} />
              <span>{phase === "sent" ? c.openAgain : c.openMail}</span>
            </a>
            <button type="button" className="app-contact-btn" onClick={() => backToCompose(false)}>
              {c.editMessage}
            </button>
            <button
              type="button"
              className="app-contact-btn app-contact-btn--ghost app-contact-result-new"
              onClick={() => backToCompose(true)}
            >
              {c.newMessage}
            </button>
          </div>
          {phase === "sent" && <NothingOpened email={email} />}
        </m.section>
      )}
    </div>
  );
}

/** "Nothing opened? Write to {email} from anywhere.", the address and its copy button kept together. */
function NothingOpened({ email }: { email: string }) {
  const { t } = useI18n();
  const c = t.contact;
  const [before, after = ""] = c.nothingOpened.split("{email}");
  return (
    <p className="app-contact-result-note">
      {before}
      <span className="app-contact-result-addr">
        <span>{email}</span>
        <CopyButton
          text={email}
          ok={c.copied}
          fail={fill(c.copyFailed, { email })}
          label={fill(c.copyAddressLabel, { email })}
          className="app-contact-iconbtn"
        />
      </span>
      {after}
    </p>
  );
}
