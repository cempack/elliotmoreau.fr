"use client";

import { useState } from "react";
import { useI18n } from "@/i18n/client";
import { timeAgo } from "@/lib/format";
import { Monogram } from "@/components/Monogram";
import { GLYPH_NOTE } from "@/components/glyphs";
import type { SpotifyStatus, TrackInfo } from "@/lib/spotify";
import { ArrowUpRight, PixelEq } from "./glyphs";
import { useNow } from "./util";

export type Music = { status: SpotifyStatus | null; track: TrackInfo | null; playing: boolean };

const mmss = (ms: number) => {
  const s = Math.max(0, Math.floor(ms / 1000));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
};

/** Album art, or a pixel planet seeded by the album when there is none. */
export function Cover({ track, className = "" }: { track: TrackInfo | null; className?: string }) {
  if (track?.image) {
    // remote Spotify CDN art, small and already sized: no optimizer needed
    // eslint-disable-next-line @next/next/no-img-element
    return <img src={track.image} alt="" width={128} height={128} className={`os-menubar-cover ${className}`} />;
  }
  return (
    <span className={`os-menubar-cover os-menubar-cover--pixel ${className}`} aria-hidden>
      <Monogram text={track ? track.album || track.title : "silence"} glyph={GLYPH_NOTE} className="os-menubar-cover-planet" />
    </span>
  );
}

/** Elapsed / total, ticking locally between polls while playing. */
function Progress({ track, playing, label }: { track: TrackInfo; playing: boolean; label: string }) {
  const now = useNow(playing ? "second" : "minute");
  const key = `${track.title}|${track.progressMs}|${playing}`;
  const [base, setBase] = useState<{ key: string; at: number } | null>(null);
  // rebase the local clock whenever a fresh poll lands (adjust-state-on-change)
  if (now && (!base || base.key !== key)) setBase({ key, at: now.getTime() });
  const elapsed = playing && base && now ? now.getTime() - base.at : 0;
  const total = track.durationMs || 1;
  const pos = Math.min(total, track.progressMs + elapsed);
  return (
    <div className="os-menubar-progress">
      <span className="tabular">{mmss(pos)}</span>
      <span
        className="os-menubar-progress-bar"
        role="progressbar"
        aria-label={label}
        aria-valuemin={0}
        aria-valuemax={Math.round(total / 1000)}
        aria-valuenow={Math.round(pos / 1000)}
        aria-valuetext={`${mmss(pos)} / ${mmss(total)}`}
      >
        <i style={{ transform: `scaleX(${pos / total})` }} />
      </span>
      <span className="tabular">{mmss(total)}</span>
    </div>
  );
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
  const artists = status?.artists?.slice(0, 4) ?? [];
  return (
    <div className="os-menubar-music">
      <p className="os-menubar-kicker os-menubar-music-kicker">
        <span className="os-menubar-live" data-on={playing || undefined} aria-hidden />
        {playing ? p.nowPlaying : track ? p.lastPlayed : p.nothing}
        {!playing && track?.playedAt && <span className="os-menubar-dim"> · {timeAgo(track.playedAt, lang)}</span>}
      </p>
      {track ? (
        <>
          <div className="os-menubar-music-track">
            <Cover track={track} />
            <div className="os-menubar-music-meta">
              <p className="os-menubar-music-name">{track.title}</p>
              <p className="os-menubar-music-artist">{track.artist}</p>
              {track.album && <p className="os-menubar-music-album">{track.album}</p>}
            </div>
            <PixelEq playing={playing} className="os-menubar-eq--lg" />
          </div>
          {track.durationMs > 0 && <Progress track={track} playing={playing} label={t.shell.music.progress} />}
        </>
      ) : (
        <div className="os-menubar-music-track">
          <Cover track={null} />
          <p className="os-menubar-music-artist">{p.nothing}</p>
        </div>
      )}
      {artists.length > 0 && (
        <p className="os-menubar-music-repeat">
          <span className="os-menubar-dim">{t.shell.music.topArtists}</span>{" "}
          {artists.map((a) => a.name).join(" · ")}
        </p>
      )}
      {track?.url && (
        <a className="os-menubar-action os-menubar-action--wide" href={track.url} target="_blank" rel="noopener noreferrer">
          <span>{p.openSpotify}</span>
          <ArrowUpRight />
        </a>
      )}
    </div>
  );
}
