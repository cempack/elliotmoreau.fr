"use client";

import { Fragment } from "react";
import { Marquee } from "@/components/ui/Marquee";
import { PixelGlyph, GLYPH_STAR } from "@/components/glyphs";
import { PLACES } from "@/lib/places";
import { timeAgo } from "@/lib/format";
import { useParisTime } from "@/hooks/useParisTime";
import type { ActivityInfo } from "@/lib/github";
import type { TrackInfo } from "@/lib/spotify";
import { useMounted, useReduced } from "./hooks";
import { useJ } from "./strings";

/** Section kicker row: "01 — Live signals ........ note". */
export function Kicker({ n, label, note }: { n: string; label: string; note?: React.ReactNode }) {
  return (
    <div className="j-kicker">
      <span className="j-kicker-n">{n}</span>
      <span className="j-kicker-rule" aria-hidden />
      <span className="j-kicker-label">{label}</span>
      {note && <span className="j-kicker-note">{note}</span>}
    </div>
  );
}

/**
 * The shared Marquee, mounted only on the client: it picks its reduced
 * markup from motion's useReducedMotion during hydration, which mismatches
 * the server HTML for reduced-motion readers. Until mount (and always
 * under reduced motion) this renders the same first copy, static.
 */
function Band({ children, speed, className }: { children: React.ReactNode; speed: number; className: string }) {
  const mounted = useMounted();
  const reduced = useReduced();
  if (mounted && !reduced)
    return (
      <Marquee speed={speed} className={className}>
        {children}
      </Marquee>
    );
  return (
    <div className={`em-marquee ${className}`}>
      <div className="em-marquee-track">
        <div className="em-marquee-copy">{children}</div>
      </div>
    </div>
  );
}

/**
 * Chapter one: the live signals as a huge italic ticker that leans into
 * your scroll, over a reversed outline band carrying the table of contents.
 */
export function Signals({
  track,
  playing,
  activity,
}: {
  track: TrackInfo | null;
  playing: boolean;
  activity: ActivityInfo | null;
}) {
  const { c, j } = useJ();
  const mounted = useMounted();
  const { time } = useParisTime();
  const want = PLACES.filter((p) => p.status === "want").length;

  const items: { k: string; v: React.ReactNode }[] = [];
  if (track)
    items.push({
      k: playing ? c.nowPlaying : c.lastPlayed,
      v: (
        <>
          <em>{track.title}</em> <span className="j-sig-thin">—</span> {track.artist}
        </>
      ),
    });
  if (activity)
    items.push({
      k: `${c.lastPush}${mounted ? ` · ${timeAgo(activity.createdAt, c.lang)}` : ""}`,
      v: (
        <>
          {j.pushedTo} <em>{activity.repo}</em>
        </>
      ),
    });
  items.push({ k: c.atlas, v: <>{j.placesLine(PLACES.length, want)}</> });
  items.push({
    k: `${c.localTime}${time ? ` · ${time}` : ""}`,
    v: <em>{j.writingFrom}</em>,
  });

  const toc = [j.chapters.writing, j.chapters.atlas, j.chapters.work, j.chapters.listening, j.chapters.contact];

  return (
    <section id="signals" data-chapter="signals" className="j-signals" aria-label={j.signals}>
      <div className="j-wrap">
        <Kicker n="01" label={j.signals} note={j.signalsNote} />
      </div>
      <Band speed={46} className="j-sig-band">
        {items.map((it, i) => (
          <span key={i} className="j-sig-item">
            <span className="j-sig-k">{it.k}</span>
            <span className="j-sig-v">{it.v}</span>
            <PixelGlyph cells={GLYPH_STAR} className="j-sig-star" size={28} />
          </span>
        ))}
      </Band>
      <Band speed={-28} className="j-sig-toc">
        {toc.map((t, i) => (
          <Fragment key={i}>
            <span className="j-sig-toc-item">
              <span className="j-sig-toc-n">{String(i + 2).padStart(2, "0")}</span>
              {t}
            </span>
          </Fragment>
        ))}
      </Band>
    </section>
  );
}
