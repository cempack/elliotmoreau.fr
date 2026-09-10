"use client";

import { useEffect, useRef, useState } from "react";
import { useLang } from "@/lib/i18n";
import { SOCIALS } from "@/lib/places";
import type { SpotifyStatus } from "@/lib/spotify";
import { GLYPH_NOTE, PixelGlyph } from "./glyphs";
import { PixelLabel } from "./PixelLabel";

type Status = SpotifyStatus | { disabled: true };

/**
 * Topbar music menu, macOS-menu-bar style: a compact pill that drops a panel
 * on hover (desktop) or tap (touch / keyboard) with now-playing + top artists.
 */
export function NowPlaying() {
  const { t } = useLang();
  const [status, setStatus] = useState<Status | null>(null);
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let alive = true;
    const load = () =>
      fetch("/api/spotify/status")
        .then((r) => (r.ok ? r.json() : null))
        .then((j: Status | null) => {
          if (alive && j) setStatus(j);
        })
        .catch(() => {});
    load();
    const id = setInterval(load, 30_000);
    return () => {
      alive = false;
      clearInterval(id);
    };
  }, []);

  useEffect(() => {
    const onDown = (e: PointerEvent) => {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("pointerdown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("pointerdown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, []);

  if (!status || "disabled" in status) return null; // tokens missing: stay quiet
  const track = status.now ?? status.recent;
  if (!track) return null;
  const playing = Boolean(status.now?.playing);
  const label = status.now ? t("live.now") : t("live.last");
  const progress =
    track.durationMs > 0 ? Math.min(100, Math.max(0, (track.progressMs / track.durationMs) * 100)) : 0;

  const panel =
    "invisible translate-y-1 opacity-0 transition-all duration-150 group-hover:visible group-hover:translate-y-0 group-hover:opacity-100 group-focus-within:visible group-focus-within:translate-y-0 group-focus-within:opacity-100";

  return (
    <div ref={rootRef} className="group relative flex min-w-0 flex-1 justify-center px-2">
      {/* desktop pill — deep green, stacked label/title, eq on the right */}
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        aria-label={`${label}: ${track.title} — ${track.artist}`}
        title={`${track.title} — ${track.artist}`}
        className={`hidden min-w-0 max-w-[250px] items-center gap-2.5 rounded-[10px] border py-1.5 pl-1.5 pr-3 transition-colors md:flex ${
          open
            ? "border-ember/60 bg-[#151f17]/95"
            : "border-[#2c4034] bg-[#151f17]/90 hover:border-ember/60"
        }`}
      >
        {track.image ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={track.image}
            alt=""
            width={32}
            height={32}
            className="h-8 w-8 shrink-0 rounded-[4px] border border-ember/30 object-cover [image-rendering:pixelated]"
          />
        ) : (
          <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-[4px] border border-line text-faint" aria-hidden>
            <PixelGlyph cells={GLYPH_NOTE} size={14} />
          </span>
        )}
        <span className="min-w-0 flex-1 leading-tight">
          <span className="block truncate text-[13px] font-semibold text-bone">{track.title}</span>
          <span className="block truncate font-mono text-[10px] text-faint">{track.artist}</span>
        </span>
        <span className={`flex h-4 shrink-0 items-end gap-[2.5px] ${playing ? "" : "eq-paused"}`} aria-hidden>
          {[0, 1, 2, 3].map((i) => (
            <span
              key={i}
              className="eq-bar w-[3px] rounded-full bg-ember"
              style={{
                height: `${8 + ((i * 5) % 4) * 2}px`,
                animationDelay: `${i * 0.13}s`,
                animationDuration: `${0.6 + (i % 4) * 0.15}s`,
              }}
            />
          ))}
        </span>
      </button>

      {/* mobile thumb trigger */}
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        aria-label={`${label}: ${track.title} — ${track.artist}`}
        className={`flex h-8 w-8 items-center justify-center overflow-hidden rounded-[6px] border transition-colors md:hidden ${
          open ? "border-ember/60" : "border-line"
        }`}
      >
        {track.image ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={track.image} alt="" width={32} height={32} className="h-full w-full object-cover" />
        ) : (
          <span className="text-faint" aria-hidden>
            <PixelGlyph cells={GLYPH_NOTE} size={14} />
          </span>
        )}
      </button>

      {/* dropdown panel */}
      <div
        className={`${panel} ${open ? "!visible !translate-y-0 !opacity-100" : ""} absolute right-0 top-[calc(100%+10px)] z-[70] w-[290px] overflow-hidden rounded-[8px] border border-[#2c4034] bg-[#151f17]/95 shadow-[0_24px_60px_-20px_rgba(0,0,0,0.7)] backdrop-blur-md max-md:fixed max-md:inset-x-4 max-md:right-4 max-md:top-20 max-md:w-auto`}
      >
        <div className="flex items-center gap-1.5 border-b border-line/60 px-4 py-2.5" aria-hidden>
          <span className="h-2 w-2 rounded-[2px] bg-rust/80" />
          <span className="h-2 w-2 rounded-[2px] bg-ember/80" />
          <span className="h-2 w-2 rounded-[2px] bg-glacier/80" />
          <PixelLabel
            text={playing ? t("live.now") : t("live.last")}
            cell={2}
            className="ml-2 text-faint"
          />
          <span className={`ml-auto flex h-3 items-end gap-[2px] ${playing ? "" : "eq-paused"}`} aria-hidden>
            {[0, 1, 2, 3].map((i) => (
              <span
                key={i}
                className="eq-bar w-[2px] rounded-full bg-ember"
                style={{ height: `${6 + ((i * 7) % 3) * 3}px`, animationDelay: `${i * 0.12}s` }}
              />
            ))}
          </span>
        </div>

        <a
          href={track.url || SOCIALS.spotifyUser}
          target="_blank"
          rel="noreferrer"
          className="group/track flex items-center gap-3 px-4 py-3 transition-colors hover:bg-panel/60"
        >
          {track.image ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={track.image}
              alt=""
              width={44}
              height={44}
              className="h-11 w-11 shrink-0 rounded-[4px] border border-ember/40 object-cover [image-rendering:pixelated]"
            />
          ) : (
            <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-[4px] border border-line bg-ink text-faint" aria-hidden>
              <PixelGlyph cells={GLYPH_NOTE} size={18} />
            </span>
          )}
          <span className="min-w-0 flex-1">
            <span className="block truncate font-display text-lg leading-tight text-bone">{track.title}</span>
            <span className="block truncate font-mono text-[11px] text-faint">
              {track.artist}
              {track.album ? ` · ${track.album}` : ""}
            </span>
            {track.durationMs > 0 && (
              <span className="mt-1.5 flex gap-[3px]" aria-hidden>
                {Array.from({ length: 12 }).map((_, i) => (
                  <span
                    key={i}
                    className={`h-[5px] w-full rounded-[1px] ${i / 12 < progress / 100 ? "bg-ember" : "bg-line/50"}`}
                  />
                ))}
              </span>
            )}
          </span>
          <span aria-hidden className="shrink-0 font-mono text-[11px] text-faint transition-all group-hover/track:translate-x-0.5 group-hover/track:-translate-y-0.5 group-hover/track:text-ember">
            ↗
          </span>
        </a>

        {status.artists.length > 0 && (
          <>
            <div className="border-t border-line/60 px-4 pb-1 pt-3">
              <PixelLabel text={t("nowplaying.artists")} cell={2} className="text-faint" />
            </div>
            <ul className="px-2 pb-2">
              {status.artists.map((a) => (
                <li key={a.name}>
                  <a
                    href={a.url || SOCIALS.spotifyUser}
                    target="_blank"
                    rel="noreferrer"
                    className="group/artist flex items-center gap-2.5 rounded-[8px] px-2 py-1.5 transition-colors hover:bg-panel"
                  >
                    {a.image ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={a.image}
                        alt=""
                        width={26}
                        height={26}
                        loading="lazy"
                        className="h-[26px] w-[26px] shrink-0 rounded-[3px] border border-line object-cover transition-colors [image-rendering:pixelated] group-hover/artist:border-ember/60"
                      />
                    ) : (
                      <span className="flex h-[26px] w-[26px] shrink-0 items-center justify-center rounded-[3px] border border-line bg-ink font-mono text-[10px] text-faint" aria-hidden>
                        ♪
                      </span>
                    )}
                    <span className="min-w-0 flex-1 truncate font-mono text-[12px] text-sage transition-colors group-hover/artist:text-bone">
                      {a.name}
                    </span>
                    <span aria-hidden className="shrink-0 font-mono text-[10px] text-faint opacity-0 transition-all group-hover/artist:translate-x-0.5 group-hover/artist:text-ember group-hover/artist:opacity-100">
                      →
                    </span>
                  </a>
                </li>
              ))}
            </ul>
          </>
        )}
      </div>
    </div>
  );
}
