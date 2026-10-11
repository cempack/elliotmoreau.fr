"use client";

import { useEffect, useRef, useState } from "react";
import { loadDraft, saveDraft, type Draft } from "./mail";

const EMPTY: Draft = { subject: "", body: "" };

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
    queueMicrotask(() => {
      if (d) {
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
