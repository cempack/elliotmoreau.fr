"use client";

import { useEffect, useRef, useState } from "react";
import { PixelGlyph } from "@/components/glyphs";
import { useHydrated } from "@/hooks/env";
import { useI18n } from "@/i18n/client";
import { timeAgo } from "@/lib/format";
import { SOCIALS } from "@/lib/places";
import type { SpotifyStatus, TrackInfo } from "@/lib/spotify";
import { Art, G_ARROW, LiveDot, PixelCava } from "../bits";
import { PixelCover, Vinyl } from "../Cover";
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
      <LiveDot live={playing} still />
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
 * Now playing as the hero of the widget (the art, or a seeded pixel sleeve,
 * with the record sliding out of it while it plays; a pixel cava; live
 * progress), then the top artists, ranked. Ranks only:
 * Spotify gives an order, not play counts, so there are no bars. When
 * Spotify has nothing at all, the tile holds a quiet still life instead:
 * a sleeve with the record tucked in, the eq lying flat.
 */
export function Listening({ status, track, playing }: Listen) {
  const { t } = useI18n();
  const l = t.now.listening;
  const rootRef = useRef<HTMLDivElement>(null);
  const on = useOnScreen(rootRef, "40px");
  const progress = useTrackProgress(track, playing, on);
  const artists = status?.artists ?? [];

  return (
    <div ref={rootRef} className="app-now-listen" data-solo={artists.length === 0 || undefined}>
      {track ? (
        <div className="app-now-listen-now">
          <a
            href={track.url || SOCIALS.spotifyUser}
            target="_blank"
            rel="noopener noreferrer"
            className="app-now-listen-art"
            aria-label={fill(l.open, { title: track.title })}
           
          >
            <Vinyl seed={`${track.title} · ${track.artist}`} playing={playing} />
            <Art image={track.image} seed={`${track.title} · ${track.artist}`} />
          </a>
          <div className="app-now-listen-info">
            <p className="app-now-listen-title" title={track.title}>
              {track.title}
            </p>
            <p className="app-now-listen-artist">{track.artist}</p>
            {track.album && <p className="app-now-listen-album">{track.album}</p>}
            <PixelCava playing={playing} className="app-now-listen-cava" />
            {/* a position only means something for the track Spotify holds now */}
            {status?.now && track.durationMs > 0 && (
              <Progress
                progress={progress}
                duration={track.durationMs}
                label={progress != null ? fill(l.progress, { elapsed: fmtMs(progress), total: fmtMs(track.durationMs) }) : undefined}
              />
            )}
          </div>
        </div>
      ) : (
        <div className="app-now-listen-now app-now-listen-now--quiet">
          <span className="app-now-listen-art" aria-hidden>
            <Vinyl seed="silence" playing={false} />
            <span className="app-now-art app-now-art--quiet">
              <PixelCover seed="silence" className="app-now-art-cover" />
            </span>
          </span>
          <div className="app-now-listen-info">
            <p className="app-now-listen-title">{l.nothing}</p>
            <p className="app-now-listen-album">{l.nothingBody}</p>
            <PixelCava playing={false} className="app-now-listen-cava" />
            <a href={SOCIALS.spotifyUser} target="_blank" rel="noopener noreferrer" className="app-now-link app-now-listen-profile">
              {l.profile}
              <PixelGlyph cells={G_ARROW} size={8} />
            </a>
          </div>
        </div>
      )}

      {artists.length > 0 && (
        <div className="app-now-artists">
          <h3 className="app-now-label">{l.topArtists}</h3>
          <ol className="app-now-artists-list">
            {artists.slice(0, 5).map((a, i) => {
              const body = (
                <>
                  <span className="app-now-artist-face">
                    <Art image={a.image} seed={`artist · ${a.name}`} n={12} className={a.image ? "app-now-art--round" : "app-now-art--sleeve"} />
                    {/* the <ol> carries the rank for assistive tech */}
                    <span className="app-now-artist-rank tabular" aria-hidden>
                      {i + 1}
                    </span>
                  </span>
                  <span className="app-now-artist-name" title={a.name}>
                    {a.name}
                  </span>
                </>
              );
              return (
                <li key={a.name}>
                  {a.url ? (
                    <a href={a.url} target="_blank" rel="noopener noreferrer" className="app-now-artist">
                      {body}
                    </a>
                  ) : (
                    <span className="app-now-artist">{body}</span>
                  )}
                </li>
              );
            })}
          </ol>
        </div>
      )}
    </div>
  );
}
