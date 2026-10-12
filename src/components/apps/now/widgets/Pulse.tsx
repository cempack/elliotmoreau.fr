"use client";

import { useEffect, useRef, useState } from "react";
import { useI18n } from "@/i18n/client";
import { timeAgo } from "@/lib/format";
import { useReduced } from "@/hooks/env";
import type { ActivityInfo, RepoInfo } from "@/lib/github";
import type { GhostPost } from "@/lib/ghost";
import { fill, useNow, useOnScreen, useTabHidden } from "../lib";
import { pxPath } from "@/lib/pxpath";

type Kind = "push" | "post";
type Ev = { id: string; t: number; kind: Kind; name: string; url: string; detail?: string };

const DAY = 86_400_000;
const SCAN_S = 6; // one sweep of the trace, seconds

/** Every real, timestamped thing we can see: the last push per repo, posts. */
function eventsFrom(repos: RepoInfo[], posts: GhostPost[], activity: ActivityInfo | null): Ev[] {
  const out: Ev[] = [];
  for (const r of repos) {
    const t = Date.parse(r.pushedAt);
    if (Number.isFinite(t)) out.push({ id: `r:${r.name}`, t, kind: "push", name: r.name, url: r.url });
  }
  if (activity) {
    const t = Date.parse(activity.createdAt);
    const same = out.find((e) => e.kind === "push" && e.name === activity.repo);
    if (same && Number.isFinite(t)) {
      same.t = Math.max(same.t, t);
      same.detail = activity.message;
      same.url = activity.repoUrl;
    } else if (Number.isFinite(t)) {
      out.push({ id: `a:${activity.repo}`, t, kind: "push", name: activity.repo, url: activity.repoUrl, detail: activity.message });
    }
  }
  for (const p of posts) {
    const t = Date.parse(p.published_at);
    if (Number.isFinite(t)) out.push({ id: `p:${p.slug}`, t, kind: "post", name: p.title, url: p.url });
  }
  return out.sort((a, b) => a.t - b.t);
}

/** EKG complex around the R peak (column offset → rows, up is negative). */
function shape(a: number): [number, number][] {
  return [
    [-8, -1], [-7, -2], [-6, -2], [-5, -1],
    [-2, 1],
    [-1, -Math.round(a * 0.42)],
    [0, -a],
    [1, -Math.round(a * 0.36)],
    [2, 3], [3, 1],
    [6, -1], [7, -2], [8, -2], [9, -2], [10, -1],
  ];
}

type Plot = {
  cols: number;
  rows: number;
  base: number;
  nowCol: number;
  runs: { x: number; y: number; w: number; h: number; owner: number }[];
  marks: { ev: Ev; col: number; f: number }[];
  ticks: { label: string; col: number }[];
};

function plot(events: Ev[], now: number, cols: number, rows: number, tickLabels: Record<string, string>): Plot {
  const base = rows - 8;
  const nowCol = cols - 6;
  const left = 10;
  const right = nowCol - 12;
  const oldest = events.length ? (now - events[0].t) / DAY : 30;
  const range = Math.min(365, Math.max(14, oldest * 1.08));
  const tau = 1.5;
  const xOf = (ageDays: number) => {
    const f = 1 - Math.log1p(Math.max(0, ageDays) / tau) / Math.log1p(range / tau);
    return Math.round(left + f * (right - left));
  };

  const off = new Float32Array(cols);
  const owner = new Int16Array(cols).fill(-1);
  const marks: Plot["marks"] = [];
  events.forEach((ev, i) => {
    const age = (now - ev.t) / DAY;
    if (age > range) return;
    const col = xOf(age);
    marks.push({ ev, col, f: col / cols });
    const amp = Math.round((ev.kind === "post" ? 0.78 : 0.6) * (base - 2));
    for (const [dx, dy] of shape(amp)) {
      const c = col + dx;
      if (c < 0 || c >= nowCol) continue;
      if (Math.abs(dy) > Math.abs(off[c])) {
        off[c] = dy;
        owner[c] = i;
      }
    }
  });

  // stepped, continuous trace as rects: vertical runs where it moves,
  // merged horizontal runs where it rests
  const runs: Plot["runs"] = [];
  let flat: { x: number; owner: number } | null = null;
  const flush = (end: number) => {
    if (flat) runs.push({ x: flat.x, y: base, w: end - flat.x, h: 1, owner: flat.owner });
    flat = null;
  };
  for (let c = 0; c <= nowCol; c++) {
    const y = base + (off[c] ?? 0);
    const py = c > 0 ? base + off[c - 1] : y;
    const o = owner[c] >= 0 ? owner[c] : c > 0 ? owner[c - 1] : -1;
    if (y === base && py === base) {
      if (!flat || flat.owner !== -1) {
        flush(c);
        flat = { x: c, owner: -1 };
      }
      continue;
    }
    flush(c);
    const top = Math.min(y, py);
    runs.push({ x: c, y: top, w: 1, h: Math.max(y, py) - top + 1, owner: o });
  }
  flush(nowCol + 1);

  const ticks: Plot["ticks"] = [];
  const marksAt: [number, string][] = [
    [1, tickLabels.day],
    [7, tickLabels.week],
    [30, tickLabels.month],
    [91, tickLabels.quarter],
    [182, tickLabels.half],
    [365, tickLabels.year],
  ];
  for (const [d, label] of marksAt) if (d <= range * 0.98) ticks.push({ label, col: xOf(d) });
  return { cols, rows, base, nowCol, runs, marks, ticks };
}

