"use client";

import "./mail.css";
import { useEffect, useId, useState, useSyncExternalStore } from "react";
import { AppWindow } from "@/components/os/AppWindow";
import { useI18n } from "@/i18n/client";
import { useReduced } from "@/hooks/env";
import { useSound } from "@/lib/sound";
import { scrollToY, scrollTop } from "@/lib/scroller";
import { SOCIALS } from "@/lib/places";
import { PixelGlyph } from "@/components/glyphs";
import { InlineScript } from "@/components/InlineScript";
import { CopyButton } from "./Copy";
import { Compose, type Phase } from "./Compose";
import { Elsewhere } from "./Elsewhere";
import { KeyView } from "./KeyView";
import { HASH, Sidebar, type Box } from "./Sidebar";
import { G_SEND_UP } from "./glyphs";
import { draftFile, fill } from "./mail";
import { useSiteData } from "@/components/os/SiteData";

/** runs while the HTML is parsed, before first paint: which mailbox a shared link asks for */
const HASH_SCRIPT = `(function(s){var h=location.hash.slice(1);if(h==="${HASH.elsewhere}"||h==="${HASH.key}"){s.parentElement.setAttribute("data-hash",h);document.documentElement.dataset.mailHash=h}})(document.currentScript)`;

function boxFromHash(hash: string): Box {
  const h = hash.replace(/^#/, "");
  return h === HASH.elsewhere ? "elsewhere" : h === HASH.key ? "key" : "compose";
}

/** "~/contact/drafts/<file>.eml": only this re-renders when the draft is saved. */
function DraftPath() {
  const { t } = useI18n();
  const file = useSyncExternalStore(draftFile.subscribe, draftFile.get, draftFile.server);
  return <>{`~/contact/${t.contact.draftsDir}/${file || t.contact.untitled}.eml`}</>;
}

/**
 * Mail (the /contact app). Three mailboxes in one window: New message
 * (the compose sheet and its envelope), Elsewhere (profiles) and PGP key.
 * All three stay mounted, so a half-written message survives a look at
 * the key, and the inactive ones are simply hidden. The open mailbox
 * lives in the URL hash (#elsewhere, #pgp) so it can be linked. Before
 * hydration a tiny inline script (or, without scripts, `:target` on two
 * empty anchors) tells the CSS which mailbox to show, so a shared link
 * never flashes the wrong one.
 */
export function MailApp() {
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

  useEffect(() => {
    const sync = () => setBox(boxFromHash(window.location.hash));
    queueMicrotask(() => {
      sync();
      setReady(true);
      delete document.documentElement.dataset.mailHash;
    });
    window.addEventListener("hashchange", sync);
    return () => window.removeEventListener("hashchange", sync);
  }, []);

  const select = (b: Box) => {
    if (b === box) return;
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
  const headerSend = box === "compose" && (phase === "compose" || phase === "sending");

  return (
    <AppWindow
      app="contact"
      className="app-contact"
      subtitle={
        <span className="app-contact-path" aria-hidden>
          {box === "compose" ? <DraftPath /> : box === "elsewhere" ? `~/contact/${c.elsewhereDir}` : "~/contact/pgp.asc"}
        </span>
      }
      toolbar={
        <>
          <CopyButton
            text={email}
            ok={c.copied}
            fail={fill(c.copyFailed, { email })}
            className={`app-contact-tool${headerSend ? " app-contact-tool--desk" : ""}`}
          >
            <span className="app-contact-tool-text">{c.copyAddress}</span>
          </CopyButton>
          {headerSend && (
            <button
              type="submit"
              form={formId}
              className="app-contact-sendtool"
              aria-label={c.sendLabel}
              disabled={phase === "sending"}
            >
              <PixelGlyph cells={G_SEND_UP} size={14} />
            </button>
          )}
        </>
      }
      sidebar={<Sidebar box={box} onSelect={select} />}
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
        <div className="app-contact-view" data-view="compose" data-off={box !== "compose" || undefined}>
          <Compose formId={formId} onPhase={setPhase} />
        </div>
        <div className="app-contact-view" data-view="elsewhere" data-off={box !== "elsewhere" || undefined}>
          <Elsewhere data={data} active={box === "elsewhere"} />
        </div>
        <div className="app-contact-view" data-view="key" data-off={box !== "key" || undefined}>
          <KeyView active={box === "key"} />
        </div>
      </div>
    </AppWindow>
  );
}
