"use client";

import { useRef } from "react";
import Link from "next/link";
import { m, useTransform, type MotionValue } from "motion/react";
import { useI18n } from "@/i18n/client";
import { useSiteData } from "@/components/os/SiteData";
import { bounce, isPlainClick, visibleIcon } from "@/components/os/dock/launch";
import { PixelPlanet } from "@/components/PixelPlanet";
import { PressButton } from "@/components/ui/Pressable";
import { useHydrated, useReduced } from "@/hooks/env";
import { timeAgo } from "@/lib/format";
import { LANG_COLORS, LANG_FALLBACK } from "@/lib/langColors";
import { SOCIALS } from "@/lib/places";
import { useSound } from "@/lib/sound";
import type { RepoInfo } from "@/lib/github";
import { ChapterHead } from "./ChapterHead";
import { offsetAt, useDeck, type DeckGeo } from "./useDeck";
import { fill, selectRepos } from "./util";

/**
 * Chapter 4, selected work as an app switcher. The top projects are cards
 * in an iOS-style switcher: the focused one right-aligned, the next ones
 * piled beneath it to the left. Drag or swipe with 1:1 tracking (the card
 * under the hand stays under it), fling with momentum, settle on a card
 * with a spring, rubber-band at both ends. Arrow keys, the buttons and
 * the pixel pager drive it too. A tap on a piled card brings it forward;
 * a tap on the focused card opens the repo.
 */
export function WorkDeck() {
  const { t } = useI18n();
  const s = t.story.work;
  const { repos } = useSiteData();
  const list = selectRepos(repos);
  const reduced = useReduced();
  const { blip } = useSound();
  const { q, index, geo, go, viewportRef, rulerRef, handlers } = useDeck({
    count: list.length,
    reduced,
    onSnap: () => blip("tick"),
  });
  const { path } = useI18n();
  const cardRefs = useRef<(HTMLAnchorElement | null)[]>([]);
  const n = list.length;

  const step = (dir: 1 | -1) => {
    const next = Math.min(n - 1, Math.max(0, index + dir));
    if (next === index) return;
    go(next);
    blip("tick");
  };

  const onKeyDown = (e: React.KeyboardEvent) => {
    const map: Record<string, number> = { ArrowLeft: index + 1, ArrowRight: index - 1, Home: 0, End: n - 1 };
    if (!(e.key in map)) return;
    e.preventDefault();
    const next = Math.min(n - 1, Math.max(0, map[e.key]));
    if (next === index) return;
    go(next);
    blip("tick");
    // keep focus on the card that came forward (roving tabindex)
    if ((e.target as Element).closest("[data-deck-card]")) cardRefs.current[next]?.focus({ preventScroll: true });
  };

  const counter = (
    <span className="app-story-deck-count tabular" aria-hidden>
      <span>{String(index + 1).padStart(2, "0")}</span>
      <span className="app-story-deck-count-of">/ {String(Math.max(1, n)).padStart(2, "0")}</span>
    </span>
  );

  return (
    <section className="app-story-deck" data-veil="0.66" aria-labelledby="story-deck-title">
      <ChapterHead
        n={4}
        kicker={s.kicker}
        titleId="story-deck-title"
        title={s.title}
        aside={
          <div className="app-story-deck-tools">
            {n > 1 && (
              <>
                {counter}
                <div className="app-story-deck-arrows">
                  {/* the next project waits in the pile on the left */}
                  <PressButton
                    className="app-story-round"
                    aria-label={s.next}
                    aria-controls="story-deck-cards"
                    disabled={index >= n - 1}
                    onClick={() => step(1)}
                  >
                    <Chevron dir="left" />
                  </PressButton>
                  <PressButton
                    className="app-story-round"
                    aria-label={s.prev}
                    aria-controls="story-deck-cards"
                    disabled={index <= 0}
                    onClick={() => step(-1)}
                  >
                    <Chevron dir="right" />
                  </PressButton>
                </div>
              </>
            )}
            <Link
              href={path("/work")}
              transitionTypes={["app-open"]}
              className="app-story-pill"
              onClick={(e) => {
                if (!isPlainClick(e)) return;
                blip("open");
                bounce(visibleIcon("work")?.querySelector("[data-dock-bounce]"));
              }}
            >
              {s.all}
              <Arrow />
            </Link>
          </div>
        }
      />

      <div ref={rulerRef} className="app-story-ruler" aria-hidden />

      {n === 0 ? (
        <div className="app-story-deck-empty">
          <p>{s.empty}</p>
          <a href={SOCIALS.github} target="_blank" rel="noreferrer" className="app-story-pill">
            {s.profile}
            <Arrow external />
          </a>
        </div>
      ) : (
        <>
          <div
            ref={viewportRef}
            id="story-deck-cards"
            className="app-story-deck-vp"
            role="group"
            aria-roledescription="carousel"
            aria-label={s.deck}
            data-ready={geo ? "" : undefined}
            data-single={n < 2 || undefined}
            onKeyDown={onKeyDown}
            {...handlers}
          >
            {list.map((repo, r) => (
              <DeckCard
                key={repo.name}
                repo={repo}
                r={r}
                n={n}
                q={q}
                geo={geo}
                focused={r === index}
                onBringForward={() => {
                  go(r);
                  blip("tick");
                }}
                refCb={(el) => {
                  cardRefs.current[r] = el;
                }}
              />
            ))}
          </div>

          {n > 1 && (
            <div className="app-story-deck-pager">
              <p className="app-story-deck-hint">{s.lede}</p>
              {list.map((repo, r) => (
                <button
                  key={repo.name}
                  type="button"
                  className="app-story-deck-dot"
                  data-on={r === index || undefined}
                  aria-label={fill(s.position, { i: r + 1, n, name: repo.name })}
                  aria-current={r === index ? "true" : undefined}
                  onClick={() => {
                    if (r === index) return;
                    go(r);
                    blip("tick");
                  }}
                >
                  <span />
                </button>
              ))}
            </div>
          )}
          <p className="sr-only" aria-live="polite">
            {list[index] ? fill(s.position, { i: index + 1, n, name: list[index].name }) : ""}
          </p>
        </>
      )}
    </section>
  );
}

