"use client";

import { useEffect, useId, useRef, useState } from "react";
import { ticks, valueOf, type Formats, type Metric, type Point } from "./data";

type Strings = { thisPeriod: string; previousPeriod: string; table: string; when: string };

const H = 232;
const PAD = { top: 14, right: 12, bottom: 26, left: 44 };

/** the card's width, kept in step with it */
function useWidth() {
  const ref = useRef<HTMLDivElement>(null);
  const [w, setW] = useState(0);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const ro = new ResizeObserver(([e]) => setW(Math.round(e.contentRect.width)));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  return [ref, w] as const;
}

/**
 * The picked figure over the period: this period as a 2px line over a
 * wash of the accent, the period before as a gray line behind it (when
 * there was one). A crosshair finds the nearest moment under the pointer
 * (or the arrow keys), and one readout gives both periods' values there.
 * Hours still to come today aren't drawn. The same figures as a table for
 * screen readers.
 */
export function Trend({ points, metric, f, s }: { points: Point[]; metric: Metric; f: Formats; s: Strings }) {
  const id = useId();
  const [ref, width] = useWidth();
  const [at, setAt] = useState<number | null>(null);
  const n = points.length;
  const cur = points.map((p) => valueOf(p.cur, metric));
  const prev = points.map((p) => (p.prev ? valueOf(p.prev, metric) : 0));
  const hasPrev = points.some((p) => p.prev && p.prev.visits > 0);
  const lastNow = (() => {
    let i = n - 1;
    while (i > 0 && points[i].future) i--;
    return i;
  })();
  const max = Math.max(0, ...cur.slice(0, lastNow + 1), ...(hasPrev ? prev : []));
  const tk = ticks(max, metric);
  const top = tk[tk.length - 1] || 1;
  const W = Math.max(280, width);
  const plotW = W - PAD.left - PAD.right;
  const plotH = H - PAD.top - PAD.bottom;
  const x = (i: number) => PAD.left + (n <= 1 ? plotW / 2 : (i / (n - 1)) * plotW);
  const y = (v: number) => PAD.top + plotH - (Math.min(v, top) / top) * plotH;
  const line = (vs: number[], upTo: number) => vs.slice(0, upTo + 1).map((v, i) => `${i ? "L" : "M"}${x(i).toFixed(1)} ${y(v).toFixed(1)}`).join("");
  const curLine = line(cur, lastNow);
  const area = `${curLine}L${x(lastNow).toFixed(1)} ${y(0)}L${x(0).toFixed(1)} ${y(0)}Z`;
  // dates under the axis: the first, the middle, the last
  const labelled = n > 2 ? [0, Math.floor((n - 1) / 2), n - 1] : points.map((_, i) => i);

  const pick = (clientX: number, el: Element) => {
    const r = el.getBoundingClientRect();
    const px = ((clientX - r.left) / r.width) * W;
    const i = Math.round(((px - PAD.left) / plotW) * (n - 1));
    setAt(Math.max(0, Math.min(lastNow, i)));
  };
  const tip = at != null ? points[at] : null;
  const tipLeft = at != null ? (x(at) / W) * 100 : 0;

  return (
    <div ref={ref} className="st-trend">
      {hasPrev && (
        <ul className="st-legend" aria-hidden>
          <li>
            <i className="st-key" data-series="cur" />
            {s.thisPeriod}
          </li>
          <li>
            <i className="st-key" data-series="prev" />
            {s.previousPeriod}
          </li>
        </ul>
      )}
      <div
        className="st-trend-plot"
        tabIndex={0}
        role="img"
        aria-label={s.table}
        aria-describedby={`${id}-t`}
        onPointerMove={(e) => pick(e.clientX, e.currentTarget)}
        onPointerDown={(e) => pick(e.clientX, e.currentTarget)}
        onPointerLeave={() => setAt(null)}
        onBlur={() => setAt(null)}
        onKeyDown={(e) => {
          if (e.key !== "ArrowLeft" && e.key !== "ArrowRight" && e.key !== "Home" && e.key !== "End") return;
          e.preventDefault();
          setAt((a) => {
            if (e.key === "Home") return 0;
            if (e.key === "End") return lastNow;
            const from = a ?? (e.key === "ArrowLeft" ? lastNow + 1 : -1);
            return Math.max(0, Math.min(lastNow, from + (e.key === "ArrowLeft" ? -1 : 1)));
          });
        }}
      >
        {width > 0 && (
          <svg width={W} height={H} viewBox={`0 0 ${W} ${H}`} aria-hidden>
            {tk.map((v) => (
              <g key={v}>
                <line x1={PAD.left} x2={W - PAD.right} y1={y(v)} y2={y(v)} className="st-grid" />
                <text x={PAD.left - 10} y={y(v)} className="st-tick" textAnchor="end" dominantBaseline="middle">
                  {f.tick(metric, v)}
                </text>
              </g>
            ))}
            {labelled.map((i) => (
              <text key={points[i].key} x={x(i)} y={H - 6} className="st-tick" textAnchor={i === 0 && n > 1 ? "start" : i === n - 1 && n > 1 ? "end" : "middle"}>
                {points[i].label}
              </text>
            ))}
            <defs>
              <linearGradient id={`${id}-wash`} x1="0" x2="0" y1="0" y2="1">
                <stop offset="0" className="st-wash-top" />
                <stop offset="1" className="st-wash-bottom" />
              </linearGradient>
            </defs>
            {hasPrev && <path d={line(prev, n - 1)} className="st-line" data-series="prev" />}
            <path d={area} className="st-area" fill={`url(#${id}-wash)`} />
            <path d={curLine} className="st-line" data-series="cur" />
            {/* the latest point, marked */}
            <circle cx={x(lastNow)} cy={y(cur[lastNow])} r={4} className="st-dot" data-series="cur" />
            {at != null && (
              <g>
                <line x1={x(at)} x2={x(at)} y1={PAD.top} y2={PAD.top + plotH} className="st-cross" />
                {hasPrev && <circle cx={x(at)} cy={y(prev[at])} r={4} className="st-dot" data-series="prev" />}
                <circle cx={x(at)} cy={y(cur[at])} r={4.5} className="st-dot" data-series="cur" />
              </g>
            )}
          </svg>
        )}
        {tip && (
          <div className="st-tip" role="status" style={{ left: `${tipLeft}%`, top: `${PAD.top}px` }} data-side={tipLeft > 70 ? "left" : tipLeft < 30 ? "right" : undefined}>
            <span className="st-tip-when">{tip.long}</span>
            <span className="st-tip-row">
              <i className="st-key" data-series="cur" />
              <strong>{f.metric(metric, cur[at!])}</strong>
            </span>
            {hasPrev && (
              <span className="st-tip-row">
                <i className="st-key" data-series="prev" />
                <span>{f.metric(metric, prev[at!])}</span>
              </span>
            )}
          </div>
        )}
      </div>
      <table id={`${id}-t`} className="sr-only">
        <caption>{s.table}</caption>
        <thead>
          <tr>
            <th scope="col">{s.when}</th>
            <th scope="col">{s.thisPeriod}</th>
            {hasPrev && <th scope="col">{s.previousPeriod}</th>}
          </tr>
        </thead>
        <tbody>
          {points.slice(0, lastNow + 1).map((p, i) => (
            <tr key={p.key}>
              <th scope="row">{p.long}</th>
              <td>{f.metric(metric, cur[i])}</td>
              {hasPrev && <td>{f.metric(metric, prev[i])}</td>}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/** a figure's shape over the period: a small line, no axis */
export function Spark({ values, on, w = 96, h = 26 }: { values: number[]; on?: boolean; w?: number; h?: number }) {
  const max = Math.max(...values, 0) || 1;
  const d = values.map((v, i) => `${i ? "L" : "M"}${((i / Math.max(1, values.length - 1)) * (w - 4) + 2).toFixed(1)} ${(h - 3 - (v / max) * (h - 6)).toFixed(1)}`).join("");
  return (
    <svg className="st-spark" width={w} height={h} viewBox={`0 0 ${w} ${h}`} aria-hidden data-on={on || undefined}>
      <path d={d} />
    </svg>
  );
}
