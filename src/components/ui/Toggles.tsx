"use client";

import { m } from "motion/react";
import { useLang } from "@/lib/i18n";
import { useSound } from "@/lib/sound";
import { spring } from "@/lib/motion";

/** EN / FR segmented switch; the thumb glides to the active side. */
export function LangToggle({ className = "", id = "lang" }: { className?: string; id?: string }) {
  const { lang, setLang } = useLang();
  const { blip } = useSound();
  return (
    <div role="group" aria-label="Language" className={`em-seg ${className}`}>
      {(["en", "fr"] as const).map((l) => (
        <button
          key={l}
          type="button"
          aria-pressed={lang === l}
          lang={l}
          onClick={() => {
            if (lang === l) return;
            setLang(l);
            blip("toggle");
          }}
          className="em-seg-btn"
        >
          {lang === l && <m.span layoutId={`${id}-thumb`} className="em-seg-thumb" transition={spring.snappy} />}
          <span className="relative">{l.toUpperCase()}</span>
        </button>
      ))}
    </div>
  );
}

export function SoundIcon({ muted }: { muted: boolean }) {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden>
      <path d="M2 6v4h2.5L8 13.5v-11L4.5 6H2Z" stroke="currentColor" strokeWidth="1.3" strokeLinejoin="round" />
      {muted ? (
        <path d="m10.5 6.5 3 3m0-3-3 3" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" />
      ) : (
        <path
          d="M10.5 5.5a3.5 3.5 0 0 1 0 5M12.5 3.8a6 6 0 0 1 0 8.4"
          stroke="currentColor"
          strokeWidth="1.3"
          strokeLinecap="round"
        />
      )}
    </svg>
  );
}

export function SoundToggle({ className = "", labels }: { className?: string; labels: { on: string; off: string } }) {
  const { muted, toggle, blip } = useSound();
  return (
    <button
      type="button"
      onClick={() => {
        toggle();
        // muted → unmuted plays a confirmation; the other way stays silent
        if (muted) window.setTimeout(() => blip("toggle"), 0);
      }}
      aria-pressed={!muted}
      aria-label={muted ? labels.off : labels.on}
      title={muted ? labels.off : labels.on}
      className={className}
    >
      <SoundIcon muted={muted} />
    </button>
  );
}
