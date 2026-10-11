"use client";

import { useI18n } from "@/i18n/client";
import { travelStats } from "./geo";
import { fill, useKm } from "./fmt";

const STATS = travelStats();

/** Countries been · furthest from home · continents. (How many are still
    to come is the list's own NEXT count, so it isn't repeated here.) */
export function Stats({ layout = "strip" }: { layout?: "strip" | "grid" }) {
  const { t, lang } = useI18n();
  const s = t.atlas.stats;
  const fmt = useKm();
  const cells = [
    { k: s.countries, v: String(STATS.countries), sub: fill(s.countriesSub, { n: STATS.places }) },
    { k: s.furthest, v: fmt(STATS.furthestKm), unit: t.atlas.km, sub: STATS.furthest.name[lang] },
    { k: s.continents, v: String(STATS.continents), sub: s.continentsSub },
  ];
  return (
    <section className="app-atlas-stats" data-layout={layout} aria-label={s.label}>
      <dl className="app-atlas-stats-list">
        {cells.map((c) => (
          <div key={c.k} className="app-atlas-stat">
            <dt className="app-atlas-stat-k">{c.k}</dt>
            <dd className="app-atlas-stat-v">
              <span className="tabular">{c.v}</span>
              {c.unit && <span className="app-atlas-stat-unit">{c.unit}</span>}
            </dd>
            <dd className="app-atlas-stat-sub">{c.sub}</dd>
          </div>
        ))}
      </dl>
    </section>
  );
}
