"use client";

import { Fragment, useState } from "react";
import { useI18n } from "@/i18n/client";
import { SOCIALS } from "@/lib/places";
import { NOW, loc } from "@/content/now";
import { LiveDot, PixelCava, RollText } from "./bits";
import { fill, parisHM, useClock } from "./lib";
import type { Listen } from "./widgets/Listening";

const clip = (s: string, n: number) => (s.length > n ? `${s.slice(0, n - 1).trimEnd()}…` : s);

/**
 * The headline wants the song, not the edition: "Song (Live in Toulouse) -
 * Remastered 2011" → "Song". Falls back to the full title if that leaves
 * nothing. The widget below shows the full title.
 */
export function shortTitle(title: string) {
  const s = title
    .replace(/\s+[-–—]\s+.*$/, "")
    .replace(/\s*[([][^)\]]*[)\]]/g, "")
    .trim();
  return clip(s || title, 32);
}

type Word = { id: string; parts: React.ReactNode[] };

/**
 * The headline is a live sentence: hand-written focus, the song that's
 * actually playing (or paused), the actual time in Toulouse. Words rise out of
 * their masks on arrival, gaining weight as they come (Inter's wght axis,
 * in CSS so it starts at first paint, before hydration). When the song
 * changes, only the words that changed rise again, in order from the first
 * of them; the time rolls its own digits.
 */
export function NowHero({ listen, updated }: { listen: Listen; updated: string }) {
  const { t, lang } = useI18n();
  const n = t.now;
  // checked every second, but the hero renders only when the minute turns
  const time = useClock(parisHM) ?? "--:--";

  const { status, track, playing } = listen;
  // honest states only: "listening to" while it plays, "on pause" while
  // Spotify holds a paused track, and nothing about music otherwise (the
  // last-played track, possibly days old, lives in the widget with its age)
  const live = status?.now ? track : null;
  const template = live && playing ? n.sentence.playing : live ? n.sentence.paused : n.sentence.quiet;
  const title = live ? shortTitle(live.title) : "";

  // the plain sentence for assistive tech
  const plain = fill(template, {
    doing: fill(loc(NOW.focus.doing, lang), { name: NOW.focus.name }),
    track: live ? `${live.title} (${live.artist})` : "",
    time,
  });

  // words: live tokens get their own look; a track title becomes one masked
  // word per word so long ones wrap. Each word carries a stable identity
  // (the clock is "{time}", not its digits) so only real changes remount.
  const expanded = template.replace("{doing}", fill(loc(NOW.focus.doing, lang), { name: "{focus}" }));
  const words: Word[] = [];
  for (const word of expanded.split(/\s+/)) {
    const parts = word.split(/(\{\w+\})/g).filter(Boolean);
    const ti = parts.indexOf("{track}");
    if (ti >= 0 && live) {
      const before = parts.slice(0, ti);
      const after = parts.slice(ti + 1);
      const tw = title.split(/\s+/);
      tw.forEach((w, j) => {
        const link = (
          <a
            key="t"
            href={live.url || SOCIALS.spotifyUser}
            target="_blank"
            rel="noopener noreferrer"
            className="app-now-tok app-now-tok--track"
            tabIndex={-1}
          >
            {j === 0 && <PixelCava playing={playing} still cols={4} className="app-now-tok-cava" />}
            {w}
          </a>
        );
        const pre = j === 0 ? before : [];
        const post = j === tw.length - 1 ? after : [];
        words.push({ id: `${pre.join("")}♪${w}${post.join("")}`, parts: [...pre, link, ...post] });
      });
      continue;
    }
    words.push({
      id: word,
      parts: parts.map((part) => {
        if (part === "{focus}")
          return (
            <a key="f" href={NOW.focus.url} target="_blank" rel="noopener noreferrer" className="app-now-tok app-now-tok--focus" tabIndex={-1}>
              {NOW.focus.name}
            </a>
          );
        if (part === "{time}")
          return (
            <span key="c" className="app-now-tok app-now-tok--time">
              <RollText text={time} />
            </span>
          );
        return part;
      }),
    });
  }

  // remember the previous words (state from the last render, React's
  // documented pattern) to find where a change starts
  const sig = words.map((w) => w.id).join("\u0001");
  const [seen, setSeen] = useState({ sig, prev: null as string[] | null, from: 0 });
  let { prev, from } = seen;
  if (seen.sig !== sig) {
    prev = seen.sig.split("\u0001");
    from = 0;
    while (from < words.length && prev[from] === words[from].id) from++;
    setSeen({ sig, prev, from });
  }
  /** remounted by the last change (its key is new): plays the entrance again */
  const fresh = (i: number) => prev != null && i >= from && prev[i] !== words[i].id;

  return (
    <header className="app-now-hero">
      <p className="app-now-kicker">
        <span className="app-now-kicker-live">
          <LiveDot />
          {n.live}
        </span>
        <span aria-hidden>·</span>
        <span>{n.kicker}</span>
      </p>
      <h2 className="app-now-sentence">
        <span className="sr-only">{plain}</span>
        <span aria-hidden>
          {words.map((w, i) => (
            <Fragment key={`${i}:${w.id}`}>
              {i > 0 && " "}
              <span className="app-now-word">
                <span
                  className="app-now-word-in"
                  data-fresh={fresh(i) || undefined}
                  style={{ "--i": prev != null && i >= from ? i - from : i } as React.CSSProperties}
                >
                  {w.parts.map((part, j) => (
                    <Fragment key={j}>{part}</Fragment>
                  ))}
                </span>
              </span>
            </Fragment>
          ))}
        </span>
      </h2>
      <p className="app-now-intro">
        {loc(NOW.intro, lang)}{" "}
        <a href="https://nownownow.com/about" target="_blank" rel="noopener noreferrer" className="app-now-link">
          {n.whatIs}
        </a>
      </p>
      <p className="app-now-updated">{updated}</p>
    </header>
  );
}
