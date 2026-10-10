"use client";

import { useRef } from "react";
import { m, useScroll, useTransform } from "motion/react";
import { HeroNameFx } from "@/components/HeroNameFx";
import { PressLink } from "@/components/ui/Pressable";
import { usePalette } from "@/components/ui/CommandPalette";
import { useParisTime } from "@/hooks/useParisTime";
import type { TrackInfo } from "@/lib/spotify";
import { useIssue, useReduced } from "./hooks";
import { useJ } from "./strings";

/** Four bars that dance while something plays; still otherwise. */
export function Eq({ playing, className = "" }: { playing: boolean; className?: string }) {
  return (
    <span className={`j-eq ${className}`} data-playing={playing || undefined} aria-hidden>
      <i />
      <i />
      <i />
      <i />
    </span>
  );
}

/** "Developer in France." + the rest, so the first sentence can lean italic. */
function splitLead(s: string): [string, string] {
  const i = s.indexOf(". ");
  return i < 0 ? [s, ""] : [s.slice(0, i + 1), s.slice(i + 2)];
}

/**
 * The cover: the pixel name in its dark night window, framed like a
 * magazine cover with issue metadata, a live running line, the intro set
 * editorially and the two ways in.
 */
export function Cover({ track, playing }: { track: (TrackInfo & { playing?: boolean }) | null; playing: boolean }) {
  const { c, j } = useJ();
  const issue = useIssue();
  const { time } = useParisTime();
  const { open } = usePalette();
  const [lead, rest] = splitLead(c.intro);
  // as you start reading, the cover recedes like a page being set down
  const ref = useRef<HTMLElement>(null);
  const reduced = useReduced();
  const { scrollYProgress } = useScroll({ target: ref, offset: ["start start", "end start"] });
  const scale = useTransform(scrollYProgress, [0, 1], [1, 0.9]);
  const fade = useTransform(scrollYProgress, [0.2, 1], [1, 0.25]);

  return (
    <section ref={ref} id="cover" data-chapter="cover" className="j-cover" aria-label={j.chapters.cover}>
      <m.div className="j-cover-frame" style={reduced ? undefined : { scale, opacity: fade }}>
        <div className="j-cover-meta">
          <span className="j-cover-issue" data-ready={issue ? "" : undefined}>
            {issue ? (
              <>
                {j.vol} {issue.vol} <span className="j-dim">—</span> {j.seasons[issue.season]}
                <span className="j-cover-no">
                  {" "}
                  · {j.no} {String(issue.month).padStart(2, "0")}
                </span>
              </>
            ) : (
              " "
            )}
          </span>
          <span className="j-cover-title">{j.masthead}</span>
          <span className="j-cover-time" data-ready={time ? "" : undefined}>
            {time ?? "00:00"} <span className="j-dim">{c.inFrance}</span>
          </span>
          {track && (
            <a
              className="j-cover-np"
              href={track.url || undefined}
              target="_blank"
              rel="noreferrer"
              data-cursor={c.open}
            >
              <Eq playing={playing} />
              <span className="j-cover-np-k">{playing ? c.nowPlaying : c.lastPlayed}</span>
              <span className="j-cover-np-t">
                <em>{track.title}</em> — {track.artist}
              </span>
            </a>
          )}
        </div>

        <div className="j-cover-hero">
          <HeroNameFx className="j-hero-stage" />
          <span className="j-crop j-crop-tl" aria-hidden />
          <span className="j-crop j-crop-tr" aria-hidden />
          <span className="j-crop j-crop-bl" aria-hidden />
          <span className="j-crop j-crop-br" aria-hidden />
        </div>

        <div className="j-cover-foot">
          <p className="j-cover-intro">
            <em>{lead}</em> {rest}
          </p>
          <div className="j-cover-actions">
            <div className="j-cover-ctas">
              <PressLink href="/work" className="j-btn j-btn-solid" data-cursor={c.view}>
                {c.ctaWork}
                <span className="j-arrow" aria-hidden>
                  →
                </span>
              </PressLink>
              <PressLink href="/contact" className="j-btn j-btn-line" data-cursor={c.open}>
                {c.ctaHello}
              </PressLink>
            </div>
            <button type="button" className="j-cover-k" onClick={open}>
              <kbd>⌘K</kbd>
              <span>{c.cmdK}</span>
            </button>
          </div>
        </div>
      </m.div>
      <div className="j-cover-base" aria-hidden>
        <span className="j-cover-scroll">
          <i />
          {c.scroll}
        </span>
        <span className="j-cover-next">
          <span className="j-mono">01</span> {j.signals}
        </span>
      </div>
    </section>
  );
}
