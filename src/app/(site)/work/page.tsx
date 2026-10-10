"use client";

import { useEffect, useMemo, useState } from "react";
import { useLang } from "@/lib/i18n";
import { timeAgo } from "@/lib/format";
import { SOCIALS } from "@/lib/places";
import type { RepoInfo } from "@/lib/github";
import { LANG_COLORS, LANG_FALLBACK } from "@/lib/langColors";
import { PixelLabel } from "@/components/PixelLabel";
import { Reveal } from "@/components/Reveal";
import { Tilt } from "@/components/Tilt";
import { TtfxText } from "@/components/TtfxText";
import { PixelPlanet } from "@/components/PixelPlanet";
import { CardSparkles, GLYPH_CODE, GLYPH_STAR, PixelGlyph } from "@/components/glyphs";

type Sort = "recent" | "stars";

/** Star count as a block bar, scaled to the loudest repo on the page. */
function StarBar({ stars, max }: { stars: number; max: number }) {
  const filled = max > 0 ? Math.round((stars / max) * 8) : 0;
  return (
    <span aria-hidden className="tracking-tighter text-ember/80">
      {"▓".repeat(filled)}
      <span className="text-faint/60">{"░".repeat(8 - filled)}</span>
    </span>
  );
}

/** Condensed meta line for narrow screens, where the full Meta hides. */
function MetaMobile({ repo, lang }: { repo: RepoInfo; lang: "en" | "fr" }) {
  const { t } = useLang();
  const color = LANG_COLORS[repo.language] ?? LANG_FALLBACK;
  return (
    <span className="flex flex-wrap items-center gap-x-3 gap-y-1 font-mono text-[11px] text-faint sm:hidden">
      {repo.language && (
        <span className="inline-flex items-center gap-1.5">
          <span className="h-2 w-2 rounded-full" style={{ background: color }} aria-hidden />
          {repo.language}
        </span>
      )}
      <span className="inline-flex items-center gap-1.5">
        <PixelGlyph cells={GLYPH_STAR} size={11} className="text-ember/80" />
        {repo.stars}
      </span>
      {repo.pushedAt && (
        <span>
          {t("work.updated")} {timeAgo(repo.pushedAt, lang)}
        </span>
      )}
    </span>
  );
}

function Meta({ repo, max, lang }: { repo: RepoInfo; max: number; lang: "en" | "fr" }) {
  const { t } = useLang();
  const color = LANG_COLORS[repo.language] ?? LANG_FALLBACK;
  return (
    <>
      {repo.language && (
        <span className="hidden shrink-0 items-center gap-2 font-mono text-[11px] text-faint md:inline-flex">
          <span className="h-2 w-2 rounded-full" style={{ background: color }} aria-hidden />
          {repo.language}
        </span>
      )}
      <span className="hidden shrink-0 items-center gap-2 font-mono text-[11px] text-faint sm:inline-flex">
        <PixelGlyph cells={GLYPH_STAR} size={12} className="text-ember/80 transition-colors group-hover:text-ember" />
        {repo.stars} <StarBar stars={repo.stars} max={max} />
      </span>
      {repo.pushedAt && (
        <span className="hidden shrink-0 font-mono text-[11px] text-faint lg:inline">
          {t("work.updated")} {timeAgo(repo.pushedAt, lang)}
        </span>
      )}
    </>
  );
}

function Skeleton() {
  return (
    <div className="mt-10 grid gap-4" aria-hidden>
      <div className="h-72 animate-pulse rounded-[12px] border border-line bg-ink-2" />
      {Array.from({ length: 4 }).map((_, i) => (
        <div key={i} className="flex items-center gap-4 border-t border-line py-4 last:border-b">
          <div className="h-12 w-12 shrink-0 animate-pulse rounded-[8px] bg-ink-2" />
          <div className="flex-1">
            <div className="h-5 w-2/3 animate-pulse rounded bg-ink-2" />
            <div className="mt-2 h-4 w-1/2 animate-pulse rounded bg-ink-2" />
          </div>
        </div>
      ))}
    </div>
  );
}

