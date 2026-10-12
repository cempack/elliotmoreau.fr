"use client";

import "../menubar-panels.css";

import { useSyncExternalStore } from "react";
import { useI18n } from "@/i18n/client";
import { timeAgo } from "@/lib/format";
import { useSiteData } from "../SiteData";
import { useSky } from "../sky";
import { GLYPH_COMMIT, GLYPH_NOTE, GLYPH_PAGE, Pixels, SKY_GLYPH } from "./glyphs";
import type { Music } from "./Music";
import { Battery, useElliotsDay } from "./day";
import {
  PARIS_TZ,
  fill,
  fmtLongDate,
  fmtMonth,
  fmtOffset,
  fmtShortDate,
  fmtTime,
  useNow,
  weekdayInitials,
  zoneCity,
  zoneOffset,
  zonedParts,
} from "./util";

const noop = () => () => {};
const getZone = () => Intl.DateTimeFormat().resolvedOptions().timeZone || PARIS_TZ;
/** The visitor's IANA zone, Toulouse until mounted (hydration-safe). */
function useVisitorZone() {
  return useSyncExternalStore(noop, getZone, () => PARIS_TZ);
}

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

function ClockCol({ hm, label, sub, glyph }: { hm: string; label: string; sub: string; glyph?: readonly (readonly [number, number])[] }) {
  return (
    <div className="os-menubar-time-col">
      <p className="os-menubar-tile-sub os-menubar-time-label">
        {glyph && <Pixels cells={glyph} size={12} className="os-menubar-time-glyph" />}
        {label}
      </p>
      <p className="os-menubar-time-big tabular">
        {hm.slice(0, 5)}
        <span className="os-menubar-time-sec">{hm.slice(5)}</span>
      </p>
      <p className="os-menubar-tile-sub">{sub}</p>
    </div>
  );
}

/** Toulouse vs you: both clocks, or one when you share Toulouse time. */
function TimeCard() {
  const { t, lang } = useI18n();
  const { phase } = useSky();
  const now = useNow("second");
  const zone = useVisitorZone();
  if (!now) return <div className="os-menubar-tile os-menubar-time-card" />;
  const paris = fmtTime(now, lang, PARIS_TZ, true);
  const parisDay = fmtShortDate(now, lang);
  const youDay = fmtShortDate(now, lang, zone);
  const diff = zoneOffset(now, zone) - zoneOffset(now, PARIS_TZ);
  const same = diff === 0;
  return (
    <section className="os-menubar-tile os-menubar-time-card" aria-label={`${t.shell.clock.city} · ${t.shell.clock.you}`} data-same={same || undefined}>
      <ClockCol hm={paris} label={t.shell.clock.city} sub={`${t.shell.control[phase]} · ${parisDay}`} glyph={SKY_GLYPH[phase]} />
      {same ? (
        <p className="os-menubar-time-same">{t.shell.clock.sameZone}</p>
      ) : (
        <ClockCol
          hm={fmtTime(now, lang, zone, true)}
          label={t.shell.clock.you}
          sub={[zoneCity(zone), fmtOffset(diff), youDay !== parisDay ? youDay : ""].filter(Boolean).join(" · ")}
        />
      )}
    </section>
  );
}

type Note = {
  id: string;
  app: string;
  glyph: readonly (readonly [number, number])[];
  accent: string;
  when: string;
  at: number;
  title: string;
  body: string;
  href: string;
};

function useNotes(music: Music, nowMs: number | null): Note[] {
  const { t, lang } = useI18n();
  const { posts, activity } = useSiteData();
  const n = t.shell.notifications;
  const out: Note[] = [];
  const { track, playing } = music;
  if (track) {
    out.push({
      id: "music",
      app: n.music,
      glyph: GLYPH_NOTE,
      accent: "var(--color-signal)",
      when: playing ? t.shell.player.nowPlaying : track.playedAt ? timeAgo(track.playedAt, lang) : t.shell.player.lastPlayed,
      at: playing ? (nowMs ?? 0) : track.playedAt ? new Date(track.playedAt).getTime() : 0,
      title: track.title,
      body: track.artist,
      href: track.url,
    });
  }
  if (activity) {
    out.push({
      id: "push",
      app: n.github,
      glyph: GLYPH_COMMIT,
      accent: "var(--color-ion)",
      when: timeAgo(activity.createdAt, lang),
      at: new Date(activity.createdAt).getTime(),
      title: fill(n.pushedTo, { repo: activity.repo }),
      body: activity.message,
      href: activity.repoUrl,
    });
  }
  const post = posts[0];
  if (post) {
    out.push({
      id: "post",
      app: `${n.writing} · ${n.newPost}`,
      glyph: GLYPH_PAGE,
      accent: "var(--color-ember)",
      when: timeAgo(post.published_at, lang),
      at: new Date(post.published_at).getTime(),
      title: post.title,
      body: post.excerpt,
      href: post.url,
    });
  }
  return out.sort((a, b) => b.at - a.at);
}

