"use client";

import { PixelPlanet } from "@/components/PixelPlanet";
import { PixelLabel } from "@/components/PixelLabel";
import type { Place } from "@/lib/places";
import { isoOf } from "./geo";

/**
 * A perforated postage stamp. `lg`: the place card's stamp, a PixelPlanet
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
  postmark = false,
}: {
  place: Place;
  size?: "lg" | "sm";
  /** short pixel text on the value strip (lg), e.g. "1050 KM" */
  value?: string;
  /** accessible name; omit for a decorative stamp */
  label?: string;
  /** display name, for the postmark */
  name?: string;
  postmark?: boolean;
}) {
  const tone = place.home ? "home" : place.status;
  return (
    <span
      className="app-atlas-stamp"
      data-size={size}
      data-tone={tone}
      role={label ? "img" : undefined}
      aria-label={label}
      aria-hidden={label ? undefined : true}
    >
      <span className="app-atlas-stamp-paper">
        <span className="app-atlas-stamp-art">
          {size === "lg" ? (
            <>
              <PixelPlanet seed={place.id} className="app-atlas-stamp-planet" />
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
      </span>
      {postmark && <Postmark place={place} name={name ?? place.name.en} />}
    </span>
  );
}

/** Circular date-stamp with wavy cancellation lines, in hairline ink.
    Drawn 1:1 (no scaling) so its 12px lettering stays 12px. */
function Postmark({ place, name }: { place: Place; name: string }) {
  const id = `app-atlas-pm-${place.id}`;
  const lat = `${Math.round(Math.abs(place.lat))}°${place.lat >= 0 ? "N" : "S"}`;
  const text = `${name.toUpperCase()} · ${lat}`;
  // baseline circle r=28 around (44,44), starting at 9 o'clock, clockwise
  const ring = 2 * Math.PI * 28;
  return (
    <svg className="app-atlas-postmark" width="176" height="88" viewBox="0 0 176 88" aria-hidden focusable="false">
      <defs>
        <path id={id} d="M 16,44 a 28,28 0 1,1 56,0 a 28,28 0 1,1 -56,0" />
      </defs>
      <g fill="none" stroke="currentColor" strokeWidth="1.5">
        <circle cx="44" cy="44" r="41" />
        <circle cx="44" cy="44" r="18" />
        {[0, 1, 2, 3].map((i) => (
          <path key={i} d={`M 90 ${23 + i * 14} q 10.5 -6 21 0 t 21 0 t 21 0 t 21 0`} />
        ))}
      </g>
      <text className="app-atlas-postmark-ring">
        <textPath href={`#${id}`} textLength={Math.min(ring * 0.96, text.length * 7.6)} lengthAdjust="spacing">
          {text}
        </textPath>
      </text>
      <text x="44" y="48.5" textAnchor="middle" className="app-atlas-postmark-mid">
        {isoOf(place)}
      </text>
    </svg>
  );
}