export default function Work() {
  const { lang, t } = useLang();
  const [repos, setRepos] = useState<RepoInfo[] | null>(null);
  const [failed, setFailed] = useState(false);
  const [sort, setSort] = useState<Sort>("recent");

  useEffect(() => {
    let alive = true;
    fetch("/api/github/repos")
      .then((r) => (r.ok ? r.json() : null))
      .then((j: { repos?: RepoInfo[] } | null) => {
        if (!alive) return;
        if (j?.repos) setRepos(j.repos);
        else setFailed(true);
      })
      .catch(() => alive && setFailed(true));
    return () => {
      alive = false;
    };
  }, []);

  const ordered = useMemo(() => {
    if (!repos) return null;
    const list = [...repos];
    if (sort === "stars") list.sort((a, b) => b.stars - a.stars);
    return list;
  }, [repos, sort]);
  const maxStars = useMemo(
    () => repos?.reduce((m, r) => Math.max(m, r.stars), 0) ?? 0,
    [repos]
  );
  const totalStars = useMemo(() => repos?.reduce((m, r) => m + (r.stars || 0), 0) ?? 0, [repos]);
  const featured = ordered?.[0] ?? null;
  const rest = ordered?.slice(1) ?? [];

  return (
    <div className="mx-auto max-w-6xl px-4 pb-24 pt-16 sm:px-6 sm:pt-20">
      <PixelLabel text={t("work.pixelKicker")} cell={3} className="block text-ember" />
      <div className="mt-3 flex flex-wrap items-end justify-between gap-x-6 gap-y-4">
        <div className="min-w-0">
          <h1 className="font-display text-5xl font-light tracking-tight text-bone sm:text-6xl lg:text-7xl">
            {t("work.title")}
          </h1>
          <p className="mt-2 font-mono text-[11px] text-faint">{t("work.note")}</p>
          {repos && (
            <p className="mt-3 inline-flex items-center gap-2 rounded-[8px] border border-line/70 bg-panel/60 px-2.5 py-1 font-mono text-[11px] text-sage">
              <PixelGlyph cells={GLYPH_STAR} size={12} className="text-ember" />
              <span className="tabular-nums text-bone">{repos.length}</span> {t("work.title").toLowerCase()}
              <span aria-hidden className="text-faint">·</span>
              <span className="tabular-nums text-bone">{totalStars}</span> {t("work.stars")}
            </p>
          )}
        </div>
        {repos && repos.length > 1 && (
          <div
            role="group"
            aria-label={t("work.title")}
            className="flex items-center gap-1 rounded-[12px] border border-line bg-panel p-1 font-mono text-[11px]"
          >
            {(["recent", "stars"] as Sort[]).map((s) => (
              <button
                key={s}
                onClick={() => setSort(s)}
                aria-pressed={sort === s}
                className={`inline-flex min-h-[36px] items-center gap-1.5 rounded-[9px] px-3 py-2 transition-colors ${
                  sort === s ? "bg-ember text-[#232A2E]" : "text-faint hover:text-bone"
                }`}
              >
                {s === "stars" && <PixelGlyph cells={GLYPH_STAR} size={11} />}
                {t(s === "recent" ? "work.sortRecent" : "work.sortStars")}
              </button>
            ))}
          </div>
        )}
      </div>

      {!repos && !failed && <Skeleton />}
      {failed && (
        <Reveal className="mt-10 rounded-[12px] border border-line bg-ink-2 p-8 text-center is-visible">
          <p className="text-sage">{t("work.empty")}</p>
          <a
            href={SOCIALS.github}
            target="_blank"
            rel="noreferrer"
            className="mt-4 inline-block rounded-[12px] bg-ember px-6 py-3 text-sm font-medium text-[#232A2E] transition-colors hover:bg-bone"
          >
            {t("work.openGithub")} ↗
          </a>
        </Reveal>
      )}

      {featured && (
        <Reveal className="mt-10" preset="lift">
          <Tilt max={4}>
            <a
              href={featured.url}
              target="_blank"
              rel="noreferrer"
              className="group grid overflow-hidden rounded-[12px] border border-ember/40 bg-gradient-to-br from-panel to-ink-2 transition-all hover:-translate-y-1 hover:border-ember hover:shadow-[0_18px_50px_-20px_rgba(167,192,128,0.25)] lg:grid-cols-[1.05fr_1fr]"
            >
              <span className="relative flex min-w-0 flex-col p-6 sm:p-8 lg:p-10">
                <CardSparkles />
                <span className="flex items-center justify-between gap-4">
                  <span className="inline-flex items-center gap-2.5">
                    <PixelGlyph
                      cells={GLYPH_CODE}
                      size={18}
                      className="text-faint transition-all duration-200 group-hover:-translate-y-0.5 group-hover:text-ember"
                    />
                    <PixelLabel text={t("work.featured")} cell={2} className="text-ember" />
                  </span>
                  <span className="inline-flex shrink-0 items-center gap-2 font-mono text-[11px] text-faint transition-colors group-hover:text-ember">
                    {t("work.visit")}
                    <span className="pixel-arrow font-display text-xl leading-none" aria-hidden>
                      →
                    </span>
                  </span>
                </span>
                <span className="mt-5 block font-mono text-3xl leading-tight text-bone sm:text-4xl">
                  <TtfxText text={featured.name} effect="decrypt" loop={false} />
                </span>
                {/* Live GitHub text stays exactly as the API sent it */}
                <span className="mt-3 block max-w-2xl leading-relaxed text-sage">
                  {featured.description}
                </span>
                <span className="mt-auto block pt-6">
                  <span className="flex flex-wrap items-center gap-x-5 gap-y-2">
                    <MetaMobile repo={featured} lang={lang} />
                    <Meta repo={featured} max={maxStars} lang={lang} />
                    {featured.topics?.slice(0, 3).map((tag) => (
                      <span
                        key={tag}
                        className="rounded-[8px] border border-line/70 bg-ink/60 px-2 py-0.5 font-mono text-[11px] text-sage transition-colors group-hover:border-ember/40 group-hover:text-bone"
                      >
                        #{tag}
                      </span>
                    ))}
                  </span>
                </span>
              </span>
              <span className="relative min-h-56 overflow-hidden border-t border-line/60 bg-ink lg:border-l lg:border-t-0">
                {featured.preview ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={featured.preview}
                    alt=""
                    loading="lazy"
                    className="absolute inset-0 h-full w-full object-cover object-top transition-transform duration-500 group-hover:scale-[1.02]"
                  />
                ) : (
                  <span className="pixel-dots absolute inset-0 flex items-center justify-center p-8">
                    <PixelPlanet
                      seed={featured.name}
                      className="h-40 w-auto drop-shadow-[0_0_24px_rgba(167,192,128,0.25)] transition-transform duration-500 group-hover:scale-[1.04] sm:h-48"
                    />
                  </span>
                )}
              </span>
            </a>
          </Tilt>
        </Reveal>
      )}

      {rest.length > 0 && (
        <div className="mt-14">
          <PixelLabel text={t("work.rest")} cell={2} className="mb-2 block text-faint" />
          <ol>
            {rest.map((r, i) => (
              <li key={r.name}>
                <Reveal delay={(i % 8) * 55} preset="lift">
                  <a
                    href={r.url}
                    target="_blank"
                    rel="noreferrer"
                    className="group relative flex items-center gap-3 border-t border-line px-2 py-4 transition-colors last:border-b hover:bg-ink-2 sm:gap-4 sm:px-3"
                  >
                    <span className="w-7 shrink-0 font-mono text-[11px] text-faint transition-colors group-hover:text-ember">
                      {String(i + 2).padStart(2, "0")}
                    </span>
                    <span className="block h-12 w-12 shrink-0 overflow-hidden rounded-[8px] border border-line bg-ink transition-colors group-hover:border-ember/50 max-[420px]:hidden">
                      {r.preview ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img
                          src={r.preview}
                          alt=""
                          loading="lazy"
                          className="h-full w-full object-cover object-top transition-transform duration-300 group-hover:scale-105"
                        />
                      ) : (
                        <PixelPlanet seed={r.name} className="h-full w-full p-1.5" />
                      )}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate font-mono text-[15px] text-bone transition-colors group-hover:text-ember">
                        <TtfxText text={r.name} effect="decrypt" loop={false} />
                      </span>
                      <span className="mt-0.5 block truncate text-[13px] text-faint">
                        {r.description}
                      </span>
                      <span className="mt-1 block">
                        <MetaMobile repo={r} lang={lang} />
                      </span>
                    </span>
                    <Meta repo={r} max={maxStars} lang={lang} />
                    <span
                      className="pixel-arrow shrink-0 font-display text-2xl text-faint"
                      aria-hidden
                    >
                      →
                    </span>
                  </a>
                </Reveal>
              </li>
            ))}
          </ol>
        </div>
      )}
    </div>
  );
}
