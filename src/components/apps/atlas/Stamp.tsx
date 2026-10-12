"use client";

import { useEffect, useRef } from "react";
import { useArtPalette } from "@/hooks/useTheme";
import { QUARTER, useQuarterHour } from "@/hooks/useQuarterHour";
import { useSky } from "@/components/os/sky";
import { pinnedMs } from "@/components/os/wallpaper/sunClock";
import { skyLight } from "@/components/os/wallpaper/light";
import type { Locale } from "@/i18n/config";
import type { PlaceRow } from "@/lib/content";
import { isoOf } from "./geo";
import { layoutStamp, paintStamp, pixelText, ringName, stampDate, textWidth } from "./stampArt";

/** canvas pixels per art unit */
const UP = 4;

/** what a visit's date line says: as written if it fits the ring, else its year */
function visitLine(visited: string | undefined) {
  if (!visited) return null;
  const t = pixelText(visited);
  if (t && textWidth(t) <= 36) return t;
  return t.match(/\b(1[89]|20)\d\d\b/)?.[0] ?? null;
}

/**
 * A perforated postage stamp of the place's own sky, at the instant the
 * desktop is showing (the wallpaper's: now, or the phase pinned in
 * Control Center), painted on a canvas once and again each quarter hour
 * (stampArt.ts). `lg`: the place card's, its code and value printed in
 * the margin, and once the place has been visited (home included) the
 * postmark: a date-stamp with its name (home: today's date; a visit: its
 * date when the database has one) and three waves. A place on the list
 * stays mint. `sm`: the postcard's, the code alone. Perforations are a
 * CSS mask on a 12px (lg) or 8px grid; the drop shadow follows the cut.
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
  place: PlaceRow;
  size?: "lg" | "sm";
  /** the value printed in the margin (lg, A–Z 0–9), e.g. "1 050 KM" */
  value?: string;
  /** accessible name; omit for a decorative stamp */
  label?: string;
  /** display name, for the postmark */
  name?: string;
  lang?: Locale;
  /** cancel it if the place has been visited */
  postmark?: boolean;
}) {
  const ref = useRef<HTMLCanvasElement>(null);
  const P = useArtPalette();
  const { phase, mode } = useSky();
  const quarter = useQuarterHour();
  const cancelled = postmark && (place.home || place.status === "been");
  const shown = name ?? place.name.en;
  const code = isoOf(place);
  const printed = size === "lg" ? (value ?? null) : null;

  // paint at two CSS px a unit, whatever size the breakpoint gives it
  useEffect(() => {
    const c = ref.current;
    const box = c?.parentElement;
    if (!c || !box || !quarter) return;
    const ms = mode === "auto" ? quarter * QUARTER + QUARTER / 2 : pinnedMs(phase, new Date(quarter * QUARTER));
    const L = skyLight(ms, place.lat, place.lon);
    const when = place.home ? stampDate(quarter * QUARTER, lang) : visitLine(place.visited);
    const ring = cancelled ? [...ringName(shown), ...(when ? [when] : [])] : null;
    let painted = "";
    const paint = () => {
      const W = Math.round(box.clientWidth / 2);
      const H = Math.round(box.clientHeight / 2);
      if (W < 8 || H < 8 || painted === `${W}x${H}`) return;
      painted = `${W}x${H}`;
      const lay = layoutStamp(W, H, { code, value: printed, ring, cancelled });
      const buf = new Uint32Array(W * H);
      paintStamp(buf, lay, { id: place.id, L, inks: { paper: P.paper, type: P.ink950 } });
      // each unit as a 4 × 4 block, smoothed by the browser: crisp at 1x
      // and 2x, and clean edges while the card holds it tilted
      const big = new Uint32Array(W * UP * H * UP);
      for (let y = 0; y < H * UP; y++) {
        const row = ((y / UP) | 0) * W;
        for (let x = 0; x < W * UP; x++) big[y * W * UP + x] = buf[row + ((x / UP) | 0)];
      }
      c.width = W * UP;
      c.height = H * UP;
      c.getContext("2d")?.putImageData(new ImageData(new Uint8ClampedArray(big.buffer), W * UP, H * UP), 0, 0);
    };
    paint();
    const ro = new ResizeObserver(paint);
    ro.observe(box);
    return () => ro.disconnect();
  }, [quarter, mode, phase, place, cancelled, shown, code, printed, lang, P]);

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
      <span className="app-atlas-stamp-sheet">
        <span className="app-atlas-stamp-paper">
          <canvas ref={ref} className="app-atlas-stamp-art" width={1} height={1} />
        </span>
      </span>
    </span>
  );
}
