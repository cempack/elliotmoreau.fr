"use client";

import { useEffect, useId, useMemo, useState } from "react";
import { useI18n } from "@/i18n/client";
import { rpc, type Stats, type StatsRange, type StatsRow } from "../api";
import { Segmented, fill } from "../ui";

const RANGES: StatsRange[] = [1, 7, 30, 90, 365];

/** "FR" → "France" in the panel's language (null where the browser can't) */
function regionNames(locale: string) {
  try {
    return new Intl.DisplayNames([locale], { type: "region" });
  } catch {
    return null;
  }
}

type Point = { key: string; label: string; visitors: number; views: number };

/** 0, 5, 10… a tick step that lands on round numbers */
function niceStep(max: number) {
  if (max <= 4) return 1;
  const raw = max / 3;
  const pow = 10 ** Math.floor(Math.log10(raw));
  const n = raw / pow;
  return (n <= 1 ? 1 : n <= 2 ? 2 : n <= 5 ? 5 : 10) * pow;
}

/**
 * The visitors, at a glance: a period picker, four figures (visitors, page
 * views, pages per visit, who's here right now), visitors over the period
 * as columns (one series, the theme's accent; hover or arrow keys for the
 * day's numbers, and a table for screen readers), then where they come
 * from and what they read, as ranked lists.
 */
export function StatsView() {
  const { t, lang } = useI18n();
  const s = t.admin.stats;
  const locale = lang === "fr" ? "fr-FR" : "en-GB";
  const [range, setRange] = useState<StatsRange>(30);
  const [stats, setStats] = useState<Stats | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let dead = false;
    rpc<{ stats: Stats }>("stats", { range }).then((r) => {
      if (dead) return;
      if (r.ok) {
        setStats(r.stats);
        setFailed(false);
      } else setFailed(true);
    });
    return () => {
      dead = true;
    };
  }, [range]);

  // refetching keeps the last picture, dimmed
  const stale = !!stats && stats.range !== range;
  const num = useMemo(() => new Intl.NumberFormat(locale, { maximumFractionDigits: 1 }), [locale]);
  const compact = useMemo(() => new Intl.NumberFormat(locale, { notation: "compact", maximumFractionDigits: 1 }), [locale]);
  const fmt = (n: number) => (n >= 10_000 ? compact.format(n) : num.format(n));

  const points: Point[] = useMemo(() => {
    if (!stats) return [];
    if (stats.range === 1 && stats.hours) return stats.hours.map((h) => ({ key: `h${h.hour}`, label: `${String(h.hour).padStart(2, "0")}:00`, visitors: h.visitors, views: h.views }));
    const day = new Intl.DateTimeFormat(locale, { day: "numeric", month: "short", timeZone: "UTC" });
    const rows = stats.days.map((d) => ({ key: d.day, label: day.format(new Date(`${d.day}T12:00:00Z`)), visitors: d.visitors, views: d.views }));
    if (stats.range !== 365) return rows;
    // a year: one column per week
    const weeks: Point[] = [];
    for (let i = 0; i < rows.length; i += 7) {
      const w = rows.slice(i, i + 7);
      const at = (k: string) => new Date(`${k}T12:00:00Z`);
      weeks.push({
        key: w[0].key,
        label: day.formatRange(at(w[0].key), at(w[w.length - 1].key)),
        visitors: w.reduce((a, b) => a + b.visitors, 0),
        views: w.reduce((a, b) => a + b.views, 0),
      });
    }
    return weeks;
  }, [stats, locale]);

  const delta = (now: number, before: number) => {
    if (!stats) return "";
    const period = s.vsPrevious[String(stats.range) as keyof typeof s.vsPrevious];
    if (!before) return now ? `${s.newPeriod}` : "";
    const pct = Math.round(((now - before) / before) * 100);
    return `${pct > 0 ? "+" : ""}${pct}% ${period}`;
  };

  const regions = useMemo(() => regionNames(locale), [locale]);
  const country = (code: string) => {
    try {
      return regions?.of(code) ?? code;
    } catch {
      return code;
    }
  };

  const label = {
    pages: (k: string) => k,
    referrers: (k: string) => k || s.direct,
    countries: (k: string) => (k ? country(k) : s.unknown),
    devices: (k: string) => s.deviceNames[k as keyof typeof s.deviceNames] ?? (k || s.unknown),
    browsers: (k: string) => k || s.unknown,
    systems: (k: string) => k || s.unknown,
    languages: (k: string) => s.langNames[k as keyof typeof s.langNames] ?? k,
  };

  const empty = !!stats && stats.totals.views === 0;
  const chartTitle = stats?.range === 1 ? s.chartHours : stats?.range === 365 ? s.chartWeeks : s.chartDays;

  return (
    <section className="app-admin-stats" aria-labelledby="app-admin-stats-title" data-stale={stale || undefined}>
      <header className="app-admin-stats-head">
        <div>
          <h3 id="app-admin-stats-title" className="app-admin-h3">
            {s.title}
          </h3>
          <p className="app-admin-hint">{s.lede}</p>
        </div>
        <Segmented
          label={s.rangeLabel}
          value={String(range)}
          onChange={(v) => setRange(Number(v) as StatsRange)}
          options={RANGES.map((r) => ({ value: String(r), label: s.ranges[String(r) as keyof typeof s.ranges] }))}
        />
      </header>

      {!stats ? (
        <p className="app-admin-empty">{failed ? t.admin.common.offline : s.loading}</p>
      ) : (
        <>
          <div className="app-admin-tiles">
            <Tile label={s.visitors} value={fmt(stats.totals.visitors)} note={delta(stats.totals.visitors, stats.previous.visitors)} />
            <Tile label={s.views} value={fmt(stats.totals.views)} note={delta(stats.totals.views, stats.previous.views)} />
            <Tile label={s.perVisit} value={num.format(stats.totals.pagesPerVisit)} />
            <Tile label={s.live} value={fmt(stats.live)} note={s.liveHint} />
          </div>

          <div className="app-admin-card app-admin-chart-card">
            <p className="app-admin-card-title">{chartTitle}</p>
            {empty ? <p className="app-admin-empty">{s.empty}</p> : <Columns points={points} fmt={fmt} s={s} />}
            {stats.since && (
              <p className="app-admin-hint">
                {fill(s.since, { date: new Intl.DateTimeFormat(locale, { dateStyle: "long", timeZone: "UTC" }).format(new Date(`${stats.since}T12:00:00Z`)) })}
              </p>
            )}
          </div>

          {!empty && (
            <div className="app-admin-ranks">
              <Ranked title={s.pages} rows={stats.pages} label={label.pages} fmt={fmt} head={s.visitors} mono />
              <Ranked title={s.referrers} rows={stats.referrers} label={label.referrers} fmt={fmt} head={s.visitors} />
              <Ranked title={s.countries} rows={stats.countries} label={label.countries} fmt={fmt} head={s.visitors} />
              <Ranked title={s.devices} rows={stats.devices} label={label.devices} fmt={fmt} head={s.visitors} />
              <Ranked title={s.browsers} rows={stats.browsers} label={label.browsers} fmt={fmt} head={s.visitors} />
              <Ranked title={s.systems} rows={stats.systems} label={label.systems} fmt={fmt} head={s.visitors} />
              <Ranked title={s.languages} rows={stats.languages} label={label.languages} fmt={fmt} head={s.visitors} />
            </div>
          )}
        </>
      )}
    </section>
  );
}

