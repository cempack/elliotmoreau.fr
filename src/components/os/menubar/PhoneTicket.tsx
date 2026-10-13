"use client";

import { useMemo, useState, useSyncExternalStore } from "react";
import { encode } from "uqr";
import { useI18n } from "@/i18n/client";
import { useSound } from "@/lib/sound";
import { useArtPalette } from "@/hooks/useTheme";

/**
 * Continue on your phone: a compact row in the About panel with a pixel QR
 * code of exactly this page (app, filter, post, place: the whole URL with
 * its query and hash), to pick up on a phone. Drawn in the site's pixels on
 * a small paper tile (a code needs a light ground to scan): data modules
 * as LED squares, the three finder eyes with pupils in the theme's accent,
 * the emOS mark punched out of the middle (error correction H carries it).
 * It "prints" in when the panel opens. Hidden on phones: you're already
 * there.
 */

const subscribe = (cb: () => void) => {
  window.addEventListener("popstate", cb);
  window.addEventListener("hashchange", cb);
  return () => {
    window.removeEventListener("popstate", cb);
    window.removeEventListener("hashchange", cb);
  };
};
const href = () => window.location.href;


/** "elliotmoreau.fr/work?q=go" */
const short = (url: string) => url.replace(/^https?:\/\/(www\.)?/, "").replace(/\/$/, "");

/** the emOS mark, 7×5 cells: e and m */
const MARK = ["eee.m.m", "e.e.mmm", "eee.m.m", "e...m.m", "eee.m.m"];

function QrArt({ url }: { url: string }) {
  const P = useArtPalette();
  const INK = P.ink900;
  const PUPIL = P.signalDeep;
  const qr = useMemo(() => encode(url, { ecc: "H", border: 0 }), [url]);
  const n = qr.size;
  // the hole for the mark: odd, centred, about a fifth of the code
  const hole = Math.max(7, (Math.round(n / 5) | 1) + 2);
  const h0 = Math.floor((n - hole) / 2);
  const inHole = (x: number, y: number) => x >= h0 && x < h0 + hole && y >= h0 && y < h0 + hole;

  const data: string[] = [];
  const eyes: string[] = [];
  const pupils: string[] = [];
  for (let y = 0; y < n; y++) {
    for (let x = 0; x < n; x++) {
      if (!qr.data[y][x] || inHole(x, y)) continue;
      const type = qr.types[y][x];
      if (type === 2) {
        // finder patterns: the 3×3 centre of each 7×7 eye is its pupil
        const fx = x < 7 ? x : x - (n - 7);
        const fy = y < 7 ? y : y - (n - 7);
        if (fx >= 2 && fx <= 4 && fy >= 2 && fy <= 4) pupils.push(`M${x} ${y}h1v1h-1z`);
        else eyes.push(`M${x} ${y}h1v1h-1z`);
      } else {
        data.push(`M${x + 0.09} ${y + 0.09}h0.82v0.82h-0.82z`);
      }
    }
  }
  const mx = h0 + Math.floor((hole - 7) / 2);
  const my = h0 + Math.floor((hole - 5) / 2);
  const mark: string[] = [];
  MARK.forEach((row, j) => [...row].forEach((c, i) => c !== "." && mark.push(`M${mx + i} ${my + j}h1v1h-1z`)));

  return (
    <svg className="os-ticket-qr" viewBox={`-2 -2 ${n + 4} ${n + 4}`} shapeRendering="crispEdges" style={{ "--qr-rows": n } as React.CSSProperties} aria-hidden>
      <path d={data.join("")} fill={INK} />
      <path d={eyes.join("")} fill={INK} />
      <path d={pupils.join("")} fill={PUPIL} />
      <path d={mark.join("")} fill={INK} />
    </svg>
  );
}

export function PhoneTicket() {
  const { t } = useI18n();
  const a = t.shell.about;
  const { blip } = useSound();
  const url = useSyncExternalStore(subscribe, href, () => "");
  const [copied, setCopied] = useState(false);
  if (!url) return null;

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      blip("copy");
      window.setTimeout(() => setCopied(false), 1600);
    } catch {}
  };

  return (
    <section className="os-ticket" aria-labelledby="os-ticket-title">
      <div className="os-ticket-stub">
        <QrArt url={url} />
      </div>
      <div className="os-ticket-body">
        <h3 id="os-ticket-title" className="os-ticket-title">
          {a.phoneTitle}
        </h3>
        <p className="os-ticket-text">{a.phoneBody}</p>
        <div className="os-ticket-row">
          <p className="os-ticket-url" title={url}>
            {short(url)}
          </p>
          <button type="button" className="os-ticket-copy" onClick={copy} data-copied={copied || undefined}>
            {copied ? a.copied : a.copyLink}
          </button>
        </div>
      </div>
    </section>
  );
}
