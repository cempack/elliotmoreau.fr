"use client";

import { useState } from "react";
import { useI18n } from "@/i18n/client";
import { timeAgo } from "@/lib/format";
import type { SpotifyStatus, TrackInfo } from "@/lib/spotify";
import { ArrowUpRight, PixelEq } from "./glyphs";
import { Cassette } from "./Cassette";
import { useNow } from "./util";

export type Music = { status: SpotifyStatus | null; track: TrackInfo | null; playing: boolean };

const mmss = (ms: number) => {
  const s = Math.max(0, Math.floor(ms / 1000));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
};

/** Elapsed ms, ticking locally between polls while playing. */
function useTrackPos(track: TrackInfo | null, playing: boolean) {
  const now = useNow(playing ? "second" : "minute");
  const key = track ? `${track.title}|${track.progressMs}|${playing}` : "";
  const [base, setBase] = useState<{ key: string; at: number } | null>(null);
  // rebase the local clock whenever a fresh poll lands (adjust-state-on-change)
  if (now && (!base || base.key !== key)) setBase({ key, at: now.getTime() });
  if (!track) return 0;
  const elapsed = playing && base && now ? now.getTime() - base.at : 0;
  return Math.min(track.durationMs || 0, track.progressMs + elapsed);
}

/** Menu bar face: pixel equalizer + the truncated title. */
export function MusicTrigger({ music }: { music: Music }) {
  const { t } = useI18n();
  const { track, playing } = music;
  return (
    <>
      <PixelEq playing={playing} />
      <span className="os-menubar-music-title" data-playing={playing || undefined}>
        {track ? track.title : t.shell.music.offline}
      </span>
    </>
  );
}

export function MusicPanel({ music }: { music: Music }) {
  const { t, lang } = useI18n();
  const { track, playing, status } = music;
  const p = t.shell.player;
  const m = t.shell.music;
  const pos = useTrackPos(track, playing);
  const total = track?.durationMs ?? 0;
  const artists = status?.artists?.slice(0, 5) ?? [];
  return (
    <div className="os-menubar-music">
      <p className="os-menubar-kicker os-menubar-music-kicker">
        <span className="os-menubar-live" data-on={playing || undefined} aria-hidden />
        {playing ? p.nowPlaying : track ? p.lastPlayed : p.nothing}
        {!playing && track?.playedAt && <span className="os-menubar-dim"> · {timeAgo(track.playedAt, lang)}</span>}
      </p>
      <Cassette
        track={track}
        playing={playing}
        status={status}
        pos={pos}
        labels={{ showB: m.showB, showA: m.showA, repeat: m.repeatLately, blank: p.nothing }}
      />
      {/* what the cassette says, for assistive tech */}
      <div className="sr-only">
        {track && (
          <p>
            {track.title}, {track.artist}
            {track.album ? `, ${track.album}` : ""}
          </p>
        )}
        {track && total > 0 && (
          <span
            role="progressbar"
            aria-label={m.progress}
            aria-valuemin={0}
            aria-valuemax={Math.round(total / 1000)}
            aria-valuenow={Math.round(pos / 1000)}
            aria-valuetext={`${mmss(pos)} / ${mmss(total)}`}
          />
        )}
        {artists.length > 0 && (
          <ul aria-label={m.repeatLately}>
            {artists.map((a) => (
              <li key={a.name}>{a.url ? <a href={a.url}>{a.name}</a> : a.name}</li>
            ))}
          </ul>
        )}
      </div>
      {track?.url && (
        <a className="os-menubar-action os-menubar-action--wide" href={track.url} target="_blank" rel="noopener noreferrer">
          <span>{p.openSpotify}</span>
          <ArrowUpRight />
        </a>
      )}
    </div>
  );
}
