"use client";

import { m } from "motion/react";
import { useEffect, useLayoutEffect, useRef, useState } from "react";
import type { SiteData } from "@/lib/data";
import type { RepoInfo } from "@/lib/github";
import type { TrackInfo } from "@/lib/spotify";
import { useI18n } from "@/i18n/client";
import { useHydrated, useReduced } from "@/hooks/env";
import { useSpotifyStatus } from "@/hooks/useSpotifyStatus";
import { SOCIALS } from "@/lib/places";
import { timeAgo } from "@/lib/format";
import { spring } from "@/lib/motion";
import { pxPath } from "@/lib/pxpath";
import { PixelGlyph, type Cells } from "@/components/glyphs";
import { RepoArt } from "@/components/apps/work/RepoArt";
import { PixelCover } from "@/components/apps/now/Cover";
import { fmtMs, useOnScreen, useTrackProgress } from "@/components/apps/now/lib";
import { G_ARROW, M_CODE, M_NOTES, M_PLAY, M_TOOT, M_X } from "./glyphs";
import { fill } from "./mail";

type Id = "github" | "spotify" | "youtube" | "mastodon" | "x";
type Profile = { id: Id; name: string; handle: string; href: string; note: string; mark: Cells; rel?: string };
type Push = { when: string; repo: string; url: string; message: string; info: RepoInfo | undefined };
/** `current`: the track is the one Spotify holds now (playing or paused), so its position means something */
type Listen = { track: TrackInfo | null; playing: boolean; current: boolean };

/** the cards' order; those with something live move to the front */
const ORDER: Id[] = ["github", "spotify", "youtube", "mastodon", "x"];

/** a network's 9 × 9 mark, three screen pixels a cell */
function Mark({ cells }: { cells: Cells }) {
  return (
    <svg viewBox="0 0 9 9" shapeRendering="crispEdges" fill="currentColor" aria-hidden focusable="false">
      <path d={pxPath(cells.map(([x, y]) => ({ x, y })), 0.02)} />
    </svg>
  );
}

/** The profile itself: one link, the whole row. */
function ProfileLink({ p, opens }: { p: Profile; opens: string }) {
  return (
    <a
      href={p.href}
      target="_blank"
      rel={p.rel ?? "noopener noreferrer"}
      className="app-contact-profile"
      aria-label={`${p.name}, ${p.handle}. ${p.note} ${opens}`}
    >
      <span className="app-contact-profile-mark" aria-hidden>
        <Mark cells={p.mark} />
      </span>
      <span className="app-contact-profile-name">{p.name}</span>
      <span className="app-contact-profile-handle">{p.handle}</span>
      <span className="app-contact-profile-note">{p.note}</span>
      <span className="app-contact-profile-go" aria-hidden>
        <PixelGlyph cells={G_ARROW} size={14} />
      </span>
    </a>
  );
}

/** the cover's side in cells at each step of its development, how long each holds, and the wait before the first (ms: the card settles in meanwhile) */
const DEVELOP = [4, 8, 16, 32];
const HOLD = 90;
const WAIT = 160;

/**
 * The album art. It develops from big pixels to the real picture the first
 * time it comes into view, and again when the song changes; art already on
 * screen when the page loaded (a link straight to #elsewhere) stays as it
 * is. Without artwork, the song's seeded pixel sleeve (the one Now gives it).
 */
function Cover({ track }: { track: TrackInfo }) {
  const reduced = useReduced();
  const box = useRef<HTMLSpanElement>(null);
  const img = useRef<HTMLImageElement>(null);
  const cv = useRef<HTMLCanvasElement>(null);
  // well inside the view, so on a phone it develops as it's scrolled to, not at the edge
  const onScreen = useOnScreen(box, "-12% 0px");
  const [failed, setFailed] = useState<string | null>(null);
  const [loaded, setLoaded] = useState<string | null>(null);
  /** waiting to develop: the picture stays hidden until its turn */
  const [pending, setPending] = useState(false);
  const src = track.image && failed !== track.image ? track.image : null;
  const first = useRef(true);

  // a new picture is hidden before it's ever painted; one the server already painted is left alone
  useLayoutEffect(() => {
    const el = img.current;
    const ready = Boolean(el && el.complete && el.naturalWidth > 0);
    const painted = first.current && ready && Boolean(el?.getClientRects().length);
    first.current = false;
    if (ready) setLoaded(src);
    if (!src || painted) return;
    const c = cv.current;
    if (c) c.width = c.height = 0;
    setPending(true);
  }, [src]);

  // reduced motion: no development, the picture just shows
  const veiled = pending && !reduced;

  useEffect(() => {
    if (!veiled) return;
    const el = img.current;
    const c = cv.current;
    const ctx = c?.getContext("2d");
    if (!onScreen || loaded !== src || !el || !c || !ctx) return;
    let i = 0;
    let t = 0;
    const step = () => {
      if (i === DEVELOP.length) {
        setPending(false);
        return;
      }
      const n = DEVELOP[i++];
      const s = Math.min(el.naturalWidth, el.naturalHeight);
      c.width = c.height = n;
      ctx.imageSmoothingQuality = "high";
      ctx.drawImage(el, (el.naturalWidth - s) / 2, (el.naturalHeight - s) / 2, s, s, 0, 0, n, n);
      t = window.setTimeout(step, HOLD);
    };
    t = window.setTimeout(step, WAIT);
    return () => window.clearTimeout(t);
  }, [veiled, onScreen, loaded, src]);

  return (
    <span ref={box} className="app-contact-cover" data-pending={veiled || undefined}>
      {src ? (
        <>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            ref={img}
            src={src}
            alt=""
            draggable={false}
            decoding="async"
            onLoad={() => setLoaded(src)}
            onError={() => setFailed(src)}
          />
          <canvas ref={cv} width={0} height={0} aria-hidden />
        </>
      ) : (
        <PixelCover seed={`${track.title} · ${track.artist}`} />
      )}
    </span>
  );
}

