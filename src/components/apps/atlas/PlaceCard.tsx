"use client";

import { AnimatePresence, m } from "motion/react";
import { useI18n } from "@/i18n/client";
import { useSound } from "@/lib/sound";
import { useToast } from "@/components/Toasts";
import { spring } from "@/lib/motion";
import { useReduced } from "@/hooks/env";
import { PixelGlyph } from "@/components/glyphs";
import { G_CHEVRON } from "@/components/os/window/glyphs";
import type { PlaceRow } from "@/lib/content";
import { distanceKm } from "./geo";
import { useAtlas } from "./useAtlas";
import { Stamp } from "./Stamp";
import { groupDigits } from "./stampArt";
import { capitalize, fill, useCoords } from "./fmt";
import { Horizon } from "./Horizon";

/** The status chip: Home / Visited / Next up, marker drawn like the globe's. */
export function StatusChip({ place }: { place: PlaceRow }) {
  const { t } = useI18n();
  const tone = place.home ? "home" : place.status;
  return (
    <span className="app-atlas-chip" data-tone={tone}>
      {t.atlas.status[tone === "want" ? "want" : tone === "home" ? "home" : "been"]}
    </span>
  );
}

/** The place name in display type: letters rise out of their line on a
    spring and settle from a light weight into semibold. */
function KineticName({ text, id }: { text: string; id: string }) {
  const reduced = useReduced();
  const words = text.split(" ");
  // the longest unbreakable run sets the size cap, so "États-Unis" never
  // runs out of its column (each word clips its rising letters)
  const longest = Math.max(...words.map((w) => w.length));
  let n = 0;
  return (
    <AnimatePresence mode="popLayout" initial={false}>
      <m.span
        key={id}
        className="app-atlas-name-inner"
        style={{ "--app-atlas-name-ch": longest } as React.CSSProperties}
        exit={reduced ? { opacity: 0 } : { opacity: 0, y: "-0.35em", transition: { duration: 0.18, ease: [0.4, 0, 1, 1] } }}
      >
        <span className="sr-only">{text}</span>
        {words.map((w, wi) => (
          <span key={wi} className="app-atlas-name-word" aria-hidden>
            {Array.from(w).map((ch, ci) => {
              const i = n++;
              return (
                <m.span
                  key={ci}
                  className="app-atlas-name-char"
                  initial={reduced ? { opacity: 0 } : { y: "105%", fontWeight: 340 }}
                  animate={reduced ? { opacity: 1 } : { y: "0%", fontWeight: 620 }}
                  transition={
                    reduced
                      ? { duration: 0.15 }
                      : {
                          y: { ...spring.default, delay: 0.04 + i * 0.022 },
                          fontWeight: { duration: 0.7, delay: 0.1 + i * 0.022, ease: [0.22, 1, 0.36, 1] },
                        }
                  }
                >
                  {ch}
                </m.span>
              );
            })}
            {wi < words.length - 1 ? " " : null}
          </span>
        ))}
      </m.span>
    </AnimatePresence>
  );
}

/**
 * The inspector for one place: status, region, coordinates (copyable),
 * the perforated stamp of its sky (cancelled once visited), the name in kinetic display type, the view from
 * home (every place as a flag at its heading, with the distance, or the
 * routes out for home), its note (from the database), and previous / next.
 */
