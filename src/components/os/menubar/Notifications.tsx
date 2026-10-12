"use client";

import "../menubar-panels.css";

import { useI18n } from "@/i18n/client";
import { timeAgo } from "@/lib/format";
import { useSiteData } from "../SiteData";
import { GLYPH_COMMIT, GLYPH_NOTE, GLYPH_PAGE, Pixels } from "./glyphs";
import type { Music } from "./Music";
import { useElliotsDay } from "./day";
import { fill, fmtLongDate, fmtShortDate, useNow } from "./util";

/** Menu bar face: "Sat 10 Oct  14:32", Toulouse time. */
export function ClockTrigger({ time }: { time: string | null }) {
  const { lang } = useI18n();
  const now = useNow("minute");
  return (
    <>
      <span className="os-menubar-date" suppressHydrationWarning>
        {now ? fmtShortDate(now, lang) : " "}
      </span>
      <time className="os-menubar-time tabular" suppressHydrationWarning>
        {time ?? "--:--"}
      </time>
    </>
  );
}

type Note = {
  id: string;
  glyph: readonly (readonly [number, number])[];
  accent: string;
  when: string;
  at: number;
  title: string;
  sub: string;
  href: string;
};

/** the latest of each: what's playing, the last push, the last post */
function useNotes(music: Music, nowMs: number | null): Note[] {
  const { t, lang } = useI18n();
  const { posts, activity } = useSiteData();
  const n = t.shell.notifications;
  const out: Note[] = [];
  const { track, playing } = music;
  if (track) {
    out.push({
      id: "music",
      glyph: GLYPH_NOTE,
      accent: "var(--color-signal)",
      when: playing ? t.shell.player.nowPlaying : track.playedAt ? timeAgo(track.playedAt, lang) : t.shell.player.lastPlayed,
      at: playing ? (nowMs ?? 0) : track.playedAt ? new Date(track.playedAt).getTime() : 0,
      title: track.title,
      sub: track.artist,
      href: track.url,
    });
  }
  if (activity) {
    out.push({
      id: "push",
      glyph: GLYPH_COMMIT,
      accent: "var(--color-ion)",
      when: timeAgo(activity.createdAt, lang),
      at: new Date(activity.createdAt).getTime(),
      title: activity.message,
      sub: fill(n.pushedTo, { repo: activity.repo }),
      href: activity.repoUrl,
    });
  }
  const post = posts[0];
  if (post) {
    out.push({
      id: "post",
      glyph: GLYPH_PAGE,
      accent: "var(--color-ember)",
      when: timeAgo(post.published_at, lang),
      at: new Date(post.published_at).getTime(),
      title: post.title,
      sub: n.newPost,
      href: post.url,
    });
  }
  return out.sort((a, b) => b.at - a.at);
}

function Feed({ music, nowMs }: { music: Music; nowMs: number | null }) {
  const { t } = useI18n();
  const notes = useNotes(music, nowMs);
  if (!notes.length) return <p className="os-menubar-feed-empty">{t.shell.notifications.empty}</p>;
  return (
    <ul className="os-menubar-feed-list" aria-label={t.shell.notifications.feed}>
      {notes.map((note) => (
        <li key={note.id}>
          <a className="os-menubar-note" href={note.href} target="_blank" rel="noopener noreferrer">
            <span className="os-menubar-note-icon" style={{ background: note.accent }} aria-hidden>
              <Pixels cells={note.glyph} size={12} />
            </span>
            <span className="os-menubar-note-main">
              <span className="os-menubar-note-title">{note.title}</span>
              <span className="os-menubar-note-sub">{note.sub}</span>
            </span>
            <span className="os-menubar-note-when">{note.when}</span>
          </a>
        </li>
      ))}
    </ul>
  );
}

/** Today, in a few lines: the date, where Elliot's day is at, and the latest of what he plays, pushes and writes. */
export function NotificationPanel({ music }: { music: Music }) {
  const { lang } = useI18n();
  const now = useNow("minute");
  const elliot = useElliotsDay(music.playing);
  return (
    <div className="os-menubar-nc">
      <header className="os-menubar-nc-head">
        <h2 className="os-menubar-nc-date">{now ? fmtLongDate(now, lang) : " "}</h2>
        {elliot && <p className="os-menubar-nc-day">{elliot.sentence}</p>}
      </header>
      <Feed music={music} nowMs={now ? now.getTime() : null} />
    </div>
  );
}
