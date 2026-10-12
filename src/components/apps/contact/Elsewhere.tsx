"use client";

import { useEffect, useState } from "react";
import type { SiteData } from "@/lib/data";
import type { SpotifyStatus, TrackInfo } from "@/lib/spotify";
import { useI18n } from "@/i18n/client";
import { useHydrated, useReduced } from "@/hooks/env";
import { useSpotifyStatus } from "@/hooks/useSpotifyStatus";
import { SOCIALS } from "@/lib/places";
import { timeAgo } from "@/lib/format";
import { G_CODE, G_NOTE, G_PLAY, G_TOOT, G_X } from "./glyphs";
import { fill } from "./mail";
import { LetterLink, Wall, type Box } from "./Wall";

type Listen = { track: TrackInfo | null; playing: boolean };

/** The live track, mounted (and polling) only while this mailbox is open. */
function LiveSpotify({ seed, children }: { seed: SpotifyStatus | null; children: (l: Listen) => React.ReactNode }) {
  const { track, playing } = useSpotifyStatus(seed);
  return <>{children({ track, playing })}</>;
}

/** album art in two inks of the letter's own (ink on cream), ordered-dithered; the plain image if it can't be read */
function useTwoTone(src: string | null | undefined, size = 32) {
  const [out, setOut] = useState<{ src: string; url: string } | null>(null);
  useEffect(() => {
    if (!src) return;
    let dead = false;
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.decoding = "async";
    img.onload = () => {
      if (dead) return;
      try {
        const cv = document.createElement("canvas");
        cv.width = size;
        cv.height = size;
        const ctx = cv.getContext("2d", { willReadFrequently: true });
        if (!ctx) return;
        ctx.drawImage(img, 0, 0, size, size);
        const im = ctx.getImageData(0, 0, size, size);
        const d = im.data;
        const B = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5];
        let lo = 255;
        let hi = 0;
        for (let i = 0; i < d.length; i += 4) {
          const l = 0.2126 * d[i] + 0.7152 * d[i + 1] + 0.0722 * d[i + 2];
          lo = Math.min(lo, l);
          hi = Math.max(hi, l);
        }
        for (let y = 0; y < size; y++)
          for (let x = 0; x < size; x++) {
            const i = (y * size + x) * 4;
            const l = (0.2126 * d[i] + 0.7152 * d[i + 1] + 0.0722 * d[i + 2] - lo) / Math.max(1, hi - lo);
            const on = l > (B[((y & 3) << 2) | (x & 3)] + 0.5) / 16;
            // cream paper and a deep green-black ink
            d[i] = on ? 235 : 31;
            d[i + 1] = on ? 229 : 38;
            d[i + 2] = on ? 214 : 33;
            d[i + 3] = 255;
          }
        ctx.putImageData(im, 0, 0);
        setOut({ src, url: cv.toDataURL() });
      } catch {
        // a CDN that doesn't allow reading its pixels: the plain image stands in
      }
    };
    img.src = src;
    return () => {
      dead = true;
    };
  }, [src, size]);
  return out && out.src === src ? out.url : null;
}

function SpotifyLetter({ track, playing }: { track: TrackInfo; playing: boolean }) {
  const { t } = useI18n();
  const c = t.contact;
  const art = useTwoTone(track.image);
  return (
    <div className="app-contact-ledge-body app-contact-ledge-body--track">
      {track.image && (
        // eslint-disable-next-line @next/next/no-img-element
        <img className="app-contact-ledge-art" src={art ?? track.image} alt="" data-dithered={art ? "" : undefined} draggable={false} />
      )}
      <div className="app-contact-ledge-text">
        <p className="app-contact-ledge-k" data-live={playing || undefined}>
          {playing ? c.playingNow : c.lastPlayed}
        </p>
        <p className="app-contact-ledge-title">{track.title}</p>
        <p className="app-contact-ledge-meta">{track.artist}</p>
        {track.url && <LetterLink href={track.url}>{c.openTrack}</LetterLink>}
      </div>
    </div>
  );
}

/**
 * Elsewhere: the other places to find Elliot, as a wall of letterboxes
 * (see Wall). GitHub and Spotify have mail in the slot from real data;
 * nothing is invented for the others. Mastodon keeps rel="me" for
 * profile verification.
 */
export function Elsewhere({ data, active }: { data: SiteData; active: boolean }) {
  const { t, lang } = useI18n();
  const c = t.contact;
  const hydrated = useHydrated();
  const reduced = useReduced();

  const push = data.activity
    ? {
        when: data.activity.createdAt,
        repo: data.activity.repo.split("/").pop() ?? data.activity.repo,
        url: data.activity.repoUrl,
        message: data.activity.message.split("\n")[0],
      }
    : data.repos[0]?.pushedAt
      ? { when: data.repos[0].pushedAt, repo: data.repos[0].name, url: data.repos[0].url, message: "" }
      : null;

  const boxes = (listen: Listen): Box[] => [
    {
      id: "github",
      name: "GitHub",
      handle: "@cempack",
      href: SOCIALS.github,
      note: c.githubNote,
      glyph: G_CODE,
      letter: push
        ? {
            edge: push.repo,
            label: fill(c.pullLetter, { name: "GitHub" }),
            body: (
              <div className="app-contact-ledge-body">
                <div className="app-contact-ledge-text">
                  <p className="app-contact-ledge-k">{hydrated ? fill(c.githubLive, { when: timeAgo(push.when, lang), repo: push.repo }) : push.repo}</p>
                  {push.message && <p className="app-contact-ledge-title">{push.message}</p>}
                  {push.url && <LetterLink href={push.url}>{c.openRepo}</LetterLink>}
                </div>
              </div>
            ),
          }
        : undefined,
    },
    {
      id: "youtube",
      name: "YouTube",
      handle: "@cempack",
      href: SOCIALS.youtube,
      note: c.youtubeNote,
      glyph: G_PLAY,
    },
    {
      id: "mastodon",
      name: "Mastodon",
      handle: "@cempack@mastodon.social",
      href: SOCIALS.mastodon,
      note: c.mastodonNote,
      glyph: G_TOOT,
      rel: "me noopener noreferrer",
    },
    {
      id: "x",
      name: "X",
      handle: "@cempack_",
      href: SOCIALS.x,
      note: c.xNote,
      glyph: G_X,
    },
    {
      id: "spotify",
      name: "Spotify",
      handle: c.spotifyHandle,
      href: SOCIALS.spotifyUser,
      note: c.spotifyNote,
      glyph: G_NOTE,
      letter: listen.track
        ? {
            edge: listen.track.title,
            label: fill(c.pullLetter, { name: "Spotify" }),
            body: <SpotifyLetter track={listen.track} playing={listen.playing} />,
          }
        : undefined,
    },
  ];

  const wall = (listen: Listen) => (
    <Wall boxes={boxes(listen)} label={c.elsewhereLabel} opens={c.opensNewTab} closeLabel={c.putBack} reduced={reduced} />
  );
  const seedTrack = data.spotify?.now ?? data.spotify?.recent ?? null;

  return (
    <div className="app-contact-pane">
      <header className="app-contact-head">
        <p className="app-contact-eyebrow">{fill(c.elsewhereEyebrow, { n: 5 })}</p>
        <h2 className="app-contact-title">{c.elsewhereTitle}</h2>
        <p className="app-contact-lead">{c.elsewhereLead}</p>
      </header>
      {active ? (
        <LiveSpotify seed={data.spotify}>{wall}</LiveSpotify>
      ) : (
        wall({ track: seedTrack, playing: Boolean(data.spotify?.now?.playing) })
      )}
    </div>
  );
}