export function PlaceCard({
  place,
  onSelect,
  compact = false,
  titleId,
}: {
  place: PlaceRow;
  onSelect: (id: string) => void;
  compact?: boolean;
  titleId: string;
}) {
  const { t, lang } = useI18n();
  const a = t.atlas;
  const { blip } = useSound();
  const { notify } = useToast();
  const reduced = useReduced();
  const coordsText = useCoords();
  const { home, ordered } = useAtlas();
  const isHome = place.home || place.id === home.id;
  const km = distanceKm(home, place);
  const name = place.name[lang];
  const region = a.regions[place.region.en] ?? capitalize(place.region[lang]);
  const note = place.note?.[lang] ?? "";
  const i = Math.max(0, ordered.findIndex((p) => p.id === place.id));
  const prev = ordered[(i - 1 + ordered.length) % ordered.length] ?? place;
  const next = ordered[(i + 1) % ordered.length] ?? place;
  const copy = async () => {
    const text = `${place.lat.toFixed(4)}, ${place.lon.toFixed(4)}`;
    try {
      await navigator.clipboard.writeText(text);
      blip("copy");
      notify(`${name} · ${text}`, a.card.copied);
    } catch {
      notify(text, a.card.coords);
    }
  };

  const swap = reduced
    ? { initial: { opacity: 0 }, animate: { opacity: 1 }, exit: { opacity: 0 }, transition: { duration: 0.15 } }
    : {
        initial: { opacity: 0, y: 8 },
        animate: { opacity: 1, y: 0 },
        exit: { opacity: 0, transition: { duration: 0.12 } },
        transition: { ...spring.gentle, delay: 0.12 },
      };

  const shown = coordsText(place.lat, place.lon);
  const coords = (
    <button type="button" className="app-atlas-coords" onClick={copy} aria-label={fill(a.labelled, { label: a.card.copy, value: shown })}>
      <span className="tabular">{shown}</span>
      <svg width="12" height="12" viewBox="0 0 12 12" aria-hidden className="app-atlas-coords-icon">
        <path d="M4 1.5h5.5a1 1 0 0 1 1 1V8M2.5 4h5a1 1 0 0 1 1 1v5.5a1 1 0 0 1-1 1h-5a1 1 0 0 1-1-1V5a1 1 0 0 1 1-1Z" fill="none" stroke="currentColor" strokeWidth="1.2" />
      </svg>
    </button>
  );

  return (
    <article className="app-atlas-card" data-compact={compact || undefined} aria-labelledby={titleId}>
      {/* compact (the sheet): the peek row keeps to the name and status
          chip; region and coordinates move down into the details */}
      <div className="app-atlas-card-meta">
        <StatusChip place={place} />
        <p className="app-atlas-card-region">{region}</p>
        {!compact && coords}
      </div>
      <div className="app-atlas-card-stamp">
          <AnimatePresence mode="popLayout" initial={false}>
            <m.div
              key={place.id}
              initial={reduced ? { opacity: 0 } : { opacity: 0, scale: 1.18, rotate: 9, y: -14 }}
              animate={reduced ? { opacity: 1 } : { opacity: 1, scale: 1, rotate: 3, y: 0 }}
              exit={reduced ? { opacity: 0 } : { opacity: 0, x: 36, y: -22, rotate: 16, transition: { duration: 0.22, ease: [0.4, 0, 1, 1] } }}
              transition={reduced ? { duration: 0.15 } : { ...spring.flick, delay: 0.06 }}
            >
              <Stamp
                place={place}
                name={name}
                postmark
                lang={lang}
                value={isHome ? a.card.stampHome : `${groupDigits(km)} ${a.km.toUpperCase()}`}
                label={fill(a.card.stampAlt, { place: name })}
              />
            </m.div>
          </AnimatePresence>
      </div>

      <h2 id={titleId} className="app-atlas-name">
        <KineticName text={name} id={place.id} />
      </h2>

      {/* the view from home: it turns to each place rather than swapping;
          the sheet's half detent can end under it on a short screen */}
      <div className="app-atlas-card-view">
        <Horizon place={place} isHome={isHome} onSelect={onSelect} />
      </div>

      <AnimatePresence mode="popLayout" initial={false}>
        <m.div key={place.id} className="app-atlas-card-body" {...swap}>
          <p className="app-atlas-note" data-sheet-half="">
            {isHome ? [note, a.card.homeLine].filter(Boolean).join(" ") : note}
          </p>
          {compact && (
            <dl className="app-atlas-facts app-atlas-facts--details">
              <div className="app-atlas-fact">
                <dt>{a.card.region}</dt>
                <dd className="app-atlas-fact-text">{region}</dd>
              </div>
              <div className="app-atlas-fact">
                <dt>{a.card.coords}</dt>
                <dd>{coords}</dd>
              </div>
            </dl>
          )}
        </m.div>
      </AnimatePresence>

      <div className="app-atlas-card-nav" role="group" aria-label={a.card.steps}>
        <button type="button" className="app-atlas-step" onClick={() => onSelect(prev.id)} aria-label={fill(a.labelled, { label: a.card.prev, value: prev.name[lang] })}>
          <PixelGlyph cells={G_CHEVRON} size={9} className="app-atlas-step-prev" />
          <span>{prev.name[lang]}</span>
        </button>
        <span className="app-atlas-step-count tabular" aria-hidden>
          {String(i + 1).padStart(2, "0")} / {String(ordered.length).padStart(2, "0")}
        </span>
        <button type="button" className="app-atlas-step app-atlas-step--next" onClick={() => onSelect(next.id)} aria-label={fill(a.labelled, { label: a.card.next, value: next.name[lang] })}>
          <span>{next.name[lang]}</span>
          <PixelGlyph cells={G_CHEVRON} size={9} className="app-atlas-step-next" />
        </button>
      </div>
    </article>
  );
}
