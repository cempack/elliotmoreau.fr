"use client";

import "./mail.css";
import { useEffect, useState } from "react";
import type { SiteData } from "@/lib/data";
import { AppWindow } from "@/components/os/AppWindow";
import { useI18n } from "@/i18n/client";
import { useReduced } from "@/hooks/env";
import { useSound } from "@/lib/sound";
import { lenisRef } from "@/lib/lenisRef";
import { SOCIALS } from "@/lib/places";
import { CopyButton } from "./Copy";
import { Compose } from "./Compose";
import { Elsewhere } from "./Elsewhere";
import { KeyView } from "./KeyView";
import { Sidebar, type Box } from "./Sidebar";
import { fill, slug } from "./mail";
import { useDraft } from "./useDraft";

const HASH: Record<Box, string> = { compose: "", elsewhere: "elsewhere", key: "pgp" };
const NETS = 5;

function boxFromHash(hash: string): Box {
  const h = hash.replace(/^#/, "");
  return h === HASH.elsewhere ? "elsewhere" : h === HASH.key ? "key" : "compose";
}

/**
 * Mail (the /contact app). Three mailboxes in one window: New message
 * (the compose sheet and its envelope), Elsewhere (profiles) and PGP key.
 * All three stay mounted, so a half-written message survives a look at
 * the key, and the inactive ones are simply hidden. The open mailbox
 * lives in the URL hash (#elsewhere, #pgp) so it can be linked.
 */
export function MailApp({ data }: { data: SiteData }) {
  const { t } = useI18n();
  const c = t.contact;
  const reduced = useReduced();
  const { blip } = useSound();
  const draft = useDraft();
  const [box, setBox] = useState<Box>("compose");
  const [switched, setSwitched] = useState(false);

  useEffect(() => {
    const sync = () => setBox(boxFromHash(window.location.hash));
    queueMicrotask(sync);
    window.addEventListener("hashchange", sync);
    return () => window.removeEventListener("hashchange", sync);
  }, []);

  const select = (b: Box) => {
    if (b === box) return;
    setBox(b);
    setSwitched(true);
    blip("select");
    const u = new URL(window.location.href);
    u.hash = HASH[b];
    window.history.replaceState(window.history.state, "", `${u.pathname}${u.search}${HASH[b] ? `#${HASH[b]}` : ""}`);
    // the new mailbox starts at its top
    if (window.scrollY > 4) {
      const l = lenisRef.current;
      if (l) l.scrollTo(0, reduced ? { immediate: true } : { duration: 0.6 });
      else window.scrollTo({ top: 0, behavior: reduced ? "auto" : "smooth" });
    }
  };

  const file =
    box === "compose"
      ? `~/contact/${c.draftsDir}/${slug(draft.draft.subject) || c.untitled}.eml`
      : box === "elsewhere"
        ? "~/contact/elsewhere"
        : "~/contact/pgp.asc";

  const email = SOCIALS.email;

  return (
    <AppWindow
      app="contact"
      className="app-contact"
      subtitle={
        <span className="app-contact-path" aria-hidden>
          {file}
        </span>
      }
      toolbar={
        <CopyButton
          text={email}
          ok={c.copied}
          fail={fill(c.copyFailed, { email })}
          className="app-contact-tool"
        >
          <span className="app-contact-tool-text">{c.copyAddress}</span>
        </CopyButton>
      }
      sidebar={<Sidebar box={box} onSelect={select} nets={NETS} />}
    >
      <div className="app-contact-views" data-anim={switched || undefined}>
        <div className="app-contact-view" hidden={box !== "compose"}>
          <Compose state={draft} />
        </div>
        <div className="app-contact-view" hidden={box !== "elsewhere"}>
          <Elsewhere data={data} active={box === "elsewhere"} />
        </div>
        <div className="app-contact-view" hidden={box !== "key"}>
          <KeyView active={box === "key"} />
        </div>
      </div>
    </AppWindow>
  );
}
