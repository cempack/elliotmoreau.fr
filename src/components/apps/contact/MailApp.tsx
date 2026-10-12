"use client";

import "./mail.css";
import { useEffect, useId, useState, useSyncExternalStore } from "react";
import { AppWindow, PathBar } from "@/components/os/AppWindow";
import { useI18n } from "@/i18n/client";
import { useReduced } from "@/hooks/env";
import { useSound } from "@/lib/sound";
import { scrollToY, scrollTop } from "@/lib/scroller";
import { SOCIALS } from "@/lib/places";
import { PixelGlyph } from "@/components/glyphs";
import { InlineScript } from "@/components/InlineScript";
import { TOKEN_RE } from "./api";
import { CopyButton } from "./Copy";
import { Compose, type Mode, type Phase } from "./Compose";
import { Elsewhere } from "./Elsewhere";
import { KeyView } from "./KeyView";
import { SentBox } from "./SentBox";
import { HASH, Sidebar, type Box } from "./Sidebar";
import { G_SEND_UP } from "./glyphs";
import { draftFile, fill } from "./mail";
import { threadStore } from "./threads";
import { useSent } from "./useSent";
import { useSiteData } from "@/components/os/SiteData";

/**
 * runs while the HTML is parsed, before first paint: which mailbox a shared
 * link asks for. A thread link (?thread=…) or #sent (with letters in this
 * browser) opens Sent.
 */
const HASH_SCRIPT = `(function(s){var h=location.hash.slice(1),q=/[?&]thread=/.test(location.search);if(q)h="${HASH.sent}";else if(h==="${HASH.sent}"){try{if(!JSON.parse(localStorage.getItem("em-threads")||"[]").length)h=""}catch(e){h=""}}if(h==="${HASH.sent}"||h==="${HASH.elsewhere}"||h==="${HASH.key}"){s.parentElement.setAttribute("data-hash",h);document.documentElement.dataset.mailHash=h}})(document.currentScript)`;

