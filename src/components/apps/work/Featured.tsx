"use client";

import { m, useMotionValue, useSpring } from "motion/react";
import type { RepoInfo } from "@/lib/github";
import { useI18n } from "@/i18n/client";
import { timeAgo } from "@/lib/format";
import { useFinePointer, useReduced } from "@/hooks/env";
import { RepoArt } from "./RepoArt";
import { PixelLabel } from "@/components/PixelLabel";
import { GLYPH_STAR, PixelGlyph } from "@/components/glyphs";
import { PressAnchor, PressButton } from "@/components/ui/Pressable";
import { DitherStage } from "./DitherStage";
import { G_ARROW, G_EYE, G_FORK } from "./glyphs";
import { compact, fmt, langColor } from "./model";

const DRIFT = { stiffness: 140, damping: 22, mass: 0.6 };

/**
 * The featured project as a hero: its planet floating over a dithered pool
 * of light (it leans toward a fine pointer), the name in display type, the
 * facts in mono, and the ways in: GitHub, the site, Quick Look.
 */
export function Featured({
  repo,
  hydrated,
  onQuickLook,
}: {
  repo: RepoInfo;
  hydrated: boolean;
  onQuickLook: () => void;
}) {
  const { t, lang } = useI18n();
  const f = t.work.featured;
  const fine = useFinePointer();
  const reduced = useReduced();
  const mx = useMotionValue(0);
  const my = useMotionValue(0);
  const x = useSpring(mx, DRIFT);
  const y = useSpring(my, DRIFT);
  const lean = fine && !reduced;

  return (
    <section
      className="app-work-hero"
      aria-labelledby="app-work-hero-title"
      onPointerMove={(e) => {
        if (!lean || e.pointerType !== "mouse") return;
        const r = e.currentTarget.getBoundingClientRect();
        mx.set(((e.clientX - r.left) / r.width - 0.5) * 18);
        my.set(((e.clientY - r.top) / r.height - 0.5) * 14);
      }}
      onPointerLeave={() => {
        mx.set(0);
        my.set(0);
      }}
    >
      <button
        type="button"
        className="app-work-hero-stage"
        onClick={onQuickLook}
        aria-label={fmt(f.quickLookOf, { name: repo.name })}
       
      >
        <DitherStage tone="ion" />
        <m.span className="app-work-hero-orbit" style={lean ? { x, y } : undefined} data-hero-origin>
          <RepoArt name={repo.name} language={repo.language} className="app-work-hero-planet" />
        </m.span>
      </button>

      <div className="app-work-hero-body">
        <p className="app-work-hero-kicker">
          <PixelLabel text={f.kicker} cell={2} className="app-work-hero-kicker-px" />
          {repo.language && (
            <span className="app-work-hero-lang">
              <span className="app-work-dot" style={{ background: langColor(repo.language) }} aria-hidden />
              {repo.language}
            </span>
          )}
        </p>
        <h2 id="app-work-hero-title" className="app-work-hero-title">
          {repo.name}
        </h2>
        <p className="app-work-hero-desc" lang={lang === "en" ? undefined : "en"}>
          {repo.description}
        </p>

        <ul className="app-work-hero-facts" role="list">
          <li>
            <PixelGlyph cells={GLYPH_STAR} size={10} />
            <span className="tabular">{compact(repo.stars, lang)}</span>
            <span className="sr-only">{t.work.ql.stars}</span>
          </li>
          <li>
            <PixelGlyph cells={G_FORK} size={10} />
            <span className="tabular">{compact(repo.forks, lang)}</span>
            <span className="sr-only">{t.work.ql.forks}</span>
          </li>
          {repo.pushedAt && (
            <li className="app-work-hero-ago">{hydrated ? fmt(f.updated, { ago: timeAgo(repo.pushedAt, lang) }) : " "}</li>
          )}
          {repo.topics.slice(0, 3).map((tp) => (
            <li key={tp} className="app-work-hero-topic">
              #{tp}
            </li>
          ))}
        </ul>

        <div className="app-work-hero-actions">
          <PressAnchor
            href={repo.url}
            target="_blank"
            rel="noopener noreferrer"
            className="app-work-btn app-work-btn--primary"
          >
            {f.github}
            <PixelGlyph cells={G_ARROW} size={9} />
          </PressAnchor>
          {repo.homepage && (
            <PressAnchor href={repo.homepage} target="_blank" rel="noopener noreferrer" className="app-work-btn">
              {f.site}
              <PixelGlyph cells={G_ARROW} size={9} />
            </PressAnchor>
          )}
          <PressButton className="app-work-btn app-work-btn--ghost" onClick={onQuickLook}>
            <PixelGlyph cells={G_EYE} size={11} />
            {f.quickLook}
          </PressButton>
        </div>
      </div>
    </section>
  );
}
