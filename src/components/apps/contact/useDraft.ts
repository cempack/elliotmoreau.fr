"use client";

import { useEffect, useRef, useState } from "react";
import { loadDraft, saveDraft, type Draft } from "./mail";

const EMPTY: Draft = { subject: "", body: "" };

/** `?subject=…&body=…` on /contact, read once and taken out of the address */
function prefillFromUrl(): Draft | null {
  const u = new URL(window.location.href);
  const subject = (u.searchParams.get("subject") ?? "").slice(0, 200);
  const body = (u.searchParams.get("body") ?? "").slice(0, 2000);
  if (!subject && !body) return null;
  u.searchParams.delete("subject");
  u.searchParams.delete("body");
  window.history.replaceState(window.history.state, "", `${u.pathname}${u.search}${u.hash}`);
  return { subject, body };
}

/**
 * The message being written, kept in this browser between visits (like a
 * draft in Mail). Restored after mount so the server HTML matches, saved
 * half a second after the last keystroke. `saved` turns true once the
 * current text is on disk.
 */
export function useDraft() {
  const [draft, setDraft] = useState<Draft>(EMPTY);
  const [saved, setSaved] = useState(false);
  const ready = useRef(false);
  const skipNext = useRef(false);

  useEffect(() => {
    const d = loadDraft();
    const asked = prefillFromUrl();
    queueMicrotask(() => {
      // a link that asks for a subject (Write back) fills an empty draft; a
      // letter already in progress is never replaced
      if (asked && !(d && (d.subject.trim() || d.body.trim()))) {
        setDraft(asked);
      } else if (d) {
        skipNext.current = true;
        setDraft(d);
        setSaved(true);
      }
      ready.current = true;
    });
  }, []);

  useEffect(() => {
    if (!ready.current) return;
    if (skipNext.current) {
      skipNext.current = false;
      return;
    }
    const id = window.setTimeout(() => {
      saveDraft(draft);
      setSaved(true);
    }, 500);
    return () => window.clearTimeout(id);
  }, [draft]);

  const update = (patch: Partial<Draft>) => {
    setSaved(false);
    setDraft((d) => ({ ...d, ...patch }));
  };

  /** The message left for the mail app: forget the stored copy (keep it in memory for "Edit"). */
  const sent = () => saveDraft(EMPTY);
  /** Back to editing after a send: store it again. */
  const restore = () => {
    saveDraft(draft);
    setSaved(true);
  };
  const clear = () => {
    setSaved(false);
    setDraft(EMPTY);
  };

  return { draft, saved, update, sent, restore, clear };
}