const SEGMENTS = 30;

/** Where the song is: a pixel meter that lights a cell at a time, and the times under it. */
function Progress({ track, playing, active }: { track: TrackInfo; playing: boolean; active: boolean }) {
  const progress = useTrackProgress(track, playing, active);
  const lit = progress != null && track.durationMs > 0 ? Math.floor((progress / track.durationMs) * SEGMENTS) : 0;
  return (
    <span className="app-contact-live-progress" aria-hidden>
      <span className="app-contact-live-meter">
        {Array.from({ length: SEGMENTS }, (_, i) => (
          <i key={i} data-on={i < lit || undefined} />
        ))}
      </span>
      <span className="app-contact-live-times tabular">
        <span>{progress != null ? fmtMs(progress) : "–:––"}</span>
        <span>{fmtMs(track.durationMs)}</span>
      </span>
    </span>
  );
}

/** what's new in a live card fades up when it changes; the first render just shows */
function useChanged(key: string) {
  const [first] = useState(key);
  return first !== key;
}

function PushCard({ push, opens }: { push: Push; opens: string }) {
  const { t, lang } = useI18n();
  const c = t.contact;
  const hydrated = useHydrated();
  const ago = hydrated ? timeAgo(push.when, lang) : "";
  const title = push.message || push.repo;
  const desc = push.info?.description;
  return (
    <a
      href={push.url}
      target="_blank"
      rel="noopener noreferrer"
      className="app-contact-live"
      aria-label={`${fill(c.live, {
        what: ago ? `${c.latestPush}, ${ago}` : c.latestPush,
        text: push.message ? fill(c.inRepo, { message: push.message, repo: push.repo }) : push.repo,
      })}. ${c.openRepo} ${opens}`}
    >
      <span className="app-contact-live-art app-contact-live-art--repo" aria-hidden>
        <RepoArt name={push.repo} language={push.info?.language} />
      </span>
      <span className="app-contact-live-text">
        <span className="app-contact-live-k">
          {c.latestPush}
          {ago && <span className="app-contact-live-when tabular">{ago}</span>}
        </span>
        <span className="app-contact-live-title">{title}</span>
        {/* without a commit message the repo is the title already */}
        {push.message && <span className="app-contact-live-repo">{push.repo}</span>}
        {desc && <span className="app-contact-live-desc">{desc}</span>}
      </span>
      <span className="app-contact-live-go" aria-hidden>
        <PixelGlyph cells={G_ARROW} size={10} />
      </span>
    </a>
  );
}