function Feed({ music, nowMs }: { music: Music; nowMs: number | null }) {
  const { t } = useI18n();
  const notes = useNotes(music, nowMs);
  return (
    <section className="os-menubar-feed" aria-labelledby="os-mb-feed">
      <h3 id="os-mb-feed" className="os-menubar-section">
        {t.shell.notifications.feed}
      </h3>
      {notes.length === 0 ? (
        <p className="os-menubar-tile os-menubar-feed-empty">{t.shell.notifications.empty}</p>
      ) : (
        <ul className="os-menubar-feed-list">
          {notes.map((note) => (
            <li key={note.id}>
              <a className="os-menubar-tile os-menubar-note" href={note.href} target="_blank" rel="noopener noreferrer">
                <span className="os-menubar-note-icon" style={{ background: note.accent }} aria-hidden>
                  <Pixels cells={note.glyph} size={14} />
                </span>
                <span className="os-menubar-note-main">
                  <span className="os-menubar-note-head">
                    <span className="os-menubar-note-app">{note.app}</span>
                    <span className="os-menubar-note-when">{note.when}</span>
                  </span>
                  <span className="os-menubar-note-title">{note.title}</span>
                  {note.body && <span className="os-menubar-note-body">{note.body}</span>}
                </span>
              </a>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

/** This month in Toulouse, Monday first, with dots on days something shipped. */
function Calendar({ now }: { now: Date }) {
  const { t, lang } = useI18n();
  const { posts, activity } = useSiteData();
  const n = t.shell.notifications;
  const today = zonedParts(now, PARIS_TZ);
  const first = new Date(Date.UTC(today.year, today.month - 1, 1));
  const lead = (first.getUTCDay() + 6) % 7;
  const days = new Date(Date.UTC(today.year, today.month, 0)).getUTCDate();

  const inMonth = (iso: string) => {
    const p = zonedParts(new Date(iso), PARIS_TZ);
    return p.year === today.year && p.month === today.month ? p.day : null;
  };
  const postDays = new Set(posts.map((p) => inMonth(p.published_at)).filter((d): d is number => d != null));
  const pushDay = activity ? inMonth(activity.createdAt) : null;

  const cells: (number | null)[] = [...Array.from({ length: lead }, () => null), ...Array.from({ length: days }, (_, i) => i + 1)];
  while (cells.length % 7) cells.push(null);
  const weeks = Array.from({ length: cells.length / 7 }, (_, w) => cells.slice(w * 7, w * 7 + 7));
  const heads = weekdayInitials(lang);
  const fmtDay = new Intl.DateTimeFormat(lang === "fr" ? "fr-FR" : "en-GB", { day: "numeric", month: "long", timeZone: "UTC" });

  return (
    <section className="os-menubar-tile os-menubar-cal" aria-labelledby="os-mb-cal">
      <h3 id="os-mb-cal" className="os-menubar-cal-title">
        <span>{fmtMonth(now, lang)}</span> <span className="os-menubar-cal-year">{today.year}</span>
      </h3>
      <table className="os-menubar-cal-grid">
        <thead>
          <tr>
            {heads.map((h, i) => (
              <th key={i} scope="col" abbr={h}>
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {weeks.map((week, w) => (
            <tr key={w}>
              {week.map((d, i) => {
                if (d == null) return <td key={i} />;
                const isToday = d === today.day;
                const post = postDays.has(d);
                const push = pushDay === d;
                const marks = [post && n.postDay, push && n.pushDay].filter(Boolean).join(", ");
                const label = fmtDay.format(new Date(Date.UTC(today.year, today.month - 1, d)));
                return (
                  <td key={i}>
                    <span
                      className="os-menubar-cal-day"
                      data-today={isToday || undefined}
                      data-weekend={i >= 5 || undefined}
                      aria-current={isToday ? "date" : undefined}
                      aria-label={marks ? `${label}${t.shell.colon}${marks}` : undefined}
                      title={marks || undefined}
                    >
                      {d}
                      {(post || push) && (
                        <span className="os-menubar-cal-mark" data-post={post || undefined} data-push={push || undefined} aria-hidden />
                      )}
                    </span>
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
      {/* the key: each word underlined the way its days are */}
      <p className="os-menubar-cal-legend" aria-hidden>
        <span data-kind="post">{n.legendPost}</span>
        <span data-kind="push">{n.legendPush}</span>
      </p>
    </section>
  );
}

export function NotificationPanel({ music }: { music: Music }) {
  const { t, lang } = useI18n();
  const now = useNow("minute");
  const elliot = useElliotsDay(music.playing);
  return (
    <div className="os-menubar-nc">
      <header className="os-menubar-nc-head">
        <p className="os-menubar-kicker">{t.shell.notifications.today}</p>
        <h2 className="os-menubar-nc-date">{now ? fmtLongDate(now, lang) : " "}</h2>
        {elliot && (
          <p className="os-menubar-nc-day">
            <Battery day={elliot.day} />
            <span>{elliot.sentence}</span>
          </p>
        )}
      </header>
      <TimeCard />
      <Feed music={music} nowMs={now ? now.getTime() : null} />
      {now && <Calendar now={now} />}
    </div>
  );
}
