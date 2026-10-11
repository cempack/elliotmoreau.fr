"use client";

import { PixelPlanet } from "@/components/PixelPlanet";
import { PixelLabel } from "@/components/PixelLabel";
import { useI18n } from "@/i18n/client";
import type { RepoInfo } from "@/lib/github";
import { NOW, loc } from "@/content/now";
import { useNow } from "../lib";

const PALETTE = [
  ["ink", "#11131c"],
  ["flare", "#ff5f7e"],
  ["signal", "#c6ff5e"],
  ["ember", "#ffb86b"],
  ["ion", "#8be9ff"],
  ["lilac", "#b3a4ff"],
  ["label-3", "#9196a6"],
  ["paper", "#f5f2ec"],
] as const;

export function SetupMeta() {
  return <span className="app-now-status app-now-status--mono">fastfetch</span>;
}

/**
 * The "uses" sheet as fastfetch would print it: a pixel logo, user@host,
 * the hand-written rows from content (unconfirmed ones stay hidden), two
 * live rows (languages from GitHub, local time) and the palette.
 */
export function Setup({ repos }: { repos: RepoInfo[] }) {
  const { t, lang } = useI18n();
  const s = t.now.setup;
  const now = useNow(15_000);
  const counts = new Map<string, number>();
  for (const r of repos) if (r.language) counts.set(r.language, (counts.get(r.language) ?? 0) + 1);
  const langs = [...counts.entries()].sort((a, b) => b[1] - a[1]).map(([l]) => l).slice(0, 4);
  const time = now
    ? new Intl.DateTimeFormat("en-GB", { timeZone: "Europe/Paris", hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).format(now)
    : "--:--";

  const rows: [string, React.ReactNode][] = NOW.setup.filter((r) => !("todo" in r && r.todo)).map((r) => [loc(r.key, lang), loc(r.value, lang)]);
  if (langs.length) rows.push([s.langs, langs.join(", ")]);
  rows.push([s.time, <span key="t" className="tabular">{time} · Europe/Paris</span>]);

  return (
    <div className="app-now-fetch">
      <div className="app-now-fetch-logo" aria-hidden>
        <PixelPlanet seed="dos-moos" className="app-now-fetch-planet" />
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
