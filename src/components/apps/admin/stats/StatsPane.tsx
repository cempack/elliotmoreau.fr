"use client";

import "./stats.css";
import { useEffect, useMemo, useState } from "react";
import { useI18n } from "@/i18n/client";
import { rpc, type Stats, type StatsDim, type StatsFilter, type StatsRange } from "../api";
import { Section, Segmented, fill } from "../ui";
import { METRICS, formats, pointsOf, sourceName, upIsGood, valueOf, type Metric } from "./data";
import { Live, Ranked, Tabs, WeekGrid } from "./Parts";
import { Spark, Trend } from "./Trend";
import { WorldMap } from "./WorldMap";

const RANGES: StatsRange[] = [1, 7, 30, 90, 365];
const DIMS: StatsDim[] = ["path", "ref", "country", "device", "browser", "os", "lang"];
const RANGE_KEY = "em-admin-stats-range";

/** the filter with its keys in one order, so the one the server sends back compares equal */
const norm = (f: StatsFilter): StatsFilter => Object.fromEntries(DIMS.filter((d) => f[d] != null).map((d) => [d, f[d]]));
const sameScope = (a: { range: StatsRange; filter: StatsFilter }, b: { range: StatsRange; filter: StatsFilter }) =>
  a.range === b.range && JSON.stringify(norm(a.filter)) === JSON.stringify(norm(b.filter));

const toulouseHour = (t: number) => Number(new Intl.DateTimeFormat("en-GB", { timeZone: "Europe/Paris", hour: "2-digit", hourCycle: "h23" }).format(t));

function storedRange(): StatsRange {
  try {
    const n = Number(localStorage.getItem(RANGE_KEY));
    if ((RANGES as number[]).includes(n)) return n as StatsRange;
  } catch {}
  return 30;
}

/**
 * The site's stats, as a dashboard of their own. One row of controls
 * scopes everything under it: the period, and whatever it's narrowed to
 * (click any page, source, country, device… to show only that; the chips
 * take it off again). Then five figures against the period before, each a
 * tab for the big chart; where visitors are on a map, beside who's here
 * right now; where they came from, what they read, on what, and when.
 * Live while the panel is open: every 20 seconds, and at once on return.
 */