function DeckCard({
  repo,
  r,
  n,
  q,
  geo,
  focused,
  onBringForward,
  refCb,
}: {
  repo: RepoInfo;
  r: number;
  n: number;
  q: MotionValue<number>;
  geo: DeckGeo | null;
  focused: boolean;
  onBringForward: () => void;
  refCb: (el: HTMLAnchorElement | null) => void;
}) {
  const { t, lang } = useI18n();
  const s = t.story.work;
  const hydrated = useHydrated();
  const { blip } = useSound();

  const x = useTransform(q, (v) => (geo ? geo.A + offsetAt(v - r, geo) : 0));
  const scale = useTransform(q, (v) => {
    const d = v - r;
    return geo && d < 0 ? 1 - geo.shrink * Math.min(-d, 4) : 1;
  });
  // the first card back recedes most; deeper ones keep darkening a little
  const dim = useTransform(q, (v) => {
    const d = v - r;
    return d < 0 ? Math.min(-d, 1) * 0.4 + Math.max(0, Math.min(-d - 1, 2)) * 0.14 : 0;
  });
  const name = useTransform(q, (v) => {
    const d = v - r;
    if (d >= 0) return 1;
    const keep = geo?.roomy ? 1.15 : 0.35;
    return Math.max(0, Math.min(1, (keep + d) * 3));
  });
  const visibility = useTransform(q, (v) => (v - r < -4.6 ? "hidden" : "visible"));
  const descId = `story-deck-desc-${r}`;

  return (
    <m.div
      className="app-story-deck-card"
      data-deck-card={r}
      style={geo ? { x, scale, zIndex: n - r, visibility } : { zIndex: n - r }}
    >
      <m.span className="app-story-deck-label" aria-hidden style={{ opacity: name }}>
        <PixelPlanet seed={repo.name} className="app-story-deck-icon" />
        <span className="app-story-deck-label-name">{repo.name}</span>
      </m.span>
      <a
        ref={refCb}
        href={repo.url}
        target="_blank"
        rel="noreferrer"
        draggable={false}
        className="app-story-deck-win"
        tabIndex={focused ? 0 : -1}
        aria-label={`${repo.name}, ${s.github}`}
        aria-describedby={descId}
        data-cursor={focused ? s.cursor : undefined}
        onClick={(e) => {
          if (!focused) {
            e.preventDefault();
            onBringForward();
            return;
          }
          blip("open");
        }}
      >
        {/* an app snapshot, like the switcher's: opaque, so a stack of
            moving cards never re-blurs what's under it every frame */}
        <span aria-hidden className="app-story-deck-surface" />
        <span className="app-story-deck-bar" aria-hidden>
          <span className="app-story-mc-lights">
            <i />
            <i />
            <i />
          </span>
          <span className="app-story-deck-path">~/cempack/{repo.name}</span>
          <span className="app-story-deck-stars tabular">★ {repo.stars}</span>
        </span>
        <span className="app-story-deck-body">
          <span className="app-story-deck-plate" aria-hidden>
            <PixelPlanet seed={repo.name} className="app-story-deck-planet" />
            {repo.preview && (
              // eslint-disable-next-line @next/next/no-img-element -- a README screenshot from any host
              <img
                src={repo.preview}
                alt=""
                loading="lazy"
                decoding="async"
                draggable={false}
                className="app-story-deck-shot"
                onError={(e) => {
                  e.currentTarget.hidden = true;
                }}
              />
            )}
          </span>
          <span className="app-story-deck-text">
            <span className="app-story-deck-name">{repo.name}</span>
            <span id={descId} className="app-story-deck-desc">
              {repo.description || s.noDesc}
            </span>
            {repo.topics.length > 0 && (
              <span className="app-story-deck-topics" aria-hidden>
                {repo.topics.slice(0, 3).map((topic) => (
                  <span key={topic}>{topic}</span>
                ))}
              </span>
            )}
          </span>
        </span>
        <span className="app-story-deck-status" aria-hidden>
          <span className="app-story-deck-lang">
            <i style={{ background: LANG_COLORS[repo.language] ?? LANG_FALLBACK }} />
            {repo.language || "—"}
          </span>
          {repo.forks > 0 && <span className="tabular">⑂ {repo.forks}</span>}
          {hydrated && <span>{fill(s.updated, { ago: timeAgo(repo.pushedAt, lang) })}</span>}
          <span className="app-story-deck-cta">
            {s.github}
            <Arrow external />
          </span>
        </span>
        <m.span className="app-story-deck-dim" aria-hidden style={{ opacity: dim }} />
      </a>
    </m.div>
  );
}

