"use client";

/**
 * CONTRACT (owner: window agent)
 * Persistent now-playing picture-in-picture widget (fixed, all routes).
 * Glass card: artwork (or seeded PixelPlanet when there's no image),
 * title/artist, pixel equalizer that moves only while playing, progress.
 * Fling it with a pointer/finger: 1:1 tracking from the grab offset, on
 * release project the velocity (project()) and snap to the nearest of
 * four safe corners (clear of menu bar and dock) with a spring carrying
 * the release velocity (spring.flick only after a real throw); rubber-band
 * past the viewport. Remembers its corner. Collapses to a pill on tap of a
 * chevron; hidden when there's no track. Reads useSpotifyStatus(seed from
 * useSiteData().spotify).
 */
export function MiniPlayer() {
  return null;
}
