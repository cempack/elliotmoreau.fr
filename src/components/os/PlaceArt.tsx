"use client";

import dynamic from "next/dynamic";
import type { PlaceRow } from "@/lib/content";

// the postcard map (and its coastline data) loads only once a place shows up in a search
const PixelMap = dynamic(() => import("@/components/apps/atlas/PixelMap").then((m) => m.PixelMap), {
  ssr: false,
  loading: () => null,
});

const toneOf = (p: PlaceRow) => (p.home ? "home" : p.status);

/** A perforated postage stamp: paper, a tile in the place's tone, its country code. */
export function PlaceStamp({ place }: { place: PlaceRow }) {
  return (
    <span className="em-stamp" data-tone={toneOf(place)} aria-hidden>
      <span className="em-stamp-art">{place.iso}</span>
    </span>
  );
}

/** Spotlight's picture of a place: its Atlas postcard map, small (a result's thumb) or with its stamp (the preview). */
export function PlaceArt({ place, stamp = false }: { place: PlaceRow; stamp?: boolean }) {
  return (
    <span className="em-place-art" aria-hidden>
      <PixelMap place={place} className="em-place-map" />
      {stamp && (
        <span className="em-place-art-stamp">
          <PlaceStamp place={place} />
        </span>
      )}
    </span>
  );
}
