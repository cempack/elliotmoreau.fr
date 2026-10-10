"use client";

import { useEffect, useId, useRef, useState } from "react";
import { AnimatePresence, m } from "motion/react";
import { spring } from "@/lib/motion";
import { useSound } from "@/lib/sound";
import { timeAgo } from "@/lib/format";
import { useParisTime } from "@/hooks/useParisTime";
import { usePalette } from "@/components/ui/CommandPalette";
import { LangToggle, SoundToggle } from "@/components/ui/Toggles";
import { PixelLabel } from "@/components/PixelLabel";
import { PixelGlyph, GLYPH_CODE } from "@/components/glyphs";
import type { ActivityInfo, RepoInfo } from "@/lib/github";
import type { SpotifyStatus, TrackInfo } from "@/lib/spotify";
import { useMounted } from "./hooks";
import { useRiceCopy } from "./strings";
import { Cava, Cover, TrackProgress } from "./apps";

export type Sp = { status: SpotifyStatus | null; track: TrackInfo | null; playing: boolean };

export const WS_IDS = ["home", "work", "atlas", "contact"] as const;

/** Four-bar mini equalizer; CSS-animated, frozen unless something plays. */
export function Eq({ playing }: { playing: boolean }) {
  return (
    <span className="rice-eq" data-playing={playing || undefined} aria-hidden>
      <i />
      <i />
      <i />
      <i />
    </span>
  );
}

function NowModule({ sp }: { sp: Sp }) {
  const { r, nowPlaying, lastPlayed, topArtists } = useRiceCopy();
  const { blip } = useSound();
  const [open, setOpen] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);
  const btnRef = useRef<HTMLButtonElement>(null);
  const id = useId();
  const { track, playing, status } = sp;

  useEffect(() => {
    if (!open) return;
    const onDown = (e: PointerEvent) => {
      if (!wrapRef.current?.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      setOpen(false);
      if (wrapRef.current?.contains(document.activeElement)) btnRef.current?.focus();
    };
    window.addEventListener("pointerdown", onDown);
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("pointerdown", onDown);
      window.removeEventListener("keydown", onKey);
    };
  }, [open]);

  return (
    <div ref={wrapRef} className="rice-now">
      <button
        ref={btnRef}
        type="button"
        className="rice-island rice-now-btn"
        aria-expanded={open}
        aria-controls={id}
        onClick={() => {
          setOpen((o) => !o);
          blip(open ? "close" : "open");
        }}
      >
        <Eq playing={playing} />
        <span className="rice-now-text">
          {track ? (
            <>
              <span className="rice-now-title">{track.title}</span>
              <span className="rice-now-sep"> — </span>
              <span className="rice-now-artist">{track.artist}</span>
            </>
          ) : (
            <span className="rice-now-artist">{r.nothing}</span>
          )}
        </span>
        <svg className="rice-now-caret" width="10" height="10" viewBox="0 0 10 10" aria-hidden data-open={open || undefined}>
          <path d="M2 3.5 5 6.5 8 3.5" fill="none" stroke="currentColor" strokeWidth="1.4" />
        </svg>
      </button>
      <AnimatePresence>
        {open && (
          <m.div
            id={id}
            role="dialog"
            aria-label={nowPlaying}
            className="rice-pop"
            style={{ transformOrigin: "50% 0" }}
            initial={{ opacity: 0, y: -10, scale: 0.94 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -10, scale: 0.94 }}
            transition={spring.snappy}
          >
            <p className="rice-pop-kicker">
              <span className="rice-dot" data-on={playing || undefined} />
              {playing ? nowPlaying : lastPlayed}
            </p>
            {track ? (
              <>
                <div className="rice-pop-track">
                  <Cover track={track} className="rice-pop-cover" />
                  <div className="min-w-0">
                    <p className="rice-pop-title">{track.title}</p>
                    <p className="rice-pop-artist">{track.artist}</p>
                    {track.album && <p className="rice-pop-album">{track.album}</p>}
                  </div>
                </div>
                <Cava playing={playing} cols={30} />
                <TrackProgress track={track} playing={playing} />
              </>
            ) : (
              <p className="rice-pop-album">{r.nothing}</p>
            )}
            {status?.artists?.length ? (
              <div className="rice-pop-artists">
                <p className="rice-pop-kicker">{topArtists}</p>
                <ul>
                  {status.artists.slice(0, 5).map((a) => (
                    <li key={a.name}>{a.name}</li>
                  ))}
                </ul>
              </div>
            ) : null}
            {track?.url && (
              <a className="rice-pop-link" href={track.url} target="_blank" rel="noopener noreferrer">
                {r.openSpotify} <span aria-hidden>↗</span>
              </a>
            )}
          </m.div>
        )}
      </AnimatePresence>
    </div>
  );
}

