"use client";

import Link from "next/link";
import { useEffect, useRef } from "react";
import { useLang } from "@/lib/i18n";
import { PixelDivider } from "@/components/PixelDivider";
import { TravelSection } from "@/components/TravelSection";
import { Reveal } from "@/components/Reveal";
import { Tilt } from "@/components/Tilt";
import { PixelLabel } from "@/components/PixelLabel";
import { TtfxText } from "@/components/TtfxText";
import { HeroNameFx } from "@/components/HeroNameFx";
import { BlogSection } from "@/components/BlogSection";
import { ChapterRail } from "@/components/ChapterRail";
import { ScrollScrub } from "@/components/ScrollScrub";
import { BackdropWord } from "@/components/BackdropWord";
import { CardSparkles, GLYPH_MAIL, GLYPH_TERM, PixelGlyph } from "@/components/glyphs";

function Hero() {
  const titleRef = useRef<HTMLDivElement>(null);

  // scroll choreography: the wordmark drifts up, then dissolves and
  // settles back as you leave the hero — one rAF, transform/opacity only
  useEffect(() => {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    let raf = 0;
    const onScroll = () => {
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(() => {
        const y = window.scrollY;
        const vh = window.innerHeight;
        if (y > vh * 1.2) return;
        const p = Math.min(1, y / (vh * 0.9));
        titleRef.current?.style.setProperty(
          "transform",
          `translate3d(0, ${(-y * 0.07).toFixed(1)}px, 0) scale(${(1 - p * 0.05).toFixed(3)})`
        );
        titleRef.current?.style.setProperty("opacity", (1 - p * 0.85).toFixed(3));
      });
    };
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => {
      window.removeEventListener("scroll", onScroll);
      cancelAnimationFrame(raf);
    };
  }, []);

  return (
    <section className="hero-glow relative overflow-hidden">
      <div className="mx-auto flex min-h-svh max-w-6xl flex-col justify-center px-4 sm:px-6">
        <div ref={titleRef} style={{ willChange: "transform" }}>
          <HeroNameFx />
        </div>
      </div>
    </section>
  );
}

// terminal prompt, envelope — 7x7 cells each
const TERM_CELLS = GLYPH_TERM;
const MAIL_CELLS = GLYPH_MAIL;

function LinkCards() {
  const { t } = useLang();
  const cards = [
    { href: "/work", title: t("links.workTitle"), sub: t("links.workSub"), icon: TERM_CELLS },
    { href: "/contact", title: t("links.contactTitle"), sub: t("links.contactSub"), icon: MAIL_CELLS },
  ];
  return (
    <section id="more" aria-label={`${t("links.workTitle")} / ${t("links.contactTitle")}`} className="relative mx-auto max-w-6xl scroll-mt-20 px-4 sm:px-6">
      <BackdropWord text="03" cell={22} drift={50} top={100} />
      <div data-parallax="0.06">
        <Reveal className="mb-6 flex items-center gap-4" preset="focus">
          <PixelLabel text={t("links.label")} cell={3} className="text-ember" />
          <span className="font-display text-4xl italic leading-none text-sage" aria-hidden>
            →
          </span>
        </Reveal>
      </div>
      <div className="grid gap-4 sm:grid-cols-2" data-parallax="0.03">
        {cards.map((c, j) => (
          <Reveal key={c.href} delay={j * 90} preset="lift">
            <Tilt max={9}>
            <Link
              href={c.href}
              className="group flex items-center justify-between gap-4 rounded-[12px] border border-line bg-ink-2 p-6 transition-all hover:-translate-y-1 hover:border-ember/60 hover:shadow-[0_18px_50px_-20px_rgba(167,192,128,0.25)] sm:p-8"
          >
              <span className="min-w-0">
                <span className="block font-display text-3xl text-bone sm:text-4xl">
                  <TtfxText text={c.title} effect="decrypt" />
                </span>
                <span className="mt-1 block font-mono text-[11px] text-faint">{c.sub}</span>
              </span>
              <span className="relative flex shrink-0 items-center gap-3">
                <PixelGlyph
                  cells={c.icon}
                  className="text-faint transition-all duration-200 group-hover:-translate-y-0.5 group-hover:text-ember"
                />
                <span className="pixel-arrow font-display text-3xl text-faint" aria-hidden>
                  →
                </span>
                <CardSparkles />
              </span>
            </Link>
            </Tilt>
          </Reveal>
        ))}
      </div>
    </section>
  );
}

export default function Home() {
  return (
    <div className="pb-24">
      <ChapterRail />
      <ScrollScrub />
      <Hero />
      <div data-parallax="0.03">
        <PixelDivider />
      </div>
      <div className="mt-20 space-y-24">
        <BlogSection />
        <TravelSection />
        <LinkCards />
      </div>
    </div>
  );
}
