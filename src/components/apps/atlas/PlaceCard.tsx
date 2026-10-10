"use client";

import { useEffect, useRef } from "react";
import { AnimatePresence, animate, m, useMotionValue, useTransform } from "motion/react";
import { useI18n } from "@/i18n/client";
import { useSound } from "@/lib/sound";
import { useToast } from "@/components/Toasts";
import { spring } from "@/lib/motion";
import { useReduced } from "@/hooks/env";
import { PixelGlyph } from "@/components/glyphs";
import { G_CHEVRON } from "@/components/os/window/glyphs";
import { HOME, fmtCoords, type Place } from "@/lib/places";
import { BEEN, NEXT, ORDERED, bearingDeg, compassIndex, distanceKm } from "./geo";
import { Stamp } from "./Stamp";
import { capitalize, fill, useKm } from "./fmt";

/** The status chip: Home / Visited / Next up, marker drawn like the globe's. */
export function StatusChip({ place }: { place: Place }) {
  const { t } = useI18n();
  const tone = place.home ? "home" : place.status;
  return (
    <span className="app-atlas-chip" data-tone={tone}>
      <span className="app-atlas-mark" data-tone={tone} aria-hidden />
      {t.atlas.status[tone === "want" ? "want" : tone === "home" ? "home" : "been"]}
    </span>
  );
}

/** Big tabular number that rolls from the previous value to the new one,
    paced with the arc drawing on the globe. */
function Rolling({ value }: { value: number }) {
  const reduced = useReduced();
  const fmt = useKm();
  const mv = useMotionValue(value);
  const text = useTransform(mv, (v) => fmt(Math.round(v)));
  useEffect(() => {
    if (reduced) {
      mv.jump(value);
      return;
    }
    const a = animate(mv, value, { duration: 1.05, delay: 0.32, ease: [0.22, 1, 0.36, 1] });
    return () => a.stop();
  }, [value, reduced, mv]);
  return <m.span className="tabular">{text}</m.span>;
}

/** The place name in display type: letters rise out of their line on a
    spring and settle from a light weight into semibold. */
function KineticName({ text, id }: { text: string; id: string }) {
  const reduced = useReduced();
  const words = text.split(" ");
  let n = 0;
  return (
    <AnimatePresence mode="popLayout" initial={false}>
      <m.span
        key={id}
        className="app-atlas-name-inner"
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
 * the perforated stamp, the name in kinetic display type, distance and
 * heading from home (or the routes out, for home), a short note, and
 * previous / next.
 */
export function PlaceCard({
  place,
  onSelect,
  compact = false,
  titleId,
}: {
  place: Place;
  onSelect: (id: string) => void;
  compact?: boolean;
  titleId: string;
}) {
  const { t, lang } = useI18n();
  const a = t.atlas;
  const { blip } = useSound();
  const { notify } = useToast();
  const reduced = useReduced();
  const isHome = !!place.home || place.id === HOME.id;
  const km = distanceKm(HOME, place);
  const heading = bearingDeg(HOME, place);
  const name = place.name[lang];
  const i = ORDERED.findIndex((p) => p.id === place.id);
  const prev = ORDERED[(i - 1 + ORDERED.length) % ORDERED.length];
  const next = ORDERED[(i + 1) % ORDERED.length];
  const copyTimer = useRef(0);

  useEffect(() => () => window.clearTimeout(copyTimer.current), []);

  const copy = async () => {
    const text = `${place.lat.toFixed(4)}, ${place.lon.toFixed(4)}`;
    try {
      await navigator.clipboard.writeText(text);
      blip("success");
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

  return (
    <article className="app-atlas-card" data-compact={compact || undefined} aria-labelledby={titleId}>
      <div className="app-atlas-card-top">
        <div className="app-atlas-card-meta">
          <StatusChip place={place} />
          <p className="app-atlas-card-region">{capitalize(place.region[lang])}</p>
          <button type="button" className="app-atlas-coords" onClick={copy} aria-label={`${a.card.copy}: ${fmtCoords(place.lat, place.lon)}`}>
            <span className="tabular">{fmtCoords(place.lat, place.lon)}</span>
            <svg width="12" height="12" viewBox="0 0 12 12" aria-hidden className="app-atlas-coords-icon">
              <path d="M4 1.5h5.5a1 1 0 0 1 1 1V8M2.5 4h5a1 1 0 0 1 1 1v5.5a1 1 0 0 1-1 1h-5a1 1 0 0 1-1-1V5a1 1 0 0 1 1-1Z" fill="none" stroke="currentColor" strokeWidth="1.2" />
            </svg>
          </button>
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
                postmark={!compact}
                value={isHome ? "HOME" : `${Math.round(km)} KM`}
                label={fill(a.card.stampAlt, { place: name })}
              />
            </m.div>
          </AnimatePresence>
        </div>
      </div>

      <h2 id={titleId} className="app-atlas-name">
        <KineticName text={name} id={place.id} />
      </h2>

      <AnimatePresence mode="popLayout" initial={false}>
        <m.div key={place.id} className="app-atlas-card-body" {...swap}>
          <dl className="app-atlas-facts">
            {isHome ? (
              <div className="app-atlas-fact app-atlas-fact--wide">
                <dt>{a.card.routes}</dt>
                <dd>
                  <span className="app-atlas-fact-big tabular">{BEEN.length - 1 + NEXT.length}</span>
                  <span className="app-atlas-fact-sub">
                    {fill(a.card.routesSub, { been: BEEN.length - 1, next: NEXT.length })}
                  </span>
                </dd>
              </div>
            ) : (
              <>
                <div className="app-atlas-fact">
                  <dt>{a.card.distance}</dt>
                  <dd>
                    <span className="app-atlas-fact-big">
                      <Rolling value={km} />
                      <span className="app-atlas-fact-unit">{a.km}</span>
                    </span>
                    <span className="app-atlas-fact-sub">{a.card.crow}</span>
                  </dd>
                </div>
                <div className="app-atlas-fact">
                  <dt>{a.card.bearing}</dt>
                  <dd>
                    <span className="app-atlas-fact-big tabular">
                      {Math.round(heading)}°
                      <span className="app-atlas-fact-unit">{a.compass[compassIndex(heading)]}</span>
                    </span>
                    <span className="app-atlas-fact-sub" aria-hidden>
                      <span className="app-atlas-compass" style={{ rotate: `${heading}deg` }} />
                    </span>
                  </dd>
                </div>
              </>
            )}
          </dl>
          <p className="app-atlas-note">{isHome ? `${a.notes[place.id] ?? ""} ${a.card.homeLine}` : a.notes[place.id]}</p>
        </m.div>
      </AnimatePresence>

      <nav className="app-atlas-card-nav" aria-label={a.placesLabel}>
        <button type="button" className="app-atlas-step" onClick={() => onSelect(prev.id)} aria-label={`${a.card.prev}: ${prev.name[lang]}`}>
          <PixelGlyph cells={G_CHEVRON} size={9} className="app-atlas-step-prev" />
          <span>{prev.name[lang]}</span>
        </button>
        <span className="app-atlas-step-count tabular" aria-hidden>
          {String(i + 1).padStart(2, "0")} / {String(ORDERED.length).padStart(2, "0")}
        </span>
        <button type="button" className="app-atlas-step app-atlas-step--next" onClick={() => onSelect(next.id)} aria-label={`${a.card.next}: ${next.name[lang]}`}>
          <span>{next.name[lang]}</span>
          <PixelGlyph cells={G_CHEVRON} size={9} className="app-atlas-step-next" />
        </button>
      </nav>
    </article>
  );
}