function LastPush({ activity, repos }: { activity: ActivityInfo | null; repos: RepoInfo[] }) {
  const { lang, r } = useRiceCopy();
  const mounted = useMounted();
  const repo = activity?.repo ?? repos[0]?.name;
  const at = activity?.createdAt ?? repos[0]?.pushedAt;
  const href = activity?.repoUrl ?? repos[0]?.url ?? "https://github.com/cempack";
  if (!repo) return null;
  return (
    <a
      className="rice-push"
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      title={activity?.message ? `${r.lastPush}: ${activity.message}` : r.lastPush}
    >
      <PixelGlyph cells={GLYPH_CODE} size={12} className="rice-push-icon" />
      <span className="rice-push-repo">{repo}</span>
      <span className="rice-push-time">{mounted && at ? timeAgo(at, lang) : "·"}</span>
    </a>
  );
}

function Clock() {
  const { time } = useParisTime({ seconds: true });
  const { localTime } = useRiceCopy();
  return (
    <span className="rice-clock" title={`${localTime} · Paris`}>
      <span className="rice-clock-dot" aria-hidden />
      <time suppressHydrationWarning aria-label={`${localTime} ${time ?? ""}`}>
        {time ?? "--:--:--"}
      </time>
    </span>
  );
}

export function Waybar({
  active,
  onGo,
  sp,
  activity,
  repos,
}: {
  active: number;
  onGo: (i: number) => void;
  sp: Sp;
  activity: ActivityInfo | null;
  repos: RepoInfo[];
}) {
  const { nav, r, soundOn, soundOff } = useRiceCopy();
  const { open } = usePalette();
  const labels = [nav.home, nav.work, nav.atlas, nav.contact];

  return (
    <header className="rice-bar">
      <div className="rice-island rice-bar-left">
        <button type="button" className="rice-logo" aria-label={r.launcher} title={r.launcher} onClick={open}>
          <PixelLabel text="EM" cell={2} />
        </button>
        <nav aria-label={r.workspaces}>
          <ol className="rice-ws-list">
            {WS_IDS.map((id, i) => (
              <li key={id}>
                <a
                  href={`#ws-${id}`}
                  className="rice-ws-btn"
                  aria-current={active === i ? "true" : undefined}
                  aria-label={`${r.workspace} ${i + 1} · ${labels[i]}`}
                  onClick={(e) => {
                    e.preventDefault();
                    onGo(i);
                  }}
                >
                  {active === i && <m.span layoutId="rice-ws-thumb" className="rice-ws-thumb" transition={spring.snappy} />}
                  <span className="rice-ws-n">{i + 1}</span>
                  <span className="rice-ws-l">{labels[i]}</span>
                </a>
              </li>
            ))}
          </ol>
        </nav>
      </div>

      <div className="rice-bar-center">
        <NowModule sp={sp} />
      </div>

      <div className="rice-island rice-bar-right">
        <LastPush activity={activity} repos={repos} />
        <span className="rice-bar-div rice-hide-sm" aria-hidden />
        <LangToggle id="rice-lang" className="rice-seg rice-hide-sm" />
        <SoundToggle className="rice-iconbtn rice-hide-sm" labels={{ on: soundOn, off: soundOff }} />
        <button type="button" className="rice-kbtn" onClick={open} aria-label={r.launcher} title={r.launcher}>
          <kbd>⌘K</kbd>
        </button>
        <Clock />
      </div>
    </header>
  );
}
