"use client";

import { useId, useState } from "react";
import type { StatsRecent, StatsRow } from "../api";
import { sourceHost, sourceName } from "./data";

/* ───────────── when they come: weekday × hour ───────────── */

type WeekStrings = { weekdays: string[]; weekdaysLong: string[]; fewer: string; more: string; tipVisitors: string; tipVisitorsOne: string; table: string; hour: string };

/** five steps of the accent, from a faint wash to full; an empty hour stays the card's own tone */
const STEPS = 5;
const step = (v: number, max: number) => (v <= 0 ? 0 : Math.max(1, Math.ceil((v / max) * STEPS)));

/**
 * Visitors by weekday and hour (Toulouse time) as a grid of cells, darker
 * where more came: the busy hours at a glance. Each cell gives its figure
 * on hover; the grid is also a table for screen readers.
 */
export function WeekGrid({ week, fmt, s }: { week: number[]; fmt: (n: number) => string; s: WeekStrings }) {
  const id = useId();
  const [hover, setHover] = useState<number | null>(null);
  const max = Math.max(1, ...week);
  const hm = (h: number) => `${String(h).padStart(2, "0")}:00`;
  const tip = hover != null ? { day: s.weekdaysLong[Math.floor(hover / 24)], hour: hover % 24, v: week[hover] } : null;
  return (
    <div className="st-week">
      <div className="st-week-grid" role="img" aria-describedby={`${id}-t`} onPointerLeave={() => setHover(null)}>
        {s.weekdays.map((d, r) => (
          <div key={d} className="st-week-row">
            <span className="st-week-day">{d}</span>
            {Array.from({ length: 24 }, (_, h) => {
              const i = r * 24 + h;
              return <span key={h} className="st-week-cell" data-step={step(week[i], max)} data-on={hover === i || undefined} onPointerEnter={() => setHover(i)} />;
            })}
          </div>
        ))}
        <div className="st-week-row st-week-hours" aria-hidden>
          <span className="st-week-day" />
          {Array.from({ length: 24 }, (_, h) => (
            <span key={h} className="st-week-hour">
              {h % 6 === 0 ? String(h).padStart(2, "0") : ""}
            </span>
          ))}
        </div>
      </div>
      <div className="st-week-foot">
        <span className="st-week-legend" aria-hidden>
          {s.fewer}
          {Array.from({ length: STEPS }, (_, k) => (
            <span key={k} className="st-week-cell" data-step={k + 1} />
          ))}
          {s.more}
        </span>
        <span className="st-week-read" aria-live="polite">
          {tip ? `${tip.day}, ${hm(tip.hour)}–${hm((tip.hour + 1) % 24)} · ${tip.v === 1 ? s.tipVisitorsOne : s.tipVisitors.replace("{n}", fmt(tip.v))}` : " "}
        </span>
      </div>
      <table id={`${id}-t`} className="sr-only">
        <caption>{s.table}</caption>
        <thead>
          <tr>
            <th scope="col">{s.hour}</th>
            {s.weekdaysLong.map((d) => (
              <th key={d} scope="col">
                {d}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {Array.from({ length: 24 }, (_, h) => (
            <tr key={h}>
              <th scope="row">{hm(h)}</th>
              {s.weekdaysLong.map((d, r) => (
                <td key={d}>{week[r * 24 + h]}</td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/* ───────────── ranked lists ───────────── */

/** a source's little icon: its site's own (through the panel's icon route), or a glyph for Direct and the unknown */
export function SourceIcon({ source }: { source: string }) {
  const host = sourceHost(source);
  const [broken, setBroken] = useState(false);
  if (!host || broken)
    return (
      <svg className="st-icon st-icon-glyph" viewBox="0 0 16 16" aria-hidden>
        {source ? (
          // a link
          <path d="M6.5 9.5l3-3M7 4.5l1.2-1.2a2.5 2.5 0 013.5 3.5L10.5 8M9 11.5l-1.2 1.2a2.5 2.5 0 01-3.5-3.5L5.5 8" />
        ) : (
          // straight in: an arrow
          <path d="M3 8h9M8.5 4.5L12 8l-3.5 3.5" />
        )}
      </svg>
    );
  // eslint-disable-next-line @next/next/no-img-element
  return <img className="st-icon" src={`/api/admin/icon?host=${encodeURIComponent(host)}`} alt="" width={16} height={16} loading="lazy" onError={() => setBroken(true)} />;
}

export type RankKind = "page" | "source" | "plain";

/**
 * A ranked list: each row its label, a wash for its share of the first
 * row, and its count. Rows are buttons: one shows only that page, source,
 * country…; the row that's already the filter is marked and lifts it.
 */
export function Ranked({
  rows,
  label,
  fmt,
  kind = "plain",
  active,
  onPick,
  head,
  title,
  hint,
  limit = 9,
  max: top,
}: {
  rows: StatsRow[];
  label: (key: string) => string;
  fmt: (n: number) => string;
  kind?: RankKind;
  active?: string;
  onPick?: (key: string) => void;
  head: string;
  title: string;
  hint?: (key: string) => string | undefined;
  limit?: number;
  /** the share's 100 % (a list split in two keeps the first one's) */
  max?: number;
}) {
  const max = Math.max(1, top ?? 0, ...rows.map((r) => r.visitors));
  return (
    <table className="st-rank" data-kind={kind}>
      <caption className="sr-only">{title}</caption>
      <thead className="sr-only">
        <tr>
          <th scope="col">{title}</th>
          <th scope="col">{head}</th>
        </tr>
      </thead>
      <tbody>
        {rows.slice(0, limit).map((r) => (
          <tr key={r.key || "_"} style={{ "--w": `${Math.max(2, (r.visitors / max) * 100)}%` } as React.CSSProperties} data-on={active === r.key || undefined}>
            <th scope="row">
              <button type="button" className="st-rank-btn" onClick={() => onPick?.(r.key)} title={hint?.(r.key)} aria-pressed={active === r.key}>
                {kind === "source" && <SourceIcon source={r.key} />}
                <span className="st-rank-label">{label(r.key)}</span>
              </button>
            </th>
            <td className="st-rank-n">{fmt(r.visitors)}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

/** text tabs over a card's list */
export function Tabs<T extends string>({ value, onChange, options, label }: { value: T; onChange: (v: T) => void; options: { value: T; label: string }[]; label: string }) {
  return (
    <div className="st-tabs" role="tablist" aria-label={label}>
      {options.map((o) => (
        <button key={o.value} type="button" role="tab" aria-selected={o.value === value} className="st-tab" onClick={() => onChange(o.value)}>
          {o.label}
        </button>
      ))}
    </div>
  );
}

/* ───────────── right now ───────────── */

type LiveStrings = { hereNow: string; liveNone: string; recent: string; recentNone: string; ago: { now: string; min: string }; from: string; direct: string };

/**
 * Who's here: how many in the last five minutes, then the last half
 * hour's pages as they were opened, newest first: when, which page, from
 * where, on what, and where that visit came from.
 */
export function Live({
  live,
  recent,
  now,
  country,
  device,
  s,
}: {
  live: number;
  recent: StatsRecent[];
  now: number;
  country: (code: string) => string;
  device: (d: string) => string;
  s: LiveStrings;
}) {
  const ago = (t: number) => {
    const m = Math.floor((now - t) / 60_000);
    return m < 1 ? s.ago.now : s.ago.min.replace("{n}", String(m));
  };
  return (
    <div className="st-live">
      <p className="st-live-count" aria-live="polite">
        {live ? (
          <>
            <strong>{live}</strong> {s.hereNow}
          </>
        ) : (
          <span className="st-live-none">{s.liveNone}</span>
        )}
      </p>
      <p className="st-sub">{s.recent}</p>
      {recent.length ? (
        <ol className="st-feed">
          {recent.slice(0, 6).map((r, i) => (
            <li key={`${r.at}-${i}`}>
              <span className="st-feed-when">{ago(r.at)}</span>
              <span className="st-feed-what">
                <span className="st-feed-path">{r.path}</span>
                <span className="st-feed-meta">
                  {[r.country ? country(r.country) : null, device(r.device), r.ref ? s.from.replace("{source}", sourceName(r.ref)) : null].filter(Boolean).join(" · ")}
                </span>
              </span>
            </li>
          ))}
        </ol>
      ) : (
        <p className="st-empty">{s.recentNone}</p>
      )}
    </div>
  );
}
