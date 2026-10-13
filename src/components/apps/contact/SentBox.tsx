"use client";

import { useEffect, useId, useMemo, useRef, useState } from "react";
import { m } from "motion/react";
import { useI18n } from "@/i18n/client";
import { useIsMac, useReduced } from "@/hooks/env";
import { useSound } from "@/lib/sound";
import { spring } from "@/lib/motion";
import { scrollToY, scrollTop } from "@/lib/scroller";
import { PixelGlyph } from "@/components/glyphs";
import { EmosMark } from "@/components/os/menubar/glyphs";
import { sendReply, type ApiThread } from "./api";
import { Envelope } from "./Envelope";
import { G_BACK, G_SEND } from "./glyphs";
import { LETTER_MAX, plural, wordCount } from "./mail";
import { markAt } from "./postmark";
import { threadStore } from "./threads";
import type { SentItem } from "./useSent";

/**
 * Sent: the letters this visitor has sent from the site ("Letters you've
 * sent"), each a postmarked envelope with whose turn it is (waiting, or
 * answered, lit when the reply is new), opening into the conversation:
 * their letters and Elliot's replies, Mail style, plain text, with a reply
 * box under them. Two panes on wide windows (letters | the open one), one
 * at a time on narrow ones. The list is refreshed every minute while this
 * mailbox is open (see useSent).
 */
export function SentBox({
  active,
  items,
  loading,
  failed,
  selected,
  onSelect,
  refresh,
  canReply,
}: {
  active: boolean;
  items: SentItem[];
  loading: boolean;
  failed: boolean;
  selected: string | null;
  onSelect: (token: string | null) => void;
  refresh: (read?: string) => Promise<void>;
  canReply: boolean;
}) {
  const { t, lang } = useI18n();
  const c = t.contact;
  const reduced = useReduced();
  const { blip } = useSound();
  const open = items.find((x) => x.token === selected) ?? null;
  const backTo = useRef<string | null>(null);

  // opening a letter with a new reply marks it read (the server answers with it read)
  const unread = open?.thread?.visitorUnread ?? 0;
  useEffect(() => {
    if (!active || !selected || unread <= 0) return;
    const id = window.setTimeout(() => void refresh(selected), 0);
    return () => window.clearTimeout(id);
  }, [active, selected, unread, refresh]);

  // back from a letter (narrow windows): focus returns to it in the list
  useEffect(() => {
    if (selected || !backTo.current) return;
    const tok = backTo.current;
    backTo.current = null;
    document.querySelector<HTMLElement>(`[data-letter="${CSS.escape(tok)}"]`)?.focus({ preventScroll: true });
  }, [selected]);

  const choose = (token: string | null) => {
    if (token === selected) return;
    if (!token) backTo.current = selected;
    onSelect(token);
    blip("select");
    // narrow windows show one pane: start it at the top
    if (window.matchMedia("(max-width: 859px)").matches && scrollTop() > 4) scrollToY(0, !reduced);
  };

  const count = items.length;

  return (
    <div className="app-contact-sent" data-open={open ? "" : undefined}>
      <div className="app-contact-sent-list">
        <header className="app-contact-head">
          <p className="app-contact-eyebrow">{plural(lang, count, c.sentEyebrowOne, c.sentEyebrowMany)}</p>
          <h2 className="app-contact-title">{c.sentTitle2}</h2>
          <p className="app-contact-lead app-contact-sent-lead">{c.sentLead}</p>
        </header>
        {count === 0 ? (
          <p className="app-contact-sent-note" role="status">
            {c.loading}
          </p>
        ) : (
          <ul className="app-contact-letters" role="list" aria-label={c.sentList}>
            {items.map((it) => (
              <li key={it.token}>
                <LetterRow item={it} active={it.token === selected} onOpen={() => choose(it.token)} />
              </li>
            ))}
          </ul>
        )}
        {count > 0 && (
          <p className="app-contact-sent-note" role="status">
            {failed ? c.loadError : loading ? c.loading : c.polling}
          </p>
        )}
      </div>
      <div className="app-contact-sent-pane">
        {open ? (
          <ThreadView key={open.token} item={open} onBack={() => choose(null)} refresh={refresh} canReply={canReply} />
        ) : (
          <p className="app-contact-sent-pick">{c.pickOne}</p>
        )}
      </div>
    </div>
  );
}

