"use client";

import type { RepoInfo } from "@/lib/github";
import { useI18n } from "@/i18n/client";
import { timeAgo } from "@/lib/format";
import { compact, fmt } from "./model";

/**
 * The projects at a glance: three figures, each said once on the page.
 * Languages live in the sidebar (each a filter, with its count), and how
 * recent each repo is shows on the repo itself (its shine on the lid, its
 * freshness cells in the list), so neither is repeated here.
 */
export function Overview({ repos, hydrated }: { repos: RepoInfo[]; hydrated: boolean }) {
  const { t, lang } = useI18n();
  const o = t.work.overview;

  const stars = repos.reduce((s, r) => s + r.stars, 0);
  const forks = repos.reduce((s, r) => s + r.forks, 0);
  const latest = [...repos].sort((a, b) => (Date.parse(b.pushedAt) || 0) - (Date.parse(a.pushedAt) || 0))[0];

  const figures = [
    { k: o.repos, v: String(repos.length), sub: o.reposSub },
    { k: o.stars, v: compact(stars, lang), sub: fmt(o.forksSub, { n: forks }) },
    { k: o.push, v: hydrated && latest?.pushedAt ? timeAgo(latest.pushedAt, lang) : "-", sub: latest?.name ?? "-" },
  ];

  return (
    <section className="app-work-ov" aria-label={o.label}>
      <dl className="app-work-ov-figs">
        {figures.map((f) => (
          <div key={f.k} className="app-work-ov-fig">
            <dt className="app-work-ov-k">{f.k}</dt>
            <dd className="app-work-ov-v tabular" suppressHydrationWarning>
              {f.v}
            </dd>
            <dd className="app-work-ov-sub">{f.sub}</dd>
          </div>
        ))}
      </dl>
    </section>
  );
}
