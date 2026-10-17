"use client";

import "../menubar-panels.css";

import { useRef } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { m } from "motion/react";
import { rememberLocale, switchLocaleHref, useI18n } from "@/i18n/client";
import { LOCALES } from "@/i18n/config";
import { useSound } from "@/lib/sound";
import { spring } from "@/lib/motion";
import { skySound, useSky, type SkyMode } from "../sky";
import { SkyView } from "./SkyArt";
import { ChevronRight, GLYPH_MOON, GLYPH_MUTE, GLYPH_SPEAKER, Pixels, SKY_GLYPH } from "./glyphs";
import { useMenu } from "./Panel";
import { fill } from "./util";

const MODES: SkyMode[] = ["auto", "dawn", "day", "dusk", "night"];
/** endonyms: each language named in itself, whatever the UI language */
const ENDONYM = { en: "English", fr: "Français" } as const;

/** Sky: Toulouse in miniature with a sun you can hold, and a five-way segmented control. */
function SkyTile() {
  const { t } = useI18n();
  const c = t.shell.control;
  const { mode, setMode, phase, live } = useSky();
  const { blip } = useSound();
  const group = useRef<HTMLDivElement>(null);

  const pick = (next: SkyMode, focus = false) => {
    if (next !== mode) {
      setMode(next);
      blip(skySound(phase, next === "auto" ? (live ?? phase) : next));
    }
    if (focus) group.current?.querySelector<HTMLElement>(`[data-mode="${next}"]`)?.focus();
  };

  const onKeyDown = (e: React.KeyboardEvent) => {
    const i = MODES.indexOf(mode);
    const step = e.key === "ArrowRight" || e.key === "ArrowDown" ? 1 : e.key === "ArrowLeft" || e.key === "ArrowUp" ? -1 : 0;
    if (step) {
      e.preventDefault();
      pick(MODES[(i + step + MODES.length) % MODES.length], true);
    } else if (e.key === "Home" || e.key === "End") {
      e.preventDefault();
      pick(MODES[e.key === "Home" ? 0 : MODES.length - 1], true);
    }
  };

  const status = mode === "auto" ? fill(c.following, { phase: c[phase] }) : fill(c.pinned, { phase: c[mode] });

  return (
    <section className="os-menubar-tile os-menubar-sky" aria-labelledby="os-mb-sky-title">
      <SkyView mode={mode} onPick={(m) => pick(m)} labels={{ dawn: c.dawn, day: c.day, dusk: c.dusk, night: c.night }} />
      <div className="os-menubar-sky-head">
        <h3 id="os-mb-sky-title" className="os-menubar-tile-title">
          {c.appearance}
        </h3>
        <p className="os-menubar-sky-status" aria-live="polite">
          {status}
        </p>
      </div>
      <div ref={group} role="radiogroup" aria-label={c.skyModes} className="os-menubar-seg" onKeyDown={onKeyDown}>
        {MODES.map((md) => {
          const on = md === mode;
          return (
            <button
              key={md}
              type="button"
              role="radio"
              aria-checked={on}
              aria-label={c[md]}
              tabIndex={on ? 0 : -1}
              data-mode={md}
              className="os-menubar-seg-btn"
              onClick={() => pick(md)}
            >
              {on && <m.span layoutId="os-mb-sky-thumb" className="os-menubar-seg-thumb" transition={spring.snappy} />}
              <Pixels cells={SKY_GLYPH[md]} size={14} />
              <span aria-hidden>{c.short[md]}</span>
            </button>
          );
        })}
      </div>
    </section>
  );
}

function SoundTile() {
  const { t } = useI18n();
  const c = t.shell.control;
  const { muted, toggle, blip } = useSound();
  return (
    <button
      type="button"
      className="os-menubar-tile os-menubar-toggle"
      aria-pressed={!muted}
      onClick={() => {
        toggle();
        // turning sound on confirms itself; turning it off stays silent
        if (muted) window.setTimeout(() => blip("on"), 0);
      }}
    >
      <span className="os-menubar-orb" data-on={!muted || undefined}>
        <Pixels cells={muted ? GLYPH_MUTE : GLYPH_SPEAKER} size={14} />
      </span>
      <span className="os-menubar-toggle-text">
        <span className="os-menubar-tile-title">{c.sound}</span>
        <span className="os-menubar-tile-sub">{muted ? c.off : c.on}</span>
      </span>
    </button>
  );
}

function LanguageTile() {
  const { t, lang } = useI18n();
  const c = t.shell.control;
  const pathname = usePathname();
  const { blip } = useSound();
  const menu = useMenu();
  return (
    <div className="os-menubar-tile os-menubar-lang">
      <div className="os-menubar-langseg" role="group" aria-labelledby="os-mb-lang">
        {LOCALES.map((l) =>
          l === lang ? (
            <span key={l} className="os-menubar-langseg-opt" aria-current="true" aria-label={ENDONYM[l]} lang={l}>
              <m.span layoutId="os-mb-lang-thumb" className="os-menubar-seg-thumb" transition={spring.snappy} />
              <span aria-hidden>{l.toUpperCase()}</span>
            </span>
          ) : (
            <Link prefetch={false}
              key={l}
              href={switchLocaleHref(pathname, l)}
              hrefLang={l}
              lang={l}
              aria-label={ENDONYM[l]}
              className="os-menubar-langseg-opt"
              onClick={() => {
                rememberLocale(l);
                blip("toggle");
                menu.close();
              }}
            >
              <span aria-hidden>{l.toUpperCase()}</span>
            </Link>
          )
        )}
      </div>
      <span className="os-menubar-lang-text">
        <span className="os-menubar-tile-title" id="os-mb-lang">
          {c.language}
        </span>
        <span className="os-menubar-tile-sub">{c.languageName}</span>
      </span>
    </div>
  );
}

function FocusTile() {
  const { t, path } = useI18n();
  const c = t.shell.control;
  const menu = useMenu();
  return (
    <Link prefetch={false}
      href={path("/contact")}
      transitionTypes={["app-open"]}
      className="os-menubar-tile os-menubar-focus"
      onClick={() => menu.close()}
    >
      <span className="os-menubar-orb os-menubar-orb--lilac">
        <Pixels cells={GLYPH_MOON} size={14} />
      </span>
      <span className="os-menubar-focus-text">
        <span className="os-menubar-tile-sub">{c.focus}</span>
        <span className="os-menubar-tile-title">
          {c.available}
        </span>
      </span>
      <span className="os-menubar-focus-cta">
        {c.availableCta}
        <ChevronRight />
      </span>
    </Link>
  );
}

/** iOS-style Control Center: sky, sound, language, focus. */
export function ControlCenterPanel() {
  return (
    <div className="os-menubar-cc">
      <SkyTile />
      <div className="os-menubar-cc-row">
        <SoundTile />
        <LanguageTile />
      </div>
      <FocusTile />
    </div>
  );
}
