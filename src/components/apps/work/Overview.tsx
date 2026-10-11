"use client";

import type { RepoInfo } from "@/lib/github";
import { useI18n } from "@/i18n/client";
import { timeAgo } from "@/lib/format";
import { useNow } from "@/components/os/menubar/util";
import { compact, fmt, langColor } from "./model";

/** cells in the language bar */
const BAR = 48;
/** the activity line's span, in days (log scale: recent pushes get room) */
const SPAN = 365;
const TICKS: { days: number; key: "year" | "half" | "month" | "week" | "day" }[] = [
  { days: 365, key: "year" },
  { days: 182, key: "half" },
  { days: 30, key: "month" },
  { days: 7, key: "week" },
  { days: 1, key: "day" },
];
/** position on the line for an age in days: 0 = a year ago, 1 = now */
const at = (days: number) => 1 - Math.log1p(Math.min(SPAN, Math.max(0, days))) / Math.log1p(SPAN);

/**
 * The projects at a glance, Atlas-style: four figures, the languages as a
 * pixel bar (each a filter), and every repo's last push on one line.
 */
export function Overview({ repos, hydrated, onLang }: { repos: RepoInfo[]; hydrated: boolean; onLang: (lang: string) => void }) {
  const { t, lang } = useI18n();
  const o = t.work.overview;

  const stars = repos.reduce((s, r) => s + r.stars, 0);
  const forks = repos.reduce((s, r) => s + r.forks, 0);
  const counts = new Map<string, number>();
  for (const r of repos) if (r.language) counts.set(r.language, (counts.get(r.language) ?? 0) + 1);
  const langs = [...counts].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
  const known = langs.reduce((s, [, n]) => s + n, 0);
  const latest = [...repos].sort((a, b) => (Date.parse(b.pushedAt) || 0) - (Date.parse(a.pushedAt) || 0))[0];

  // the bar: each language gets its share of the cells, in order
  const cells: string[] = [];
  langs.forEach(([name, n], i) => {
    const want = i === langs.length - 1 ? BAR - cells.length : Math.max(1, Math.round((n / known) * BAR));
    for (let k = 0; k < want && cells.length < BAR; k++) cells.push(langColor(name));
  });

  const figures = [
    { k: o.repos, v: String(repos.length), sub: o.reposSub },
    { k: o.stars, v: compact(stars, lang), sub: fmt(o.forksSub, { n: forks }) },
    { k: o.langs, v: String(langs.length), sub: langs[0] ? fmt(o.langsSub, { lang: langs[0][0] }) : "—" },
    { k: o.push, v: hydrated && latest?.pushedAt ? timeAgo(latest.pushedAt, lang) : "—", sub: latest?.name ?? "—" },
  ];

  const clock = useNow("minute");
  const now = clock ? clock.getTime() : 0;
  const blips = hydrated && clock
    ? repos
        .filter((r) => r.pushedAt)
        .map((r) => ({ r, x: at((now - Date.parse(r.pushedAt)) / 86_400_000) }))
        .sort((a, b) => a.x - b.x)
    : [];

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

      <div className="app-work-ov-row">
        <p className="app-work-ov-k">{o.languages}</p>
        <span className="app-work-ov-bar" aria-hidden>
          {cells.map((c, i) => (
            <i key={i} style={{ background: c }} />
          ))}
        </span>
        <ul className="app-work-ov-legend" role="list">
          {langs.map(([name, n]) => (
            <li key={name}>
              <button type="button" className="app-work-ov-lang" onClick={() => onLang(name)} aria-label={fmt(o.filterLang, { lang: name })}>
                <span className="app-work-dot" style={{ background: langColor(name) }} aria-hidden />
                {name}
                <span className="app-work-ov-n tabular">{n}</span>
              </button>
            </li>
          ))}
        </ul>
      </div>

      <div className="app-work-ov-row">
        <p className="app-work-ov-k">{o.activity}</p>
        <div className="app-work-ov-line" aria-hidden>
          <span className="app-work-ov-axis" />
          {TICKS.map((tk) => (
            <span key={tk.key} className="app-work-ov-tick" style={{ left: `${at(tk.days) * 100}%` }}>
              <span>{o.ticks[tk.key]}</span>
            </span>
          ))}
          <span className="app-work-ov-tick app-work-ov-tick--now" style={{ left: "100%" }}>
            <span>{o.ticks.now}</span>
          </span>
          {blips.map(({ r, x }) => (
            <span
              key={r.name}
              className="app-work-ov-blip"
              style={{ left: `${x * 100}%`, "--c": langColor(r.language ?? "") } as React.CSSProperties}
              title={fmt(o.pushedAgo, { name: r.name, ago: timeAgo(r.pushedAt, lang) })}
            />
          ))}
        </div>
        <ul className="sr-only">
          {blips.map(({ r }) => (
            <li key={r.name}>{fmt(o.pushedAgo, { name: r.name, ago: timeAgo(r.pushedAt, lang) })}</li>
          ))}
        </ul>
      </div>
    </section>
  );
}