const COLOR: Record<Kind, string> = { push: "var(--color-ion)", post: "var(--color-ember)" };

/** Header legend. */
export function PulseMeta() {
  const { t } = useI18n();
  const p = t.now.pulse;
  return (
    // each word underlined in its blips' colour
    <span className="app-now-legend" aria-hidden>
      <span style={{ textDecorationColor: COLOR.push }}>{p.push}</span>
      <span style={{ textDecorationColor: COLOR.post }}>{p.post}</span>
      <span style={{ textDecorationColor: "var(--color-flare)" }}>{p.now}</span>
    </span>
  );
}

/**
 * The activity pulse: a pixel EKG where every complex is a real event
 * (the latest push to each repo, every post) on a log time axis, newest
 * on the right, beating into a live "now". A scan line sweeps it and each
 * blip flares as it passes (paused off screen, hidden, or under reduced
 * motion). Hover or focus a blip to read it out.
 */
export function Pulse({ repos, posts, activity }: { repos: RepoInfo[]; posts: GhostPost[]; activity: ActivityInfo | null }) {
  const { t, lang } = useI18n();
  const p = t.now.pulse;
  const reduced = useReduced();
  const hidden = useTabHidden();
  const wrapRef = useRef<HTMLDivElement>(null);
  const on = useOnScreen(wrapRef, "40px");
  const now = useNow(60_000);
  const [width, setWidth] = useState(0);
  const [focus, setFocus] = useState<string | null>(null);

  useEffect(() => {
    const el = wrapRef.current;
    if (!el) return;
    const ro = new ResizeObserver(([e]) => setWidth(Math.round(e.contentRect.width)));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const cell = width && width < 560 ? 2 : 3;
  const cols = width ? Math.floor(width / cell) : 0;
  // the 2-column grid gives Pulse a shorter tile than its width suggests
  const rows = cell === 2 ? 40 : width < 980 ? 24 : 30;
  const events = eventsFrom(repos, posts, activity);
  const data = now && cols > 40 ? plot(events, now.getTime(), cols, rows, p.ticks) : null;
  // axis labels that fit, placed from "now" leftward: none may touch the
  // "now" label (right-aligned on its column) or its right-hand neighbour
  // (mono 12px ≈ 7.2px a character)
  const ticks: Plot["ticks"] = [];
  if (data) {
    const ch = 7.2;
    let edge = (data.nowCol + 0.5) * cell - p.now.length * ch;
    for (const tk of [...data.ticks].sort((a, b) => b.col - a.col)) {
      const c = (tk.col + 0.5) * cell;
      const half = (tk.label.length * ch) / 2;
      if (c + half > edge - 12 || c - half < 0) continue;
      ticks.push(tk);
      edge = c - half;
    }
  }
  const latest = data?.marks[data.marks.length - 1]?.ev ?? null;
  const shown = (focus && events.find((e) => e.id === focus)) || latest;
  const label = (ev: Ev) => fill(ev.kind === "post" ? p.published : p.pushTo, { name: ev.name });

  return (
    <div className="app-now-pulse">
      <div className="app-now-pulse-top">
        <p className="app-now-pulse-caption">{p.caption}</p>
        {/* not live: hovering would re-announce what each blip's link already says */}
        <p className="app-now-pulse-readout">
          {shown && now ? (
            <>
              <span className="app-now-pulse-readout-name" style={{ textDecorationColor: COLOR[shown.kind] }}>
                {label(shown)}
              </span>
              <span className="app-now-pulse-readout-ago">{timeAgo(new Date(shown.t).toISOString(), lang)}</span>
            </>
          ) : events.length === 0 ? (
            <span>{p.empty}</span>
          ) : (
            " "
          )}
        </p>
      </div>

      <div
        ref={wrapRef}
        className="app-now-pulse-plot"
        data-run={(!reduced && on && !hidden) || undefined}
        data-focus={focus ? "" : undefined}
        style={{ "--scan": `${SCAN_S}s`, height: rows * cell } as React.CSSProperties}
      >
        {data && (
          <svg
            className="app-now-pulse-svg"
            width={data.cols * cell}
            height={data.rows * cell}
            viewBox={`0 0 ${data.cols} ${data.rows}`}
            shapeRendering="crispEdges"
            aria-hidden
          >
            {/* time ticks along the bottom */}
            <g className="app-now-pulse-ticks">
              <path d={pxPath([...ticks.map((tk) => ({ x: tk.col, y: data.rows - 2, h: 2 })), { x: data.nowCol, y: data.rows - 2, h: 2 }])} />
            </g>
            {/* the resting line */}
            <g className="app-now-pulse-base">
              <path d={pxPath(data.runs.filter((r) => r.owner < 0))} />
            </g>
            {/* one group per event, so each can flare as the scan passes */}
            {events.map((ev, i) => {
              const runs = data.runs.filter((r) => r.owner === i);
              if (!runs.length) return null;
              const mark = data.marks.find((mk) => mk.ev.id === ev.id);
              const tScan = mark ? ((mark.f + 0.09) / 1.18) * SCAN_S : 0;
              return (
                <g
                  key={ev.id}
                  className="app-now-pulse-ev"
                  data-on={focus === ev.id || undefined}
                  fill={COLOR[ev.kind]}
                  style={{ animationDelay: `${tScan.toFixed(2)}s` }}
                >
                  <path d={pxPath(runs)} />
                </g>
              );
            })}
            {/* now: a live dot at the end of the line */}
            <g className="app-now-pulse-now">
              <rect x={data.nowCol - 1} y={data.base - 1} width={3} height={3} />
            </g>
          </svg>
        )}
        <span className="app-now-pulse-scan" aria-hidden>
          <span />
        </span>
        {/* hit targets: real links, readable by everyone */}
        {data && (
          <ul className="app-now-pulse-hits">
            {data.marks.map(({ ev, col }) => (
              <li key={ev.id} style={{ left: (col + 0.5) * cell }}>
                <a
                  href={ev.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  aria-label={`${label(ev)}, ${timeAgo(new Date(ev.t).toISOString(), lang)}`}
                  onPointerEnter={() => setFocus(ev.id)}
                  onPointerLeave={() => setFocus((f) => (f === ev.id ? null : f))}
                  onFocus={() => setFocus(ev.id)}
                  onBlur={() => setFocus((f) => (f === ev.id ? null : f))}
                />
              </li>
            ))}
          </ul>
        )}
      </div>

      <div className="app-now-pulse-axis" aria-hidden style={{ height: 16 }}>
        {ticks.map((tk) => (
          <span key={tk.label} style={{ left: (tk.col + 0.5) * cell }}>
            {tk.label}
          </span>
        ))}
        {data && (
          <span className="app-now-pulse-axis-now" style={{ left: (data.nowCol + 0.5) * cell }}>
            {p.now}
          </span>
        )}
      </div>
    </div>
  );
}