function boxFromHash(hash: string): Box {
  const h = hash.replace(/^#/, "");
  return h === HASH.sent ? "sent" : h === HASH.elsewhere ? "elsewhere" : h === HASH.key ? "key" : "compose";
}

/** "~/contact/drafts/<file>.eml": only this re-renders when the draft is saved. */
function DraftPath() {
  const { t } = useI18n();
  const file = useSyncExternalStore(draftFile.subscribe, draftFile.get, draftFile.server);
  return <PathBar crumbs={[{ label: "contact" }, { label: t.contact.draftsDir }, { label: `${file || t.contact.untitled}.eml` }]} />;
}

/**
 * Mail (the /contact app). Mailboxes in one window: New message (the
 * compose sheet and its envelope), Sent (the visitor's own letters and
 * Elliot's replies, once there are any), Elsewhere (profiles) and PGP key.
 * All stay mounted, so a half-written message survives a look at the key,
 * and the inactive ones are simply hidden. The open mailbox lives in the
 * URL hash (#sent, #elsewhere, #pgp) so it can be linked. Before
 * hydration a tiny inline script (or, without scripts, `:target` on two
 * empty anchors) tells the CSS which mailbox to show, so a shared link
 * never flashes the wrong one.
 *
 * `mailReady`: the server can send mail (SMTP is configured). Without it,
 * or once the server says it can't, Send goes through the visitor's own
 * mail app instead.
 */
export function MailApp({ mailReady = false }: { mailReady?: boolean }) {
  const data = useSiteData();
  const { t } = useI18n();
  const c = t.contact;
  const reduced = useReduced();
  const { blip } = useSound();
  const formId = `${useId()}-form`;
  const [box, setBox] = useState<Box>("compose");
  const [ready, setReady] = useState(false);
  const [switched, setSwitched] = useState(false);
  const [phase, setPhase] = useState<Phase>("compose");
  const [fallback, setFallback] = useState(false);
  const [selected, setSelected] = useState<string | null>(null);
  const mode: Mode = mailReady && !fallback ? "send" : "mailto";
  const sent = useSent(box === "sent");
  const hasSent = sent.items.length > 0;
  // Sent only exists once there's a letter in it
  const shown: Box = box === "sent" && !hasSent && ready ? "compose" : box;

  useEffect(() => {
    const sync = () => setBox(boxFromHash(window.location.hash));
    queueMicrotask(() => {
      // arriving from the link in Elliot's reply: keep the key here, open the letter, and take it out of the address bar
      const u = new URL(window.location.href);
      const token = u.searchParams.get("thread");
      if (token && TOKEN_RE.test(token)) {
        threadStore.add({ token, subject: "", at: new Date().toISOString() });
        setSelected(token);
        setBox("sent");
        u.searchParams.delete("thread");
        window.history.replaceState(window.history.state, "", `${u.pathname}${u.search}#${HASH.sent}`);
      } else sync();
      setReady(true);
      delete document.documentElement.dataset.mailHash;
    });
    window.addEventListener("hashchange", sync);
    return () => window.removeEventListener("hashchange", sync);
  }, []);

  const select = (b: Box) => {
    if (b === shown) return;
    setBox(b);
    setSwitched(true);
    blip("select");
    const u = new URL(window.location.href);
    window.history.replaceState(window.history.state, "", `${u.pathname}${u.search}${HASH[b] ? `#${HASH[b]}` : ""}`);
    // the new mailbox starts at its top
    if (scrollTop() > 4) scrollToY(0, !reduced);
  };

  const email = SOCIALS.email;
  // phones: Send lives in the sheet's header, always in reach (iOS Mail)
  const headerSend = shown === "compose" && (phase === "compose" || phase === "sending");
  // ~/contact/<mailbox>: "contact" goes back to a new message
  const up = { label: "contact", onClick: () => select("compose") };
  const subtitle =
    shown === "compose" ? (
      <DraftPath />
    ) : (
      <PathBar crumbs={[up, { label: shown === "sent" ? c.sentDir : shown === "elsewhere" ? c.elsewhereDir : "pgp.asc" }]} />
    );

  return (
    <AppWindow
      app="contact"
      className="app-contact"
      subtitle={subtitle}
      toolbar={
        <>
          {/* a new message has the address (and its copy button) in its To row */}
          {shown !== "compose" && (
            <CopyButton text={email} ok={c.copied} fail={fill(c.copyFailed, { email })} className="app-contact-tool">
              <span className="app-contact-tool-text">{c.copyAddress}</span>
            </CopyButton>
          )}
          {headerSend && (
            <button
              type="submit"
              form={formId}
              className="app-contact-sendtool"
              aria-label={mode === "send" ? c.sendLabelSend : c.sendLabel}
              disabled={phase === "sending"}
            >
              <PixelGlyph cells={G_SEND_UP} size={14} />
            </button>
          )}
        </>
      }
      sidebar={<Sidebar box={shown} onSelect={select} sent={{ show: hasSent, unread: sent.unread }} />}
    >
      <div
        className="app-contact-views"
        data-anim={switched || undefined}
        data-ready={ready || undefined}
        // the pre-paint script adds data-hash before React arrives
        suppressHydrationWarning
      >
        <InlineScript html={HASH_SCRIPT} />
        {/* pre-hydration: `#elsewhere` / `#pgp` set data-hash (script) or match these (no script), and mail.css shows that mailbox */}
        <span id={HASH.elsewhere} className="app-contact-anchor" aria-hidden />
        <span id={HASH.key} className="app-contact-anchor" aria-hidden />
        <div className="app-contact-view" data-view="compose" data-off={shown !== "compose" || undefined}>
          <Compose
            formId={formId}
            mode={mode}
            onPhase={setPhase}
            onDelivered={(token, subject) => threadStore.add({ token, subject, at: new Date().toISOString() })}
            onOpenSent={(token) => {
              setSelected(token);
              select("sent");
            }}
            onFallback={() => setFallback(true)}
          />
        </div>
        <div className="app-contact-view" data-view="sent" data-off={shown !== "sent" || undefined}>
          <SentBox
            active={shown === "sent"}
            items={sent.items}
            loading={sent.loading}
            failed={sent.failed}
            selected={selected}
            onSelect={setSelected}
            refresh={sent.refresh}
            canReply={mode === "send"}
          />
        </div>
        <div className="app-contact-view" data-view="elsewhere" data-off={shown !== "elsewhere" || undefined}>
          <Elsewhere data={data} active={shown === "elsewhere"} />
        </div>
        <div className="app-contact-view" data-view="key" data-off={shown !== "key" || undefined}>
          <KeyView active={shown === "key"} />
        </div>
      </div>
    </AppWindow>
  );
}
