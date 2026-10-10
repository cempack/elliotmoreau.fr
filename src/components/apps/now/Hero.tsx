"use client";

import { Fragment } from "react";
import { m } from "motion/react";
import { useReduced } from "@/hooks/env";
import { useI18n } from "@/i18n/client";
import { SOCIALS } from "@/lib/places";
import { NOW, loc } from "@/content/now";
import { LiveDot, PixelCava, RollText } from "./bits";
import { fill, useNow } from "./lib";
import type { Listen } from "./widgets/Listening";

const clip = (s: string, n: number) => (s.length > n ? `${s.slice(0, n - 1).trimEnd()}…` : s);

/**
 * The headline is a live sentence: hand-written focus, the song that's
 * actually playing, the actual time in Paris. Words rise out of their
 * masks once on arrival, each a little heavier than it started (Inter's
 * weight axis); the time rolls its digits as the minutes turn.
 */
export function NowHero({ listen, updated }: { listen: Listen; updated: string }) {
  const { t, lang } = useI18n();
  const n = t.now;
  const reduced = useReduced();
  const now = useNow(1000);
  const time = now
    ? new Intl.DateTimeFormat("en-GB", { timeZone: "Europe/Paris", hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).format(now)
    : "--:--";

  const { track, playing } = listen;
  const template = track && playing ? n.sentence.playing : track ? n.sentence.paused : n.sentence.quiet;
  const doing = fill(loc(NOW.focus.doing, lang), { name: "\u0000" });

  // the plain sentence for assistive tech
  const plain = fill(template, {
    doing: fill(loc(NOW.focus.doing, lang), { name: NOW.focus.name }),
    track: track ? `${track.title} (${track.artist})` : "",
    time,
  });

  // tokens: live values with their own look; everything else is words.
  // A track title becomes one masked word per word, so long ones wrap.
  const token = (name: string): React.ReactNode => {
    if (name === "focus")
      return (
        <a href={NOW.focus.url} target="_blank" rel="noopener noreferrer" className="app-now-tok app-now-tok--focus" tabIndex={-1}>
          {NOW.focus.name}
        </a>
      );
    if (name === "time")
      return (
        <span className="app-now-tok app-now-tok--time">
          <RollText text={time} />
        </span>
      );
    return null;
  };
  const expanded = template.replace("{doing}", doing.replace("\u0000", "{focus}"));
  const items: React.ReactNode[][] = [];
  for (const word of expanded.split(/\s+/)) {
    const parts = word.split(/(\{\w+\})/g).filter(Boolean);
    const ti = parts.indexOf("{track}");
    if (ti >= 0 && track) {
      const before = parts.slice(0, ti);
      const after = parts.slice(ti + 1);
      const tw = clip(track.title, 42).split(/\s+/);
      tw.forEach((w, j) => {
        const link = (
          <a
            key="t"
            href={track.url || SOCIALS.spotifyUser}
            target="_blank"
            rel="noopener noreferrer"
            className="app-now-tok app-now-tok--track"
            tabIndex={-1}
          >
            {j === 0 && <PixelCava playing={playing} cols={4} className="app-now-tok-cava" />}
            {w}
          </a>
        );
        items.push([...(j === 0 ? before : []), link, ...(j === tw.length - 1 ? after : [])]);
      });
      continue;
    }
    items.push(parts.map((part) => {
      const tk = /^\{(\w+)\}$/.exec(part)?.[1];
      return tk ? token(tk) : part;
    }));
  }

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
          {items.map((parts, i) => (
            <Fragment key={i}>
              {i > 0 && " "}
              <span className="app-now-word">
                <m.span
                  className="app-now-word-in"
                  initial={{ y: "108%", fontVariationSettings: '"wght" 380' }}
                  animate={{ y: "0%", fontVariationSettings: '"wght" 640' }}
                  transition={
                    reduced
                      ? { duration: 0 }
                      : {
                          y: { type: "spring", visualDuration: 0.8, bounce: 0, delay: 0.08 + i * 0.045 },
                          fontVariationSettings: { duration: 1.1, ease: [0.22, 1, 0.36, 1], delay: 0.18 + i * 0.045 },
                        }
                  }
                >
                  {parts.map((part, j) => (
                    <Fragment key={j}>{part}</Fragment>
                  ))}
                </m.span>
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
