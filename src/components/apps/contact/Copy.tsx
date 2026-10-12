"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useI18n } from "@/i18n/client";
import { useToast } from "@/components/Toasts";
import { useSound } from "@/lib/sound";
import { PixelGlyph } from "@/components/glyphs";
import { copyText } from "@/lib/clipboard";
import { G_CHECK, G_COPY } from "./glyphs";

/** Copy to the clipboard with a toast and a blip; `true` on success. */
export function useCopy() {
  const { t } = useI18n();
  const { notify } = useToast();
  const { blip } = useSound();
  return useCallback(
    async (text: string, ok: string, fail: string) => {
      const done = await copyText(text);
      if (done) blip("success");
      notify(done ? ok : fail, t.contact.toastTitle);
      return done;
    },
    [blip, notify, t.contact.toastTitle]
  );
}

/**
 * A button that copies `text`; its glyph turns into a check for a moment.
 * Children are the visible label (omit for an icon-only button, which
 * then needs `label`).
 */
export function CopyButton({
  text,
  ok,
  fail,
  label,
  className = "",
  children,
  glyph = 14,
}: {
  text: string | null;
  ok: string;
  fail: string;
  /** accessible name (required when there are no children) */
  label?: string;
  className?: string;
  children?: React.ReactNode;
  glyph?: number;
}) {
  const copy = useCopy();
  const [done, setDone] = useState(false);
  const timer = useRef(0);
  useEffect(() => () => window.clearTimeout(timer.current), []);

  return (
    <button
      type="button"
      className={className}
      aria-label={label}
      disabled={text == null}
      data-copied={done || undefined}
      onClick={async () => {
        if (text == null) return;
        const res = await copy(text, ok, fail);
        if (!res) return;
        setDone(true);
        window.clearTimeout(timer.current);
        timer.current = window.setTimeout(() => setDone(false), 1600);
      }}
    >
      <PixelGlyph cells={done ? G_CHECK : G_COPY} size={glyph} />
      {children}
    </button>
  );
}
