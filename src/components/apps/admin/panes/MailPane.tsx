"use client";

import { useCallback, useEffect, useState } from "react";
import { useI18n } from "@/i18n/client";
import { useToast } from "@/components/Toasts";
import { useSound } from "@/lib/sound";
import { rpc, type MailHealth, type Overview, type Thread, type ThreadStatus } from "../api";
import { Btn, Section, Segmented, fill, useAgo } from "../ui";

type Box = "inbox" | "archived" | "spam";

/**
 * The real inbox: letters from the Mail app and replies picked up from
 * the mailbox. Read a thread, answer it (sent from Elliot's address,
 * threaded, with the visitor's link), archive or mark spam.
 */
export function MailPane({ data, onChanged }: { data: Overview; onChanged: () => void }) {
  const { t, lang } = useI18n();
  const m = t.admin.mail;
  const ago = useAgo();
  const { notify } = useToast();
  const { blip } = useSound();
  const [box, setBox] = useState<Box>("inbox");
  const [threads, setThreads] = useState<Thread[] | null>(null);
  const [open, setOpen] = useState<Thread | null>(null);
  const [reply, setReply] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [health, setHealth] = useState<MailHealth>(data.mail.health);

  const load = useCallback((b: Box) => {
    rpc<{ threads: Thread[] }>("mail.list", { status: b === "inbox" ? "inbox" : b }).then((r) => {
      if (r.ok) setThreads(r.threads);
    });
  }, []);

  useEffect(() => load(box), [load, box]);

  const show = async (id: string) => {
    setError("");
    setReply("");
    const r = await rpc<{ thread: Thread }>("mail.get", { id });
    if (!r.ok) return;
    setOpen(r.thread);
    // reading it clears its unread mark: the sidebar count follows
    if (threads?.find((x) => x.id === id)?.adminUnread) {
      setThreads((ts) => ts?.map((x) => (x.id === id ? { ...x, adminUnread: 0 } : x)) ?? ts);
      onChanged();
    }
  };

  const send = async () => {
    if (!open || !reply.trim()) return;
    setBusy("send");
    setError("");
    const r = await rpc("mail.reply", { id: open.id, body: reply });
    setBusy(null);
    if (!r.ok) {
      blip("close");
      return setError(fill(m.failedSend, { message: r.message ?? r.error }));
    }
    blip("success");
    notify(m.sent, t.shell.apps.admin);
    setReply("");
    await show(open.id);
    load(box);
  };

  const move = async (status: ThreadStatus) => {
    if (!open) return;
    const r = await rpc("mail.status", { id: open.id, status });
    if (r.ok) {
      setOpen(null);
      load(box);
      onChanged();
    }
  };

  const check = async () => {
    setBusy("check");
    const r = await rpc<{ health: MailHealth }>("mail.sync");
    setBusy(null);
    if (r.ok) {
      setHealth(r.health);
      load(box);
      onChanged();
    }
  };

  const test = async () => {
    setBusy("test");
    const r = await rpc("mail.test");
    setBusy(null);
    if (r.ok) notify(fill(m.testSent, { to: data.mail.addresses.to }), t.shell.apps.admin);
    else notify(fill(m.failedSend, { message: r.message ?? r.error }), t.shell.apps.admin);
  };

  const date = (iso: string) =>
    new Intl.DateTimeFormat(lang === "fr" ? "fr-FR" : "en-GB", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" }).format(new Date(iso));
  const via = (s: "site" | "admin" | "imap") => (s === "site" ? m.viaSite : s === "imap" ? m.viaMail : m.viaAdmin);

  return (
    <Section title={m.title}>
      <div className="app-admin-health" aria-label={m.health}>
        <span className="app-admin-health-item" data-ok={health.smtp || undefined}>
          <span className="app-admin-dot" data-kind={health.smtp ? "ok" : "off"} aria-hidden />
          {m.smtp}: {health.smtp ? m.ok : m.off}
        </span>
        <span className="app-admin-health-item" data-ok={health.imap || undefined}>
          <span className="app-admin-dot" data-kind={health.imap ? "ok" : "off"} aria-hidden />
          {m.imap}: {health.imap ? m.ok : m.off}
        </span>
        <span className="app-admin-hint">{health.lastSync ? fill(m.lastSync, { time: ago(health.lastSync) }) : m.never}</span>
        {health.lastError && <span className="app-admin-error">{health.lastError}</span>}
        <span className="app-admin-health-actions">
          <Btn kind="ghost" onClick={check} disabled={!health.imap || busy === "check"}>
            {m.check}
          </Btn>
          <Btn kind="ghost" onClick={test} disabled={!health.smtp || busy === "test"}>
            {m.test}
          </Btn>
        </span>
      </div>

      {open ? (
        <article className="app-admin-thread">
          <div className="app-admin-thread-bar">
            <Btn kind="ghost" onClick={() => setOpen(null)}>
              ← {m.back}
            </Btn>
            <span className="app-admin-row">
              {open.status === "archived" || open.status === "spam" ? (
                <Btn onClick={() => move("open")}>{open.status === "spam" ? m.notSpam : m.unarchive}</Btn>
              ) : (
                <>
                  <Btn onClick={() => move("archived")}>{m.archive}</Btn>
                  <Btn kind="danger" onClick={() => move("spam")}>
                    {m.markSpam}
                  </Btn>
                </>
              )}
            </span>
          </div>
          <header className="app-admin-thread-head">
            <h3 className="app-admin-h3">{open.subject || "—"}</h3>
            <p className="app-admin-hint">
              {m.from} {open.name ? `${open.name} · ` : ""}
              <a href={`mailto:${open.email}`}>{open.email}</a> · {open.lang.toUpperCase()}
            </p>
          </header>
          <ol className="app-admin-messages">
            {open.messages?.map((msg) => (
              <li key={msg.id} className="app-admin-message" data-dir={msg.direction}>
                <p className="app-admin-message-meta">
                  {msg.direction === "out" ? m.you : open.name || open.email} · {via(msg.source)} · <time dateTime={msg.createdAt}>{date(msg.createdAt)}</time>
                </p>
                <div className="app-admin-message-body">{msg.body}</div>
                {msg.error && <p className="app-admin-error">{msg.error}</p>}
              </li>
            ))}
          </ol>
          {open.status !== "spam" && (
            <form
              className="app-admin-reply"
              onSubmit={(e) => {
                e.preventDefault();
                send();
              }}
            >
              <label className="app-admin-label" htmlFor="admin-reply">
                {m.reply}
              </label>
              <textarea
                id="admin-reply"
                className="app-admin-input app-admin-textarea"
                rows={6}
                lang={open.lang}
                placeholder={m.replyPlaceholder}
                value={reply}
                onChange={(e) => setReply(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
                    e.preventDefault();
                    send();
                  }
                }}
              />
              <div className="app-admin-row">
                <p className="app-admin-error" role="alert">
                  {error}
                </p>
                <Btn kind="primary" type="submit" disabled={!reply.trim() || busy === "send" || !health.smtp}>
                  {busy === "send" ? m.sending : m.send}
                </Btn>
              </div>
            </form>
          )}
        </article>
      ) : (
        <>
          <Segmented<Box>
            label={m.title}
            value={box}
            onChange={(b) => {
              setThreads(null);
              setBox(b);
            }}
            options={[
              { value: "inbox", label: m.inbox },
              { value: "archived", label: m.archived },
              { value: "spam", label: m.spam },
            ]}
          />
          {!threads ? (
            <p className="app-admin-empty">{t.admin.common.loading}</p>
          ) : !threads.length ? (
            <p className="app-admin-empty">{m.empty}</p>
          ) : (
            <ol className="app-admin-list app-admin-inbox">
              {threads.map((th) => (
                <li key={th.id} className="app-admin-list-item" data-unread={th.adminUnread ? "" : undefined}>
                  <button type="button" className="app-admin-list-main" onClick={() => show(th.id)}>
                    <span className="app-admin-dot" data-kind={th.adminUnread ? "unread" : th.status === "answered" ? "ok" : "read"} aria-hidden />
                    <span className="app-admin-list-name">{th.name || th.email}</span>
                    <span className="app-admin-list-sub">{th.subject}</span>
                    <span className="app-admin-list-meta">{ago(th.lastAt)}</span>
                  </button>
                </li>
              ))}
            </ol>
          )}
        </>
      )}
    </Section>
  );
}