function Tile({ label, value, note }: { label: string; value: string; note?: string }) {
  return (
    <div className="app-admin-tile">
      <span className="app-admin-tile-label">{label}</span>
      <span className="app-admin-tile-value">{value}</span>
      {note ? <span className="app-admin-tile-note">{note}</span> : <span className="app-admin-tile-note" aria-hidden />}
    </div>
  );
}

type StatsStrings = ReturnType<typeof useI18n>["t"]["admin"]["stats"];

/** One series as columns: the accent, 4px rounded tops on a shared baseline, at most 24px wide. */
function Columns({ points, fmt, s }: { points: Point[]; fmt: (n: number) => string; s: StatsStrings }) {
  const id = useId();
  const [hover, setHover] = useState<number | null>(null);
  const W = 720;
  const H = 200;
  const padL = 34;
  const padB = 22;
  const padT = 8;
  const plotW = W - padL;
  const plotH = H - padB - padT;
  const max = Math.max(1, ...points.map((p) => p.visitors));
  const step = niceStep(max);
  const top = Math.ceil(max / step) * step;
  const ticks: number[] = [];
  for (let v = 0; v <= top; v += step) ticks.push(v);
  const band = plotW / Math.max(1, points.length);
  const bw = Math.max(1, Math.min(24, band - 2));
  const y = (v: number) => padT + plotH - (v / top) * plotH;
  const tip = hover != null ? points[hover] : null;
  // a few dates under the axis: first, middle, last
  const labelled = new Set([0, Math.floor((points.length - 1) / 2), points.length - 1]);

  const bar = (x: number, h: number) => {
    const r = Math.min(4, bw / 2, h);
    const b = padT + plotH;
    const t0 = b - h;
    return `M${x} ${b}V${t0 + r}Q${x} ${t0} ${x + r} ${t0}H${x + bw - r}Q${x + bw} ${t0} ${x + bw} ${t0 + r}V${b}Z`;
  };

  return (
    <div
      className="app-admin-chart"
      tabIndex={0}
      role="group"
      aria-label={s.table}
      aria-describedby={`${id}-table`}
      onKeyDown={(e) => {
        if (e.key !== "ArrowLeft" && e.key !== "ArrowRight") return;
        e.preventDefault();
        setHover((h) => Math.max(0, Math.min(points.length - 1, (h ?? (e.key === "ArrowLeft" ? points.length : -1)) + (e.key === "ArrowLeft" ? -1 : 1))));
      }}
      onBlur={() => setHover(null)}
      onPointerLeave={() => setHover(null)}
    >
      <svg viewBox={`0 0 ${W} ${H}`} className="app-admin-chart-svg" aria-hidden>
        {ticks.map((v) => (
          <g key={v}>
            <line x1={padL} x2={W} y1={y(v)} y2={y(v)} className="app-admin-chart-grid" />
            <text x={padL - 8} y={y(v)} className="app-admin-chart-tick" textAnchor="end" dominantBaseline="middle">
              {fmt(v)}
            </text>
          </g>
        ))}
        {points.map((p, i) => {
          const x = padL + i * band + (band - bw) / 2;
          const h = (p.visitors / top) * plotH;
          return (
            <g key={p.key}>
              {h > 0 && <path d={bar(x, Math.max(1, h))} className="app-admin-chart-bar" data-on={hover === i || undefined} />}
              {/* the hit area is the whole column, not the painted bar */}
              <rect x={padL + i * band} y={padT} width={band} height={plotH} className="app-admin-chart-hit" onPointerEnter={() => setHover(i)} />
              {labelled.has(i) && (
                <text x={padL + i * band + band / 2} y={H - 6} className="app-admin-chart-tick" textAnchor={i === 0 ? "start" : i === points.length - 1 ? "end" : "middle"}>
                  {p.label}
                </text>
              )}
            </g>
          );
        })}
      </svg>
      {tip && hover != null && (
        <div
          className="app-admin-chart-tip"
          style={{ left: `${((padL + hover * band + band / 2) / W) * 100}%`, top: `${(y(tip.visitors) / H) * 100}%` }}
          role="status"
        >
          <strong>{tip.visitors === 1 ? s.tipVisitorsOne : fill(s.tipVisitors, { n: fmt(tip.visitors) })}</strong>
          <span>{fill(s.tipViews, { n: fmt(tip.views) })}</span>
          <span className="app-admin-chart-tip-day">{tip.label}</span>
        </div>
      )}
      <table id={`${id}-table`} className="sr-only">
        <caption>{s.table}</caption>
        <thead>
          <tr>
            <th scope="col">{s.day}</th>
            <th scope="col">{s.visitors}</th>
            <th scope="col">{s.views}</th>
          </tr>
        </thead>
        <tbody>
          {points.map((p) => (
            <tr key={p.key}>
              <th scope="row">{p.label}</th>
              <td>{p.visitors}</td>
              <td>{p.views}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/** a ranked list: the label, a wash bar for its share of the top row, and the count */
function Ranked({
  title,
  rows,
  label,
  fmt,
  head,
  mono,
}: {
  title: string;
  rows: StatsRow[];
  label: (k: string) => string;
  fmt: (n: number) => string;
  head: string;
  mono?: boolean;
}) {
  const id = useId();
  if (!rows.length) return null;
  const max = Math.max(1, ...rows.map((r) => r.visitors));
  return (
    <div className="app-admin-card app-admin-rank">
      <table className="app-admin-rank-table" aria-labelledby={`${id}-t`}>
        <caption id={`${id}-t`} className="app-admin-card-title">
          {title}
        </caption>
        <thead className="sr-only">
          <tr>
            <th scope="col">{title}</th>
            <th scope="col">{head}</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.key || "_"} style={{ "--w": `${(r.visitors / max) * 100}%` } as React.CSSProperties} title={`${label(r.key)}: ${r.visitors} · ${r.views}`}>
              <th scope="row" className="app-admin-rank-label" data-mono={mono || undefined}>
                {label(r.key)}
              </th>
              <td className="app-admin-rank-value">{fmt(r.visitors)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