function TrackCard({ listen, track, active, opens }: { listen: Listen; track: TrackInfo; active: boolean; opens: string }) {
  const { t, lang } = useI18n();
  const c = t.contact;
  const hydrated = useHydrated();
  const reduced = useReduced();
  const state = listen.playing ? c.playingNow : listen.current ? c.paused : c.lastPlayed;
  const ago = !listen.current && hydrated && track.playedAt ? timeAgo(track.playedAt, lang) : "";
  const key = `${track.title}|${track.artist}`;
  const changed = useChanged(key);
  const by = [track.artist, track.album].filter(Boolean).join(" · ");
  return (
    <a
      href={track.url || SOCIALS.spotifyUser}
      target="_blank"
      rel="noopener noreferrer"
      className="app-contact-live"
      data-playing={listen.playing || undefined}
      aria-label={`${fill(c.live, {
        what: ago ? `${state}, ${ago}` : state,
        text: track.artist ? `${track.title}, ${track.artist}` : track.title,
      })}. ${c.openTrack} ${opens}`}
    >
      <span className="app-contact-live-art" aria-hidden>
        <Cover track={track} />
      </span>
      <m.span
        key={key}
        className="app-contact-live-text"
        initial={changed ? (reduced ? { opacity: 0 } : { opacity: 0, y: 6 }) : false}
        animate={{ opacity: 1, y: 0 }}
        transition={reduced ? { duration: 0.15 } : spring.default}
      >
        <span className="app-contact-live-k">
          {state}
          {ago && <span className="app-contact-live-when tabular">{ago}</span>}
        </span>
        <span className="app-contact-live-title">{track.title}</span>
        {by && <span className="app-contact-live-by">{by}</span>}
        {listen.current && track.durationMs > 0 && <Progress track={track} playing={listen.playing} active={active} />}
      </m.span>
      <span className="app-contact-live-go" aria-hidden>
        <PixelGlyph cells={G_ARROW} size={10} />
      </span>
    </a>
  );
}

/**
 * Elsewhere: the other places to find Elliot. Every profile is one card
 * and one link: its mark, name, handle and what it's for. The two with
 * something live lead, each with its latest under the profile: the last
 * public push (the repo's picture, its commit message) and the song on or
 * last played, its cover developing from big pixels the first time it's
 * seen. Nothing is invented: without live data a profile is just a
 * profile. Mastodon keeps rel="me" for profile verification.
 *
 * The song comes from the OS's one shared feed (the menu bar keeps it
 * polling anyway), read here from the first render so opening the mailbox
 * never remounts the cards.
 */
export function Elsewhere({ data, active }: { data: SiteData; active: boolean }) {
  const { t } = useI18n();
  const c = t.contact;
  const music = useSpotifyStatus(data.spotify);
  const listen: Listen = { track: music.track, playing: music.playing, current: Boolean(music.status?.now) };

  // the last public push; failing that, the most recently pushed repo
  const a = data.activity;
  const latest = a
    ? { when: a.createdAt, repo: a.repo.split("/").pop() ?? a.repo, url: a.repoUrl, message: a.message.split("\n")[0].trim() }
    : data.repos[0]?.pushedAt
      ? { when: data.repos[0].pushedAt, repo: data.repos[0].name, url: data.repos[0].url, message: "" }
      : null;
  const push: Push | null = latest && {
    ...latest,
    info: data.repos.find((r) => r.name.toLowerCase() === latest.repo.toLowerCase()),
  };

  const profiles: Record<Id, Profile> = {
    github: { id: "github", name: "GitHub", handle: "@cempack", href: SOCIALS.github, note: c.githubNote, mark: M_CODE },
    spotify: { id: "spotify", name: "Spotify", handle: c.spotifyHandle, href: SOCIALS.spotifyUser, note: c.spotifyNote, mark: M_NOTES },
    youtube: { id: "youtube", name: "YouTube", handle: "@cempack", href: SOCIALS.youtube, note: c.youtubeNote, mark: M_PLAY },
    mastodon: {
      id: "mastodon",
      name: "Mastodon",
      handle: "@cempack@mastodon.social",
      href: SOCIALS.mastodon,
      note: c.mastodonNote,
      mark: M_TOOT,
      rel: "me noopener noreferrer",
    },
    x: { id: "x", name: "X", handle: "@cempack_", href: SOCIALS.x, note: c.xNote, mark: M_X },
  };

  const live = (id: Id) => (id === "github" ? push : id === "spotify" ? listen.track : null);
  const ids = [...ORDER.filter((id) => live(id)), ...ORDER.filter((id) => !live(id))];
  const nLive = ids.filter((id) => live(id)).length;

  return (
    <div className="app-contact-pane">
      <header className="app-contact-head">
        <p className="app-contact-eyebrow">{fill(c.elsewhereEyebrow, { n: ORDER.length })}</p>
        <h2 className="app-contact-title">{c.elsewhereTitle}</h2>
        <p className="app-contact-lead">{c.elsewhereLead}</p>
      </header>
      <ul className="app-contact-profiles" aria-label={c.elsewhereLabel} data-live={nLive} data-quiet={ids.length - nLive}>
        {ids.map((id, i) => (
          <li
            key={id}
            className="app-contact-place"
            data-id={id}
            data-live={live(id) ? "" : undefined}
            style={{ "--i": i } as React.CSSProperties}
          >
            <ProfileLink p={profiles[id]} opens={c.opensNewTab} />
            {id === "github" && push && <PushCard push={push} opens={c.opensNewTab} />}
            {id === "spotify" && listen.track && (
              <TrackCard listen={listen} track={listen.track} active={active} opens={c.opensNewTab} />
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}