function Chevron({ dir }: { dir: "left" | "right" }) {
  return (
    <svg width="14" height="14" viewBox="0 0 7 7" shapeRendering="crispEdges" fill="currentColor" aria-hidden style={dir === "right" ? { transform: "scaleX(-1)" } : undefined}>
      <rect x="4" y="0" width="1" height="1" />
      <rect x="3" y="1" width="1" height="1" />
      <rect x="2" y="2" width="1" height="1" />
      <rect x="1" y="3" width="1" height="1" />
      <rect x="2" y="4" width="1" height="1" />
      <rect x="3" y="5" width="1" height="1" />
      <rect x="4" y="6" width="1" height="1" />
    </svg>
  );
}

export function Arrow({ external = false }: { external?: boolean }) {
  return external ? (
    <svg width="11" height="11" viewBox="0 0 7 7" shapeRendering="crispEdges" fill="currentColor" aria-hidden>
      <rect x="2" y="1" width="4" height="1" />
      <rect x="5" y="1" width="1" height="4" />
      <rect x="4" y="2" width="1" height="1" />
      <rect x="3" y="3" width="1" height="1" />
      <rect x="2" y="4" width="1" height="1" />
      <rect x="1" y="5" width="1" height="1" />
    </svg>
  ) : (
    <svg width="11" height="11" viewBox="0 0 7 7" shapeRendering="crispEdges" fill="currentColor" aria-hidden>
      <rect x="0" y="3" width="6" height="1" />
      <rect x="4" y="1" width="1" height="1" />
      <rect x="5" y="2" width="1" height="1" />
      <rect x="5" y="4" width="1" height="1" />
      <rect x="4" y="5" width="1" height="1" />
    </svg>
  );
}