export function StatsPane() {
  const { t, lang } = useI18n();
  const s = t.admin.stats;
  const locale = lang === "fr" ? "fr-FR" : "en-GB";
  const [range, setRangeState] = useState<StatsRange>(30);
  const [filter, setFilter] = useState<StatsFilter>({});
  const [metric, setMetric] = useState<Metric>("visitors");
  const [stats, setStats] = useState<Stats | null>(null);
  const [failed, setFailed] = useState(false);
  const [updated, setUpdated] = useState(0);
  const [pageTab, setPageTab] = useState<"pages" | "entries" | "exits">("pages");
  const [techTab, setTechTab] = useState<"devices" | "browsers" | "systems" | "languages">("devices");
  const [optedOut, setOptedOut] = useState(false);

  // the period you last looked at, and whether this browser opts out of being counted
  useEffect(() => {
    const id = requestAnimationFrame(() => {
      setRangeState(storedRange());
      const nav = navigator as Navigator & { globalPrivacyControl?: boolean };
      setOptedOut(!!nav.globalPrivacyControl || nav.doNotTrack === "1");
    });
    return () => cancelAnimationFrame(id);
  }, []);
  const setRange = (r: StatsRange) => {
    setRangeState(r);
    try {
      localStorage.setItem(RANGE_KEY, String(r));
    } catch {}
  };

  const scopeKey = JSON.stringify([range, norm(filter)]);
  useEffect(() => {
    let dead = false;
    const [r, f] = JSON.parse(scopeKey) as [StatsRange, StatsFilter];
    const load = () => {
      if (document.visibilityState === "hidden") return;
      rpc<{ stats: Stats }>("stats", { range: r, filter: f }).then((res) => {
        if (dead) return;
        if (res.ok) {
          setStats(res.stats);
          setUpdated(Date.now());
          setFailed(false);
        } else setFailed(true);
      });
    };
    load();
    const id = window.setInterval(load, 20_000);
    const back = () => document.visibilityState === "visible" && load();
    document.addEventListener("visibilitychange", back);
    window.addEventListener("focus", back);
    return () => {
      dead = true;
      window.clearInterval(id);
      document.removeEventListener("visibilitychange", back);
      window.removeEventListener("focus", back);
    };
  }, [scopeKey]);

  const f = useMemo(() => formats(locale), [locale]);
  const regions = useMemo(() => {
    try {
      return new Intl.DisplayNames([locale], { type: "region" });
    } catch {
      return null;
    }
  }, [locale]);
  const country = (code: string) => {
    if (!code) return s.unknown;
    try {
      return regions?.of(code) ?? code;
    } catch {
      return code;
    }
  };
  const device = (d: string) => s.deviceNames[d as keyof typeof s.deviceNames] ?? (d || s.unknown);
  const language = (l: string) => s.langNames[l as keyof typeof s.langNames] ?? l;
  const source = (k: string) => (k ? sourceName(k) : s.direct);
  const labelOf: Record<StatsDim, (k: string) => string> = {
    path: (k) => k,
    ref: source,
    country,
    device,
    browser: (k) => k || s.unknown,
    os: (k) => k || s.unknown,
    lang: language,
  };

  const pick = (dim: StatsDim) => (key: string) => setFilter((cur) => norm(cur[dim] === key ? { ...cur, [dim]: undefined } : { ...cur, [dim]: key }));
  const unpick = (dim: StatsDim) => setFilter((cur) => norm({ ...cur, [dim]: undefined }));

  const stale = !!stats && !sameScope(stats, { range, filter });
  // (the figures and the moment they came in arrive together)
  const points = useMemo(() => (stats ? pointsOf(stats, locale, updated ? toulouseHour(updated) : 23) : []), [stats, locale, updated]);
  const filtered = DIMS.filter((d) => filter[d] != null);

  const delta = (m: Metric) => {
    if (!stats) return null;
    const now = valueOf(stats.totals, m);
    const before = valueOf(stats.previous, m);
    if (!stats.previous.visits) return now ? { text: s.newPeriod, dir: "flat" as const } : null;
    const diff = m === "bounce" ? Math.round((now - before) * 100) : before ? Math.round(((now - before) / before) * 100) : 0;
    const dir = diff > 0 ? ("up" as const) : diff < 0 ? ("down" as const) : ("flat" as const);
    const n = `${diff > 0 ? "+" : ""}${diff}`;
    const amount = m === "bounce" ? fill(s.points, { n }) : lang === "fr" ? `${n}\u202f%` : `${n}%`;
    return { text: amount, dir, good: dir === "flat" ? undefined : (dir === "up") === upIsGood(m) };
  };

  const metricName: Record<Metric, string> = { visitors: s.visitors, views: s.views, perVisit: s.perVisit, bounce: s.bounce, length: s.length };
  const chartTitle = fill(stats?.range === 1 ? s.per.hour : stats?.range === 365 ? s.per.week : s.per.day, { metric: metricName[metric] });
  const empty = !!stats && stats.totals.views === 0;
  const longDate = new Intl.DateTimeFormat(locale, { dateStyle: "long", timeZone: "UTC" });
  const clock = new Intl.DateTimeFormat(locale, { hour: "2-digit", minute: "2-digit" });

  const pageRows = stats ? stats[pageTab] : [];
  const techRows = stats ? stats[techTab] : [];
  const techDim: Record<typeof techTab, StatsDim> = { devices: "device", browsers: "browser", systems: "os", languages: "lang" };

  return (
    <Section title={s.title} lede={s.lede}>
      <div className="st" data-stale={stale || undefined}>
        <div className="st-bar">
          <Segmented
            label={s.rangeLabel}
            value={String(range)}
            onChange={(v) => setRange(Number(v) as StatsRange)}
            options={RANGES.map((r) => ({ value: String(r), label: s.ranges[String(r) as keyof typeof s.ranges] }))}
          />
          {filtered.length > 0 && (
            <div className="st-chips" aria-label={s.filtered}>
              {filtered.map((d) => (
                <button key={d} type="button" className="st-chip" onClick={() => unpick(d)} aria-label={fill(s.clearOne, { what: `${s.dims[d]} ${labelOf[d](filter[d]!)}` })}>
                  <span className="st-chip-dim">{s.dims[d]}</span>
                  <span className="st-chip-val">{labelOf[d](filter[d]!)}</span>
                  <svg viewBox="0 0 12 12" aria-hidden>
                    <path d="M3 3l6 6M9 3l-6 6" />
                  </svg>
                </button>
              ))}
              {filtered.length > 1 && (
                <button type="button" className="st-chip-clear" onClick={() => setFilter({})}>
                  {s.clear}
                </button>
              )}
            </div>
          )}
          {stats && (
            <p className="st-bar-live" aria-live="polite">
              {stats.live ? (stats.live === 1 ? s.liveOne : fill(s.liveCount, { n: stats.live })) : s.liveNone}
            </p>
          )}
        </div>

        {!stats ? (
          <p className="st-empty st-loading">{failed ? t.admin.common.offline : s.loading}</p>
        ) : (
          <>
            <section className="st-card st-main" aria-label={chartTitle}>
              <div className="st-kpis" role="tablist" aria-label={s.metricsLabel}>
                {METRICS.map((m) => {
                  const dl = delta(m);
                  return (
                    <button key={m} type="button" role="tab" aria-selected={metric === m} className="st-kpi" onClick={() => setMetric(m)} title={s.metricHints[m]}>
                      <span className="st-kpi-label">{metricName[m]}</span>
                      <span className="st-kpi-value">{f.metric(m, valueOf(stats.totals, m))}</span>
                      <span className="st-kpi-delta" data-dir={dl?.dir} data-good={dl?.good === undefined ? undefined : dl.good ? "1" : "0"}>
                        {dl ? (
                          <>
                            {dl.dir !== "flat" && <span aria-hidden>{dl.dir === "up" ? "↑" : "↓"}</span>}
                            {dl.text}
                          </>
                        ) : (
                          " "
                        )}
                      </span>
                      <Spark values={points.filter((p) => !p.future).map((p) => valueOf(p.cur, m))} on={metric === m} />
                    </button>
                  );
                })}
              </div>
              {stats.previous.visits > 0 && <p className="st-kpis-note">{s.vsPrevious[String(stats.range) as keyof typeof s.vsPrevious]}</p>}
              <div className="st-main-chart" role="tabpanel">
                <p className="st-title">{chartTitle}</p>
                {empty ? (
                  <p className="st-empty">{s.empty}</p>
                ) : (
                  <Trend points={points} metric={metric} f={f} s={{ thisPeriod: s.thisPeriod, previousPeriod: s.previousPeriod, table: s.table, when: stats.range === 1 ? s.hour : stats.range === 365 ? s.week : s.day }} />
                )}
              </div>
            </section>

            {!empty && (
              <>
                <div className="st-row st-row-map">
                  <section className="st-card st-mapcard" aria-labelledby="st-map-t">
                    <header className="st-head">
                      <p id="st-map-t" className="st-title">
                        {s.map}
                      </p>
                      <p className="st-sub">{s.mapHint}</p>
                    </header>
                    {stats.countries.length ? (
                      <>
                        <WorldMap
                          rows={stats.countries}
                          name={country}
                          fmt={f.count}
                          s={{ tipVisitors: s.tipVisitors, tipVisitorsOne: s.tipVisitorsOne, tipViews: s.tipViews, showOnly: s.showOnly }}
                          active={filter.country}
                          onPick={pick("country")}
                        />
                        <div className="st-mapranks">
                          <Ranked rows={stats.countries.slice(0, 3)} label={country} fmt={f.count} active={filter.country} onPick={pick("country")} head={s.visitors} title={s.countries} max={stats.countries[0]?.visitors} />
                          <Ranked rows={stats.countries.slice(3, 6)} label={country} fmt={f.count} active={filter.country} onPick={pick("country")} head={s.visitors} title={s.countries} max={stats.countries[0]?.visitors} />
                        </div>
                      </>
                    ) : (
                      <p className="st-empty">{s.mapNone}</p>
                    )}
                  </section>
                  <section className="st-card st-livecard" aria-labelledby="st-live-t">
                    <p id="st-live-t" className="st-title">
                      {s.live}
                    </p>
                    <Live live={stats.live} recent={stats.recent} now={updated} country={country} device={device} s={s} />
                  </section>
                </div>

                <div className="st-row">
                  <section className="st-card" aria-labelledby="st-src-t">
                    <header className="st-head">
                      <p id="st-src-t" className="st-title">
                        {s.sources}
                      </p>
                    </header>
                    <Ranked
                      rows={stats.referrers}
                      label={source}
                      hint={(k) => (k ? k : s.directHint)}
                      fmt={f.count}
                      kind="source"
                      active={filter.ref}
                      onPick={pick("ref")}
                      head={s.visitors}
                      title={s.sources}
                    />
                  </section>
                  <section className="st-card" aria-labelledby="st-pages-t">
                    <header className="st-head">
                      <p id="st-pages-t" className="st-title">
                        {s.pages}
                      </p>
                      <Tabs
                        label={s.pages}
                        value={pageTab}
                        onChange={setPageTab}
                        options={(["pages", "entries", "exits"] as const).map((v) => ({ value: v, label: s.pageTabs[v] }))}
                      />
                    </header>
                    <Ranked rows={pageRows} label={(k) => k} fmt={f.count} kind="page" active={filter.path} onPick={pick("path")} head={pageTab === "pages" ? s.visitors : s.visits} title={s.pageTabs[pageTab]} />
                  </section>
                </div>

                <div className="st-row">
                  <section className="st-card" aria-labelledby="st-tech-t">
                    <header className="st-head">
                      <p id="st-tech-t" className="st-title">
                        {s.tech}
                      </p>
                      <Tabs
                        label={s.tech}
                        value={techTab}
                        onChange={setTechTab}
                        options={(["devices", "browsers", "systems", "languages"] as const).map((v) => ({ value: v, label: s.techTabs[v] }))}
                      />
                    </header>
                    <Ranked
                      rows={techRows}
                      label={labelOf[techDim[techTab]]}
                      fmt={f.count}
                      active={filter[techDim[techTab]]}
                      onPick={pick(techDim[techTab])}
                      head={s.visitors}
                      title={s.techTabs[techTab]}
                    />
                  </section>
                  {stats.range > 1 && (
                    <section className="st-card" aria-labelledby="st-when-t">
                      <header className="st-head">
                        <p id="st-when-t" className="st-title">
                          {s.when}
                        </p>
                        <p className="st-sub">{s.whenHint}</p>
                      </header>
                      <WeekGrid week={stats.week} fmt={f.count} s={s} />
                    </section>
                  )}
                </div>
              </>
            )}

            <footer className="st-foot">
              <p>{optedOut ? `${s.notCountedHere} ${s.notCounted}` : s.notCounted}</p>
              <p>
                {stats.since && <span>{fill(s.since, { date: longDate.format(new Date(`${stats.since}T12:00:00Z`)) })}</span>}
                {updated > 0 && <span>{fill(s.updated, { time: clock.format(updated) })}</span>}
              </p>
            </footer>
          </>
        )}
      </div>
    </Section>
  );
}
