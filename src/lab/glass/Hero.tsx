"use client";

import { m, useScroll, useTransform } from "motion/react";
import { HeroNameFx } from "@/components/HeroNameFx";
import { Magnetic } from "@/components/ui/Magnetic";
import { PressLink } from "@/components/ui/Pressable";
import { useParisTime } from "@/hooks/useParisTime";
import { timeAgo } from "@/lib/format";
import type { HomeData } from "@/lib/data";
import { useLiquidGlass, sheenLeave, sheenMove } from "./LiquidGlass";
import { Blob } from "./Backdrop";
import { Arrow, Eq, SkyGlyph } from "./bits";
import { useHydrated, useReduced } from "./env";
import { phaseOf, useGlassCopy } from "./strings";
import { useSpotify } from "./live";

/**
 * First screen: the pixel name, sacred and large, then one glass capsule
 * that says who he is, offers two ways forward and proves he's live.
 */
export function Hero({ data }: { data: HomeData }) {
  const reduced = useReduced();
  const { scrollY } = useScroll();
  // the name recedes as you leave it, like a product shot settling back
  const scale = useTransform(scrollY, [0, 600], [1, 0.92]);
  const opacity = useTransform(scrollY, [0, 520], [1, 0.2]);
  const y = useTransform(scrollY, [0, 600], [0, 60]);

  return (
    <section id="top" className="g-hero">
      <Blob tone="ember" className="g-blob--hero-a" speed={60} />
      <Blob tone="glacier" className="g-blob--hero-b" speed={110} />
      <m.div className="g-hero-name" style={reduced ? undefined : { scale, opacity, y }}>
        <HeroNameFx className="h-[34svh] min-h-[220px] sm:h-[44svh] md:h-[54svh] md:min-h-[400px]" />
      </m.div>
      <Capsule data={data} />
    </section>
  );
}

function Capsule({ data }: { data: HomeData }) {
  const c = useGlassCopy();
  const { ref, layer } = useLiquidGlass<HTMLDivElement>({
    radius: 36,
    bevel: 34,
    strength: 52,
    chroma: 0.05,
  });
  return (
    <div
      ref={ref}
      className="lg lg--regular g-capsule"
      onPointerMove={sheenMove}
      onPointerLeave={sheenLeave}
    >
      {layer}
      <div className="g-capsule-main">
        <p className="g-intro">{c.intro}</p>
        <div className="g-ctas">
          <Magnetic strength={0.25} max={8}>
            <PressLink href="/work" className="g-btn g-btn--primary">
              {c.ctaWork}
              <Arrow />
            </PressLink>
          </Magnetic>
          <Magnetic strength={0.25} max={8}>
            <PressLink href="/contact" className="g-btn g-btn--clear">
              {c.ctaHello}
            </PressLink>
          </Magnetic>
        </div>
      </div>
      <div className="g-capsule-status">
        <NowPlayingChip />
        <ClockChip />
        <PushChip data={data} />
      </div>
    </div>
  );
}

function NowPlayingChip() {
  const c = useGlassCopy();
  const { track, playing } = useSpotify();
  if (!track) {
    return (
      <span className="g-chip">
        <Eq playing={false} />
        <span className="g-chip-k">{c.t("nothingPlaying")}</span>
      </span>
    );
  }
  return (
    <a href={track.url} target="_blank" rel="noreferrer" className="g-chip g-chip--link" data-cursor={c.listening}>
      <Eq playing={playing} />
      <span className="g-chip-k">{playing ? c.nowPlaying : c.lastPlayed}</span>
      <span className="g-chip-v g-trunc">
        {track.title}
        <span className="g-chip-sep"> · </span>
        {track.artist}
      </span>
    </a>
  );
}

function ClockChip() {
  const c = useGlassCopy();
  const { time, hour } = useParisTime();
  return (
    <span className="g-chip">
      <SkyGlyph hour={hour} />
      <span className="g-chip-v g-tnum" suppressHydrationWarning>
        {time ?? "--:--"}
      </span>
      <span className="g-chip-k" suppressHydrationWarning>
        {hour == null ? c.inFrance : `${phaseOf(hour, c.lang)} ${c.inFrance}`}
      </span>
    </span>
  );
}

function PushChip({ data }: { data: HomeData }) {
  const c = useGlassCopy();
  const hydrated = useHydrated();
  const a = data.activity;
  if (!a) return null;
  return (
    <a href={a.repoUrl} target="_blank" rel="noreferrer" className="g-chip g-chip--link g-chip--push" data-cursor="GitHub">
      <span className="g-dot" aria-hidden />
      <span className="g-chip-k">{c.lastPush}</span>
      <span className="g-chip-v g-trunc">{a.repo}</span>
      {hydrated && <span className="g-chip-k">{timeAgo(a.createdAt, c.lang)}</span>}
    </a>
  );
}
