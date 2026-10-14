"use client";

import { AnimatePresence, m } from "motion/react";
import type { RepoInfo } from "@/lib/github";
import { useI18n } from "@/i18n/client";
import { useHydrated, useReduced } from "@/hooks/env";
import { QUARTER, useQuarterHour } from "@/hooks/useQuarterHour";
import { spring } from "@/lib/motion";
import { PressAnchor } from "@/components/ui/Pressable";
import { PixelGlyph } from "@/components/glyphs";
import { G_CHEVRON } from "@/components/os/window/glyphs";
import { G_ARROW } from "./glyphs";
import { Machine } from "./machine/Machine";
import { actionOf, plainOf, siteOf, titleOf, type ProjectKind } from "./kind";
import { fmt, plural } from "./model";

/** "3 days ago", in words anyone reads (empty on the server: it depends on now). */
function useAgo(iso: string) {
  const { t, lang } = useI18n();
  const a = t.work.ago;
  const quarter = useQuarterHour();
  if (!quarter) return "";
  const days = Math.floor((quarter * QUARTER - (Date.parse(iso) || 0)) / 86_400_000);
  const p = (n: number, one: string, other: string) => plural(lang, n, one, other);
  if (days < 1) return a.today;
  if (days < 2) return a.yesterday;
  if (days < 7) return p(days, a.daysOne, a.daysOther);
  if (days < 35) return p(Math.floor(days / 7), a.weeksOne, a.weeksOther);
  if (days < 365) return p(Math.max(1, Math.floor(days / 30.4)), a.monthsOne, a.monthsOther);
  return p(Math.floor(days / 365), a.yearsOne, a.yearsOther);
}

/**
 * One project, for anyone: what shelf it's on, its name, what it does in a
 * sentence, what that shelf means when it needs saying, one clear button
 * (open it, play it, get it, or read the code) and three facts in words.
 * `machine` puts the machine it runs on on top (tablets, and the phone's
 * sheet; the Atlas-wide layout shows it beside the card instead): one
 * machine that follows the project, switching channel or dissolving like
 * the stage's.
 */
export function ProjectCard({
  repo,
  kind,
  machine,
  prev,
  next,
  index,
  total,
  onStep,
  titleId,
}: {
  repo: RepoInfo;
  kind: ProjectKind;
  machine: boolean;
  prev: RepoInfo;
  next: RepoInfo;
  index: number;
  total: number;
  onStep: (name: string) => void;
  titleId: string;
}) {
  const { t, lang } = useI18n();
  const w = t.work;
  const k = w.kinds[kind];
  const reduced = useReduced();
  /** the layout is known (not the server's guess): only then does the machine start */
  const hydrated = useHydrated();
  const ago = useAgo(repo.pushedAt);
  const action = actionOf(repo, kind);
  const href = action === "code" ? repo.url : siteOf(repo);
  const name = titleOf(repo);

  const swap = reduced
    ? { initial: { opacity: 0 }, animate: { opacity: 1 }, exit: { opacity: 0 }, transition: { duration: 0.15 } }
    : {
        initial: { opacity: 0, y: 8 },
        animate: { opacity: 1, y: 0 },
        exit: { opacity: 0, transition: { duration: 0.12 } },
        transition: spring.gentle,
      };

  return (
    <article className="app-work-card" aria-labelledby={titleId}>
      {machine && (
        <div className="app-work-card-machine">
          {hydrated && <Machine repo={repo} kind={kind} />}
        </div>
      )}
      <AnimatePresence mode="popLayout" initial={false}>
        <m.div key={repo.name} className="app-work-card-body" {...swap}>
          <p className="app-work-chip" data-kind={kind}>
            {k.one}
          </p>
          <h2 id={titleId} className="app-work-name">
            {name}
          </h2>
          <p className="app-work-plain">{plainOf(repo, lang)}</p>
          {k.gloss && <p className="app-work-gloss">{k.gloss}</p>}

          <div className="app-work-actions">
            <PressAnchor className="app-work-btn app-work-btn--primary" href={href} target="_blank" rel="noopener noreferrer">
              {w.actions[action]}
              <PixelGlyph cells={G_ARROW} size={10} />
              <span className="sr-only">{w.actions.newTab}</span>
            </PressAnchor>
            {action !== "code" && (
              <PressAnchor className="app-work-btn" href={repo.url} target="_blank" rel="noopener noreferrer">
                {w.actions.source}
                <span className="sr-only">{w.actions.newTab}</span>
              </PressAnchor>
            )}
          </div>

          <dl className="app-work-facts">
            <div className="app-work-fact">
              <dt>{w.facts.updated}</dt>
              <dd>{ago || " "}</dd>
            </div>
            {repo.language && (
              <div className="app-work-fact">
                <dt>{w.facts.madeWith}</dt>
                <dd>{repo.language}</dd>
              </div>
            )}
            {repo.stars > 0 && (
              <div className="app-work-fact">
                <dt>{w.facts.saved}</dt>
                <dd>{plural(lang, repo.stars, w.facts.savedOne, w.facts.savedOther)}</dd>
              </div>
            )}
          </dl>
        </m.div>
      </AnimatePresence>

      {total > 1 && (
        <div className="app-work-card-nav" role="group" aria-label={w.steps}>
          <button type="button" className="app-work-step" onClick={() => onStep(prev.name)} aria-label={fmt(w.labelled, { label: w.prev, value: titleOf(prev) })}>
            <PixelGlyph cells={G_CHEVRON} size={9} className="app-work-step-prev" />
            <span>{titleOf(prev)}</span>
          </button>
          <span className="app-work-step-count tabular" aria-hidden>
            {String(index + 1).padStart(2, "0")} / {String(total).padStart(2, "0")}
          </span>
          <button type="button" className="app-work-step app-work-step--next" onClick={() => onStep(next.name)} aria-label={fmt(w.labelled, { label: w.next, value: titleOf(next) })}>
            <span>{titleOf(next)}</span>
            <PixelGlyph cells={G_CHEVRON} size={9} className="app-work-step-next" />
          </button>
        </div>
      )}
    </article>
  );
}
