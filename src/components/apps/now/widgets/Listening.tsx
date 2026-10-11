"use client";

import { PixelPlanet } from "@/components/PixelPlanet";
import { PixelGlyph } from "@/components/glyphs";
import { useHydrated } from "@/hooks/env";
import { useI18n } from "@/i18n/client";
import { timeAgo } from "@/lib/format";
import { SOCIALS } from "@/lib/places";
import type { SpotifyStatus, TrackInfo } from "@/lib/spotify";
import { Art, G_ARROW, LiveDot, PixelCava } from "../bits";
import { fill, fmtMs, useTrackProgress } from "../lib";

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

/**
 * Now playing as the hero of the widget (art or a seeded pixel planet, a
 * pixel cava, live progress), then the top artists, ranked. Ranks only:
 * Spotify gives an order, not play counts, so there are no bars.
 */
export function Listening({ status, track, playing }: Listen) {
  const { t } = useI18n();
  const l = t.now.listening;
  const progress = useTrackProgress(track, playing);
  const artists = status?.artists ?? [];
  const p = track && track.durationMs > 0 && progress != null ? progress / track.durationMs : 0;

  return (
    <div className="app-now-listen">
      {track ? (
        <div className="app-now-listen-now">
          <a
            href={track.url || SOCIALS.spotifyUser}
            target="_blank"
            rel="noopener noreferrer"
            className="app-now-listen-art"
            aria-label={fill(l.open, { title: track.title })}
            data-cursor="Spotify"
          >
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
              <div className="app-now-progress">
                <span
                  className="app-now-progress-bar"
                  role="progressbar"
                  aria-label={progress != null ? fill(l.progress, { elapsed: fmtMs(progress), total: fmtMs(track.durationMs) }) : undefined}
                  aria-valuemin={0}
                  aria-valuemax={Math.round(track.durationMs / 1000)}
                  aria-valuenow={progress != null ? Math.round(progress / 1000) : undefined}
                >
                  <span className="app-now-progress-fill" style={{ transform: `translateX(${(p - 1) * 100}%)` }} />
                </span>
                <span className="app-now-progress-times tabular" aria-hidden>
                  <span>{progress != null ? fmtMs(progress) : "–:––"}</span>
                  <span>{fmtMs(track.durationMs)}</span>
                </span>
              </div>
            )}
          </div>
        </div>
      ) : (
        <div className="app-now-listen-empty">
          <span className="app-now-art app-now-art--quiet" aria-hidden>
            <PixelPlanet seed="silence" className="app-now-art-planet" />
          </span>
          <div>
            <p className="app-now-listen-title">{l.nothing}</p>
            <p className="app-now-listen-album">{l.nothingBody}</p>
            <a href={SOCIALS.spotifyUser} target="_blank" rel="noopener noreferrer" className="app-now-link">
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
                    <Art image={a.image} seed={`artist · ${a.name}`} className="app-now-art--round" />
                    {/* the <ol> carries the rank for assistive tech */}
                    <span className="app-now-artist-rank tabular" aria-hidden>
                      {i + 1}
                    </span>
                  </span>
                  <span className="app-now-artist-name">{a.name}</span>
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
