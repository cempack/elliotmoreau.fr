"use client";

import { useId } from "react";
import { Monogram } from "@/components/Monogram";
import { PixelLabel } from "@/components/PixelLabel";
import type { Locale } from "@/i18n/config";
import type { Place } from "@/lib/places";
import { isoOf } from "./geo";
import { fmtAxis } from "./fmt";

/**
 * A perforated postage stamp. `lg`: the place card's stamp, a monogram
 * seeded by the place id over a value strip, with a circular postmark
 * cancelling one corner. `sm`: the postcard's airmail stamp, the ISO code
 * in pixel letters. Perforations are a CSS mask on a 12px (lg) or 8px (sm)
 * grid; the drop shadow follows the cut-out.
 */
export function Stamp({
  place,
  size = "lg",
  value,
  label,
  name,
  lang = "en",
  postmark = false,
}: {
  place: Place;
  size?: "lg" | "sm";
  /** short pixel text on the value strip (lg, A–Z 0–9), e.g. "1050 KM" */
  value?: string;
  /** accessible name; omit for a decorative stamp */
  label?: string;
  /** display name, for the postmark */
  name?: string;
  lang?: Locale;
  postmark?: boolean;
}) {
  const tone = place.home ? "home" : place.status;
  const mark = postmark ? <Postmark place={place} name={name ?? place.name.en} lang={lang} /> : null;
  return (
    <span
      className="app-atlas-stamp"
      data-size={size}
      data-tone={tone}
      role={label ? "img" : undefined}
      aria-label={label}
      aria-hidden={label ? undefined : true}
    >
      {/* the postmark is inked twice: in pale ink where it lands on the
          card, and in dark ink inside the paper's cut-out where it lands
          on the stamp, as a real cancellation would */}
      {mark}
      <span className="app-atlas-stamp-sheet">
        <span className="app-atlas-stamp-paper">
          <span className="app-atlas-stamp-art">
            {size === "lg" ? (
              <>
                <Monogram text={place.id} className="app-atlas-stamp-planet" />
                <span className="app-atlas-stamp-iso">
                  <PixelLabel text={isoOf(place)} cell={2} />
                </span>
                <span className="app-atlas-stamp-value">
                  <PixelLabel text={value ?? isoOf(place)} cell={2} />
                </span>
              </>
            ) : (
              <span className="app-atlas-stamp-code">
                <PixelLabel text={isoOf(place)} cell={3} />
              </span>
            )}
          </span>
          {mark && <span className="app-atlas-stamp-ink">{mark}</span>}
        </span>
      </span>
    </span>
  );
}

/** Top and bottom ring text: a short name over its latitude, or a long
    one split over both arcs at the most even word break. */
function ringText(name: string, lat: number, lang: Locale): [string, string] {
  const up = name.toLocaleUpperCase(lang === "fr" ? "fr-FR" : "en-GB");
  if (up.length <= 11 || !up.includes(" ")) return [up, fmtAxis(lat, "lat", lang, 0)];
  const words = up.split(" ");
  let best: [string, string] = [up, ""];
  let score = Infinity;
  for (let i = 1; i < words.length; i++) {
    const a = words.slice(0, i).join(" ");
    const b = words.slice(i).join(" ");
    const s = Math.max(a.length, b.length);
    if (s < score) {
      score = s;
      best = [a, b];
    }
  }
  return best;
}

/** Circular date-stamp with wavy cancellation lines. Both ring lines
    read upright (the top one over the arc, the bottom one under it), and
    it is drawn 1:1 so its 12px lettering stays 12px. */
function Postmark({ place, name, lang }: { place: Place; name: string; lang: Locale }) {
  const uid = `app-atlas-pm${useId().replace(/[^\w-]/g, "")}`;
  const top = `${uid}-t`;
  const bottom = `${uid}-b`;
  const [a, b] = ringText(name, place.lat, lang);
  // 12px mono advances ~7.2px; squeeze only what would not fit its arc
  const fitA = a.length * 7.4 > 84 ? 84 : undefined;
  const fitB = b.length * 7.4 > 92 ? 92 : undefined;
  return (
    // slice, not meet: a card may narrow the box (CSS width) to crop the
    // waves' tail without scaling the 12px lettering
    <svg
      className="app-atlas-postmark"
      width="176"
      height="88"
      viewBox="0 0 176 88"
      preserveAspectRatio="xMinYMid slice"
      aria-hidden
      focusable="false"
    >
      <defs>
        {/* baseline r=28 over the top, left to right; r=36.5 under the
            bottom, left to right, so the letters stand inside the ring */}
        <path id={top} d="M 16,44 A 28,28 0 0 1 72,44" />
        <path id={bottom} d="M 7.5,44 A 36.5,36.5 0 0 0 80.5,44" />
      </defs>
      <g fill="none" stroke="currentColor" strokeWidth="1.5">
        <circle cx="44" cy="44" r="41" />
        <circle cx="44" cy="44" r="18" />
        {[0, 1, 2, 3].map((i) => (
          <path key={i} d={`M 90 ${23 + i * 14} q 10.5 -6 21 0 t 21 0 t 21 0 t 21 0`} />
        ))}
      </g>
      <g className="app-atlas-postmark-text">
        <text>
          <textPath href={`#${top}`} startOffset="50%" textAnchor="middle" textLength={fitA} lengthAdjust="spacingAndGlyphs">
            {a}
          </textPath>
        </text>
        {b && (
          <text>
            <textPath href={`#${bottom}`} startOffset="50%" textAnchor="middle" textLength={fitB} lengthAdjust="spacingAndGlyphs">
              {b}
            </textPath>
          </text>
        )}
        <text x="44" y="48.5" textAnchor="middle">
          {isoOf(place)}
        </text>
      </g>
    </svg>
  );
}
