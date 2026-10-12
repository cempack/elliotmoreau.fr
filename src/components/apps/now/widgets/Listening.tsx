"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { PixelGlyph } from "@/components/glyphs";
import { useHydrated } from "@/hooks/env";
import { useI18n } from "@/i18n/client";
import { timeAgo } from "@/lib/format";
import { SOCIALS } from "@/lib/socials";
import type { SpotifyStatus, TrackInfo } from "@/lib/spotify";
import { G_ARROW, LiveDot } from "../bits";
import { Crate } from "../Crate";
import { Deck } from "../Deck";
import { fill, fmtMs, useOnScreen, useTrackProgress } from "../lib";

export type Listen = { status: SpotifyStatus | null; track: TrackInfo | null; playing: boolean };

/** Header status: playing / paused / last played, with how long ago. */
export function ListeningMeta({ status, track, playing }: Listen) {
  const { t, lang } = useI18n();
  const l = t.now.listening;
  const mounted = useHydrated();
  if (!track) return null;
  const last = !status?.now;
  const ago = last && mounted && track.playedAt ? timeAgo(track.playedAt, lang) : "";
  return (
    <span className="app-now-status" data-live={playing || undefined}>
      <LiveDot live={playing} />
      {playing ? l.playing : last ? l.last : l.paused}
      {ago && <span className="app-now-status-ago tabular">{ago}</span>}
    </span>
  );
}

/** the progress meter's segment: a 4px cell and a 2px gap (see now.css) */
const SEG = 6;

/**
 * The progress meter, lit a whole segment at a time: it changes every few
 * seconds and never animates in between (no compositor work for motion
 * nobody could see through the mask anyway). The lime-to-ion gradient is
 * anchored to the whole bar, so the meter warms up as the song goes.
 */
function Progress({ progress, duration, label }: { progress: number | null; duration: number; label?: string }) {
  const ref = useRef<HTMLSpanElement>(null);
  const [segs, setSegs] = useState(0);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const ro = new ResizeObserver(([e]) => setSegs(Math.floor((e.contentRect.width + SEG - 4) / SEG)));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  const p = duration > 0 && progress != null ? Math.min(1, progress / duration) : 0;
  const lit = Math.floor(p * segs);
  return (
    <div className="app-now-progress">
      <span
        ref={ref}
        className="app-now-progress-bar"
        role="progressbar"
        aria-label={label}
        aria-valuemin={0}
        aria-valuemax={Math.round(duration / 1000)}
        aria-valuenow={progress != null ? Math.round(progress / 1000) : undefined}
      >
        {/* clipped, not moved: the gradient stays put and fills in from the left */}
        <span className="app-now-progress-fill" style={{ clipPath: `inset(0 calc(100% - ${lit * SEG}px) 0 0)` }} />
      </span>
      <span className="app-now-progress-times tabular" aria-hidden>
        <span>{progress != null ? fmtMs(progress) : "-:--"}</span>
        <span>{fmtMs(duration)}</span>
      </span>
    </div>
  );
}

/**
 * The record deck with the song on (or the last one played), the title and
 * the live progress under it, and the top artists in a crate beside it, or
 * under it on phones. With nothing from Spotify at all, the platter shows
 * its bare felt, the arm rests, and the crate still stands if there is one.
 */
export function Listening({ status, track, playing }: Listen) {
  const { t } = useI18n();
  const l = t.now.listening;
  const rootRef = useRef<HTMLDivElement>(null);
  const on = useOnScreen(rootRef, "40px");
  const progress = useTrackProgress(track, playing, on);
  const artistsAll = status?.artists;
  const artists = useMemo(() => (artistsAll ?? []).slice(0, 5), [artistsAll]);
  const crateLabels = useMemo(
    () => ({ title: l.topArtists, hint: l.crateHint, prev: l.cratePrev, next: l.crateNext, open: l.crateOpen }),
    [l.topArtists, l.crateHint, l.cratePrev, l.crateNext, l.crateOpen]
  );
  const seed = track ? `${track.title} · ${track.artist}` : null;

  return (
    <div ref={rootRef} className="app-now-listen" data-solo={artists.length === 0 || undefined}>
      <div className="app-now-listen-now" data-quiet={!track || undefined}>
        <Deck
          track={track && seed ? { seed, image: track.image } : null}
          playing={playing}
          last={!status?.now}
          progress={status?.now ? progress : null}
          duration={track?.durationMs ?? 0}
          href={track?.url || SOCIALS.spotifyUser}
          labels={{ open: track ? fill(l.open, { title: track.title }) : l.profile, needle: l.progress }}
        />
        {track ? (
          <div className="app-now-listen-info">
            <p className="app-now-listen-title" title={track.title}>
              {track.title}
            </p>
            <p className="app-now-listen-artist">{track.artist}</p>
            {track.album && <p className="app-now-listen-album">{track.album}</p>}
            {/* a position only means something for the track Spotify holds now */}
            {status?.now && track.durationMs > 0 && (
              <Progress
                progress={progress}
                duration={track.durationMs}
                label={progress != null ? fill(l.progress, { elapsed: fmtMs(progress), total: fmtMs(track.durationMs) }) : undefined}
              />
            )}
          </div>
        ) : (
          <div className="app-now-listen-info">
            <p className="app-now-listen-title">{l.nothing}</p>
            <p className="app-now-listen-album">{l.nothingBody}</p>
            <a href={SOCIALS.spotifyUser} target="_blank" rel="noopener noreferrer" className="app-now-link app-now-listen-profile">
              {l.profile}
              <PixelGlyph cells={G_ARROW} size={8} />
            </a>
          </div>
        )}
      </div>

      {artists.length > 0 && <Crate artists={artists} labels={crateLabels} />}
    </div>
  );
}
