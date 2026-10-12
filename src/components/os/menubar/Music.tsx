"use client";

import "../menubar-panels.css";

import { useI18n } from "@/i18n/client";
import { timeAgo } from "@/lib/format";
import type { SpotifyStatus, TrackInfo } from "@/lib/spotify";
import { ArrowUpRight } from "./glyphs";
import { Cassette } from "./Cassette";

export type Music = { status: SpotifyStatus | null; track: TrackInfo | null; playing: boolean };

/**
 * The now-playing panel: the cassette (which keeps its own time, so
 * nothing here re-renders while a song plays), what it says for
 * assistive tech, and the way out to Spotify.
 */
export function MusicPanel({ music }: { music: Music }) {
  const { t, lang } = useI18n();
  const { track, playing, status } = music;
  const p = t.shell.player;
  const m = t.shell.music;
  const artists = status?.artists?.slice(0, 5) ?? [];
  const state = playing ? p.nowPlaying : status?.now ? p.paused : track ? p.lastPlayed : p.nothing;
  return (
    <div className="os-menubar-music">
      <Cassette
        track={track}
        playing={playing}
        status={status}
        head={
          <p className="os-menubar-kicker os-menubar-music-kicker">
            {state}
            {!playing && track?.playedAt && <span className="os-menubar-dim"> · {timeAgo(track.playedAt, lang)}</span>}
          </p>
        }
        foot={
          track?.url && (
            <a className="os-menubar-action os-tape-open" href={track.url} target="_blank" rel="noopener noreferrer">
              <span>{p.openSpotify}</span>
              <ArrowUpRight />
            </a>
          )
        }
        labels={{ showB: m.showB, showA: m.showA, sides: m.sides, sideA: m.sideA, sideB: m.sideB, repeat: m.repeatLately, progress: m.progress }}
      />
      {/* what the cassette says, for assistive tech */}
      <div className="sr-only">
        {track && (
          <p>
            {track.title}, {track.artist}
            {track.album ? `, ${track.album}` : ""}
          </p>
        )}
        {artists.length > 0 && (
          <ul aria-label={m.repeatLately}>
            {artists.map((a) => (
              <li key={a.name}>{a.url ? <a href={a.url}>{a.name}</a> : a.name}</li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
