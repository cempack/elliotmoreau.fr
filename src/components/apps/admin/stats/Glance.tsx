"use client";

import "./stats.css";
import { useEffect, useMemo, useState } from "react";
import { useI18n } from "@/i18n/client";
import { rpc, type Stats } from "../api";
import { Btn, fill } from "../ui";
import { formats } from "./data";
import { Spark } from "./Trend";

/**
 * The visitors on the Overview, in one card: today's, who's here now, the
 * last seven days as a small line, and the way into Stats.
 */
export function StatsGlance({ onOpen }: { onOpen: () => void }) {
  const { t, lang } = useI18n();
  const s = t.admin.stats;
  const [stats, setStats] = useState<Stats | null>(null);
  const f = useMemo(() => formats(lang === "fr" ? "fr-FR" : "en-GB"), [lang]);

  useEffect(() => {
    let dead = false;
    const load = () => {
      if (document.visibilityState === "hidden") return;
      rpc<{ stats: Stats }>("stats", { range: 7 }).then((r) => !dead && r.ok && setStats(r.stats));
    };
    load();
    const id = window.setInterval(load, 60_000);
    return () => {
      dead = true;
      window.clearInterval(id);
    };
  }, []);

  const today = stats?.days[stats.days.length - 1];
  return (
    <section className="st-card st-glance" aria-labelledby="st-glance-t">
      <div className="st-glance-figures">
        <p id="st-glance-t" className="st-title">
          {s.glance}
        </p>
        <p className="st-glance-value">
          <strong>{today ? f.count(today.visitors) : "–"}</strong> {s.glanceToday}
        </p>
        <p className="st-sub">{stats ? (stats.live ? (stats.live === 1 ? s.liveOne : fill(s.liveCount, { n: stats.live })) : s.liveNone) : s.loading}</p>
      </div>
      {stats && <Spark values={stats.days.map((d) => d.visitors)} on w={160} h={40} />}
      <Btn kind="plain" onClick={onOpen}>
        {s.open}
      </Btn>
    </section>
  );
}