/** whose turn it is, from the visitor's side */
function turn(t?: ApiThread) {
  if (!t) return null;
  if (t.visitorUnread > 0) return "new" as const;
  return t.status === "answered" ? ("answered" as const) : ("waiting" as const);
}

function LetterRow({ item, active, onOpen }: { item: SentItem; active: boolean; onOpen: () => void }) {
  const { t, lang } = useI18n();
  const c = t.contact;
  const mark = useMemo(() => markAt(new Date(item.at)), [item.at]);
  const when = new Intl.DateTimeFormat(lang === "fr" ? "fr-FR" : "en-GB", { day: "numeric", month: "short" }).format(new Date(item.thread?.lastAt ?? item.at));
  const state = turn(item.thread);
  const replies = item.thread?.messages.filter((x) => x.direction === "out").length ?? 0;
  return (
    <button
      type="button"
      className="app-contact-letter"
      data-letter={item.token}
      data-state={state ?? undefined}
      data-gone={item.gone || undefined}
      aria-current={active || undefined}
      onClick={onOpen}
    >
      <span className="app-contact-letter-env" aria-hidden>
        <Envelope sealed instant mark={mark} markCompact />
      </span>
      <span className="app-contact-letter-text">
        <span className="app-contact-letter-subject">{item.subject || item.thread?.subject || c.noSubject}</span>
        <span className="app-contact-letter-meta">
          <time dateTime={item.thread?.lastAt ?? item.at}>{when}</time>
          {replies > 0 && (
            <>
              <span aria-hidden> · </span>
              <span className="tabular">{plural(lang, replies, c.replyCountOne, c.replyCount)}</span>
            </>
          )}
        </span>
      </span>
      {state && (
        <span className="app-contact-letter-state" data-state={state}>
          {state === "new" ? c.statusNew : state === "answered" ? c.statusAnswered : c.statusWaiting}
        </span>
      )}
    </button>
  );
}

