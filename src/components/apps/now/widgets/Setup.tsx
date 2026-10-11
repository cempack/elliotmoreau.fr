"use client";

import { PixelLabel } from "@/components/PixelLabel";
import { useI18n } from "@/i18n/client";
import type { RepoInfo } from "@/lib/github";
import { NOW, loc } from "@/content/now";

const PALETTE = [
  ["ink", "#161a17"],
  ["flare", "#e2786b"],
  ["signal", "#b0cc86"],
  ["ember", "#e0bd6e"],
  ["ion", "#89b4a8"],
  ["lilac", "#aea3c8"],
  ["label-3", "#8f988f"],
  ["paper", "#ebe9e1"],
] as const;

export function SetupMeta() {
  return <span className="app-now-status app-now-status--mono">fastfetch</span>;
}

/**
 * The "uses" sheet as fastfetch would print it: a pixel logo, user@host,
 * the hand-written rows from content (unconfirmed ones stay hidden), one
 * live row (languages, from GitHub) and the palette.
 */
export function Setup({ repos }: { repos: RepoInfo[] }) {
  const { t, lang } = useI18n();
  const s = t.now.setup;
  const counts = new Map<string, number>();
  for (const r of repos) if (r.language) counts.set(r.language, (counts.get(r.language) ?? 0) + 1);
  const langs = [...counts.entries()].sort((a, b) => b[1] - a[1]).map(([l]) => l).slice(0, 4);

  const rows: [string, string][] = NOW.setup.filter((r) => !("todo" in r && r.todo)).map((r) => [loc(r.key, lang), loc(r.value, lang)]);
  if (langs.length) rows.push([s.langs, langs.join(", ")]);

  return (
    <div className="app-now-fetch">
      <div className="app-now-fetch-logo" aria-hidden>
        <PixelLabel text="DOS MOOS" cell={2} className="app-now-fetch-mark" />
      </div>
      <div className="app-now-fetch-info">
        <p className="app-now-fetch-prompt" aria-hidden>
          <span>~</span> ❯ fastfetch
        </p>
        <p className="app-now-fetch-user">
          <span>elliot</span>@<span>emos</span>
        </p>
        <p className="app-now-fetch-rule" aria-hidden>
          ───────────
        </p>
        <dl className="app-now-fetch-rows">
          {rows.map(([k, v]) => (
            <div key={k}>
              <dt>{k}</dt>
              <dd>{v}</dd>
            </div>
          ))}
        </dl>
        <div className="app-now-fetch-pal" role="img" aria-label={s.palette}>
          {PALETTE.map(([name, c]) => (
            <i key={name} style={{ background: c }} />
          ))}
        </div>
        <p className="app-now-fetch-caption">{s.caption}</p>
      </div>
    </div>
  );
}
