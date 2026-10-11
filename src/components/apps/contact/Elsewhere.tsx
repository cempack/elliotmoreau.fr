"use client";

import { useEffect, useState } from "react";
import type { SiteData } from "@/lib/data";
import type { SpotifyStatus } from "@/lib/spotify";
import { useI18n } from "@/i18n/client";
import { useHydrated } from "@/hooks/env";
import { SOCIALS } from "@/lib/places";
import { timeAgo } from "@/lib/format";
import { PixelGlyph, type Cells } from "@/components/glyphs";
import { G_ARROW, G_CODE, G_NOTE, G_PLAY, G_TOOT, G_X } from "./glyphs";
import { fill } from "./mail";

type Net = {
  id: string;
  name: string;
  handle: string;
  href: string;
  note: string;
  glyph: Cells;
  accent: string;
  rel?: string;
  live?: React.ReactNode;
};

/**
 * The track line, mounted only while this mailbox is open: it asks for the
 * live status as it opens (not 30s later), then every 30s while visible.
 */
function SpotifyLive({ seed }: { seed: SpotifyStatus | null }) {
  const { t } = useI18n();
  const [status, setStatus] = useState(seed);
  useEffect(() => {
    let alive = true;
    const load = () => {
      if (document.hidden) return;
      fetch("/api/spotify/status")
        .then((r) => (r.ok ? r.json() : null))
        .then((j: SpotifyStatus | { disabled: true } | null) => {
          if (alive && j && !("disabled" in j)) setStatus(j);
        })
        .catch(() => {});
    };
    load();
    const id = window.setInterval(load, 30_000);
    document.addEventListener("visibilitychange", load);
    return () => {
      alive = false;
      window.clearInterval(id);
      document.removeEventListener("visibilitychange", load);
    };
  }, []);
  const track = status?.now ?? status?.recent ?? null;
  const playing = Boolean(status?.now?.playing);
  if (!track) return null;
  const name = `${track.title} · ${track.artist}`;
  return (
    <span className="app-contact-net-live" data-playing={playing || undefined}>
      {playing && <span className="app-contact-net-dot" aria-hidden />}
      {fill(playing ? t.contact.spotifyNow : t.contact.spotifyLast, { track: name })}
    </span>
  );
}

/**
 * Elsewhere: the other places to find Elliot, as big typographic rows
 * (name, handle, what ends up there), each a real link out. GitHub and
 * Spotify carry one live line from real data; nothing is invented.
 * Mastodon keeps rel="me" for profile verification.
 */
export function Elsewhere({ data, active }: { data: SiteData; active: boolean }) {
  const { t, lang } = useI18n();
  const c = t.contact;
  const hydrated = useHydrated();

  const push = data.activity
    ? { when: data.activity.createdAt, repo: data.activity.repo.split("/").pop() ?? data.activity.repo }
    : data.repos[0]?.pushedAt
      ? { when: data.repos[0].pushedAt, repo: data.repos[0].name }
      : null;

  const nets: Net[] = [
    {
      id: "github",
      name: "GitHub",
      handle: "@cempack",
      href: SOCIALS.github,
      note: c.githubNote,
      glyph: G_CODE,
      accent: "var(--color-ion)",
      live:
        push && hydrated ? (
          <span className="app-contact-net-live">{fill(c.githubLive, { when: timeAgo(push.when, lang), repo: push.repo })}</span>
        ) : null,
    },
    {
      id: "youtube",
      name: "YouTube",
      handle: "@cempack",
      href: SOCIALS.youtube,
      note: c.youtubeNote,
      glyph: G_PLAY,
      accent: "var(--color-flare)",
    },
    {
      id: "mastodon",
      name: "Mastodon",
      handle: "@cempack@mastodon.social",
      href: SOCIALS.mastodon,
      note: c.mastodonNote,
      glyph: G_TOOT,
      accent: "var(--color-lilac)",
      rel: "me noopener noreferrer",
    },
    {
      id: "x",
      name: "X",
      handle: "@cempack_",
      href: SOCIALS.x,
      note: c.xNote,
      glyph: G_X,
      accent: "var(--color-label-2)",
    },
    {
      id: "spotify",
      name: "Spotify",
      handle: c.spotifyHandle,
      href: SOCIALS.spotifyUser,
      note: c.spotifyNote,
      glyph: G_NOTE,
      accent: "var(--color-signal)",
      live: active ? <SpotifyLive seed={data.spotify} /> : null,
    },
  ];

  return (
    <div className="app-contact-pane">
      <header className="app-contact-head">
        <p className="app-contact-eyebrow">{fill(c.elsewhereEyebrow, { n: nets.length })}</p>
        <h2 className="app-contact-title">{c.elsewhereTitle}</h2>
        <p className="app-contact-lead">{c.elsewhereLead}</p>
      </header>

      <ul className="app-contact-nets" aria-label={c.elsewhereLabel} role="list">
        {nets.map((n) => (
          <li key={n.id} className="app-contact-net-li">
            <a
              href={n.href}
              target="_blank"
              rel={n.rel ?? "noopener noreferrer"}
              className="app-contact-net"
              style={{ "--app-contact-net": n.accent } as React.CSSProperties}
            >
              <span className="app-contact-net-tile" aria-hidden>
                <PixelGlyph cells={n.glyph} size={21} />
              </span>
              <span className="app-contact-net-main">
                <span className="app-contact-net-name">{n.name}</span>
                <span className="app-contact-net-meta">
                  <span className="app-contact-net-handle">{n.handle}</span>
                  {n.live}
                </span>
              </span>
              <span className="app-contact-net-note">{n.note}</span>
              <span className="sr-only">{c.opensNewTab}</span>
              <span className="app-contact-net-go" aria-hidden>
                <PixelGlyph cells={G_ARROW} size={14} />
              </span>
            </a>
          </li>
        ))}
      </ul>
    </div>
  );
}