function ThreadView({
  item,
  onBack,
  refresh,
  canReply,
}: {
  item: SentItem;
  onBack: () => void;
  refresh: (read?: string) => Promise<void>;
  canReply: boolean;
}) {
  const { t, lang } = useI18n();
  const c = t.contact;
  const reduced = useReduced();
  const titleRef = useRef<HTMLHeadingElement>(null);
  const th = item.thread;
  const state = turn(th);
  const fmt = useMemo(
    () => new Intl.DateTimeFormat(lang === "fr" ? "fr-FR" : "en-GB", { weekday: "short", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit", hourCycle: "h23" }),
    [lang]
  );

  // a letter opened by hand gets focus on its title (not on first paint of an arrival link)
  useEffect(() => {
    if (document.activeElement?.closest(".app-contact-letters")) titleRef.current?.focus({ preventScroll: true });
  }, []);

  const last = th?.messages[th.messages.length - 1];
  const initial = (th?.name || "").trim().charAt(0).toUpperCase();

  return (
    <m.article
      className="app-contact-thread"
      aria-labelledby={`thread-${th?.id ?? "x"}`}
      initial={reduced ? { opacity: 0 } : { opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={reduced ? { duration: 0.15 } : spring.gentle}
    >
      <header className="app-contact-thread-head">
        <button type="button" className="app-contact-thread-back" onClick={onBack}>
          <PixelGlyph cells={G_BACK} size={12} />
          <span>{c.back}</span>
        </button>
        {state && (
          <p className="app-contact-eyebrow" data-state={state}>
            {state === "new" ? c.statusNew : state === "answered" ? c.statusAnswered : c.statusWaiting}
          </p>
        )}
        <h3 id={`thread-${th?.id ?? "x"}`} ref={titleRef} tabIndex={-1} className="app-contact-thread-title">
          {item.subject || th?.subject || c.noSubject}
        </h3>
      </header>

      {item.gone ? (
        <div className="app-contact-thread-gone">
          <p>{c.gone}</p>
          <button type="button" className="app-contact-btn app-contact-btn--small" onClick={() => threadStore.remove(item.token)}>
            {c.remove}
          </button>
        </div>
      ) : !th ? (
        <p className="app-contact-sent-note">{c.loading}</p>
      ) : (
        <>
          <ol className="app-contact-msgs">
            {th.messages.map((msg) => (
              <li key={msg.id} className="app-contact-msg" data-dir={msg.direction}>
                <div className="app-contact-msg-head">
                  <span className="app-contact-avatar app-contact-msg-avatar" aria-hidden>
                    {msg.direction === "out" ? <EmosMark size={14} /> : initial || "·"}
                  </span>
                  <span className="app-contact-msg-from">{msg.direction === "out" ? c.me : c.you}</span>
                  <time className="app-contact-msg-time tabular" dateTime={msg.createdAt}>
                    {fmt.format(new Date(msg.createdAt))}
                  </time>
                </div>
                <p className="app-contact-msg-body">{msg.body}</p>
              </li>
            ))}
          </ol>
          {last?.direction === "in" && <p className="app-contact-thread-wait">{c.waitingNote}</p>}
          {canReply ? <ReplyBox token={item.token} onSent={() => refresh()} /> : <p className="app-contact-thread-wait">{c.replyUnavailable}</p>}
        </>
      )}
    </m.article>
  );
}

function ReplyBox({ token, onSent }: { token: string; onSent: () => void }) {
  const { t, lang } = useI18n();
  const c = t.contact;
  const isMac = useIsMac();
  const { blip } = useSound();
  const uid = useId();
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<{ kind: "ok" | "error"; text: string } | null>(null);
  const noteTimer = useRef(0);
  useEffect(() => () => window.clearTimeout(noteTimer.current), []);

  const submit = async () => {
    if (busy) return;
    if (!text.trim()) {
      setNote({ kind: "error", text: c.writeFirst });
      return;
    }
    setBusy(true);
    setNote(null);
    const r = await sendReply(token, text);
    setBusy(false);
    if (r.ok) {
      setText("");
      setNote({ kind: "ok", text: c.replySent });
      blip("send");
      onSent();
      window.clearTimeout(noteTimer.current);
      noteTimer.current = window.setTimeout(() => setNote(null), 2400);
      return;
    }
    const msg =
      r.error === "unavailable" ? c.replyUnavailable : r.error === "rate" ? c.errRate : r.error === "invalid" ? c.errInvalid : r.error === "notfound" ? c.gone : c.errFailed;
    setNote({ kind: "error", text: msg });
    blip("error");
  };

  return (
    <form
      className="app-contact-card app-contact-replybox"
      aria-busy={busy || undefined}
      onSubmit={(e) => {
        e.preventDefault();
        void submit();
      }}
      onKeyDown={(e) => {
        if (e.key === "Enter" && (e.metaKey || e.ctrlKey) && !e.nativeEvent.isComposing) {
          e.preventDefault();
          void submit();
        }
      }}
    >
      <label className="app-contact-replybox-label" htmlFor={`${uid}-reply`}>
        {c.replyLabel}
      </label>
      <textarea
        id={`${uid}-reply`}
        className="app-contact-textarea app-contact-replybox-text"
        rows={4}
        maxLength={LETTER_MAX}
        value={text}
        placeholder={c.replyPlaceholder}
        readOnly={busy}
        onChange={(e) => {
          setText(e.target.value);
          if (note?.kind === "error") setNote(null);
        }}
      />
      <div className="app-contact-foot app-contact-replybox-foot">
        <p className="app-contact-status" role={note?.kind === "error" ? "alert" : "status"}>
          {busy ? (
            <span className="app-contact-status-busy">{c.sending}</span>
          ) : note ? (
            <span className={note.kind === "error" ? "app-contact-status-refused" : "app-contact-status-busy"}>{note.text}</span>
          ) : (
            <span className="tabular">{plural(lang, wordCount(text), c.wordOne, c.words)}</span>
          )}
        </p>
        <button
          type="submit"
          className="app-contact-btn app-contact-btn--primary"
          disabled={busy}
          aria-keyshortcuts={isMac ? "Meta+Enter" : "Control+Enter"}
        >
          <PixelGlyph cells={G_SEND} size={14} />
          <span>{c.replySend}</span>
        </button>
      </div>
    </form>
  );
}
