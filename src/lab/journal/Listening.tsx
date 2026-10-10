"use client";

import { useEffect, useRef, useState } from "react";
import { m, useInView } from "motion/react";
import { PixelPlanet } from "@/components/PixelPlanet";
import { spring } from "@/lib/motion";
import type { SpotifyStatus, TrackInfo } from "@/lib/spotify";
import { ChapterHead } from "./Chapter";
import { RiseItem } from "./Rise";
import { Eq } from "./Cover";
import { useJ } from "./strings";

const mmss = (ms: number) => {
  const s = Math.max(0, Math.round(ms / 1000));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
};

/** Seconds since mount while `on`, ticking once a second. */
function useElapsed(on: boolean) {
  const [s, setS] = useState(0);
  useEffect(() => {
    if (!on) return;
    const id = window.setInterval(() => setS((v) => v + 1), 1000);
    return () => window.clearInterval(id);
  }, [on]);
  return s;
}

const nameV = { rest: { x: 0 }, hover: { x: 16 } };

/**
 * Chapter five, back in the dark: the current track set as a headline,
 * a record whose label is the album art (or a pixel planet when there's
 * none) that turns only while something plays and you can see it, and
 * the top artists as a ranked list.
 */
export function Listening({
  status,
  track,
  playing,
}: {
  status: SpotifyStatus | null;
  track: TrackInfo | null;
  playing: boolean;
}) {
  const { c, j } = useJ();
  const recRef = useRef<HTMLDivElement>(null);
  const visible = useInView(recRef, { margin: "80px" });
  const elapsed = useElapsed(playing && !!track);
  const artists = status?.artists ?? [];
  const progress = track ? Math.min(track.durationMs, track.progressMs + elapsed * 1000) : 0;
  const frac = track && track.durationMs ? progress / track.durationMs : 0;

  return (
    <section id="listening" data-chapter="listening" className="j-sec j-listen" aria-label={c.listening}>
      <div className="j-wrap">
        <ChapterHead
          n={5}
          title={c.listening}
          aside={
            <>
              <Eq playing={playing} /> {playing ? c.nowPlaying : c.lastPlayed}
            </>
          }
        />

        {track && (
          <div className="j-np">
            <div className="j-rec-wrap" ref={recRef}>
              <div className="j-rec" data-spin={(playing && visible) || undefined} aria-hidden>
                <span className="j-rec-label">
                  {track.image ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={track.image} alt="" />
                  ) : (
                    <PixelPlanet seed={`${track.artist}-${track.album}`} className="j-rec-planet" />
                  )}
                </span>
                <span className="j-rec-hole" />
              </div>
            </div>
            <div className="j-np-text">
              <p className="j-np-k">
                {playing ? j.currently : c.lastPlayed}
                {!playing && status?.now && <span className="j-dim"> · {j.paused}</span>}
              </p>
              <h3 className="j-np-title">
                <em>{track.title}</em>
              </h3>
              <p className="j-np-artist">
                <span className="j-np-dash">—</span> {track.artist}
                {track.album && (
                  <span className="j-np-album">
                    , {j.from} <em>{track.album}</em>
                  </span>
                )}
              </p>
              {track.durationMs > 0 && (
                <div className="j-np-prog" aria-hidden>
                  <span>{mmss(progress)}</span>
                  <span className="j-np-bar">
                    <m.span initial={false} animate={{ scaleX: frac }} transition={spring.gentle} />
                  </span>
                  <span>{mmss(track.durationMs)}</span>
                </div>
              )}
              {track.url && (
                <a href={track.url} target="_blank" rel="noreferrer" className="j-btn j-btn-line" data-cursor={c.open}>
                  {j.listen}
                  <span className="j-arrow" aria-hidden>
                    ↗
                  </span>
                </a>
              )}
            </div>
          </div>
        )}

        {artists.length > 0 && (
          <div className="j-top">
            <p className="j-index-k">{c.topArtists}</p>
            <ol>
              {artists.slice(0, 5).map((a, i) => {
                const inner = (
                  <>
                    <span className="j-top-n" aria-hidden>
                      {String(i + 1).padStart(2, "0")}
                    </span>
                    <m.span className="j-top-name" variants={nameV} transition={spring.default}>
                      {a.name}
                    </m.span>
                    {a.url && (
                      <span className="j-row-arrow" aria-hidden>
                        ↗
                      </span>
                    )}
                  </>
                );
                return (
                  <RiseItem key={a.name} i={i}>
                    {a.url ? (
                      <m.a
                        href={a.url}
                        target="_blank"
                        rel="noreferrer"
                        className="j-top-row"
                        data-cursor={c.open}
                        initial="rest"
                        animate="rest"
                        whileHover="hover"
                      >
                        {inner}
                      </m.a>
                    ) : (
                      <m.div className="j-top-row" initial="rest" animate="rest" whileHover="hover">
                        {inner}
                      </m.div>
                    )}
                  </RiseItem>
                );
              })}
            </ol>
          </div>
        )}
      </div>
    </section>
  );
}
