"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { animate } from "motion/react";
import type { RepoInfo, YearRange, YearsInfo } from "@/lib/github";
import { LANG_COLORS, LANG_FALLBACK } from "@/lib/langColors";
import { useI18n } from "@/i18n/client";
import { useFinePointer, useMedia, useReduced } from "@/hooks/env";
import { timeAgo } from "@/lib/format";
import { spring } from "@/lib/motion";
import { useSound } from "@/lib/sound";
import { fmt, itemId } from "./model";
import { WEEKS, layoutYears, paintYears, rangeAt, weekAt, type YearsLayout } from "./yearsArt";
import { afterTransition } from "@/hooks/useSettled";

const CELL = 3;
type Load = { years: YearsInfo; sample: boolean } | "error" | null;
/** one fetch per visit: switching views back and forth is instant */
let loading: Promise<Load> | null = null;
const load = () =>
  (loading ??= fetch("/api/years")
    .then(async (r) => (r.ok ? ((await r.json()) as { years: YearsInfo; sample: boolean }) : "error"))
    .catch(() => "error" as const)
    .then((v) => {
      if (v === "error") loading = null;
      return v;
    }));

const colorOf = (r: YearRange) => LANG_COLORS[r.language] ?? LANG_FALLBACK;
const DAY = 86_400_000;

/**
 * Projects' landing: a year of work as mountains. Each project is a
 * range, its peaks the weeks with commits, the busiest project in front;
 * move across the year to read any week, pick a range and it comes forward
 * with its busiest week, its last commit and a way in. Under the picture,
 * each project as a card, its name in its ridge's colour: pointing at one
 * lifts its range, opening one opens Quick Look. Search and folders narrow
 * the ranges like the other views.
 */
export function Years({ visible, repos, onOpen }: { visible: Set<string>; repos: RepoInfo[]; onOpen: (name: string) => void }) {
  const { t, lang } = useI18n();
  const y = t.work.years;
  const reduced = useReduced();
  const fine = useFinePointer();
  const compact = useMedia("(max-width: 767px)");
  const { blip } = useSound();
  const [data, setData] = useState<Load>(null);
  const [sel, setSel] = useState(-1);
  const [week, setWeek] = useState(-1);
  const [hover, setHover] = useState(-1);
  const [said, setSaid] = useState("");
  const stageRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [box, setBox] = useState({ W: 0, H: 0 });
  const layoutRef = useRef<YearsLayout | null>(null);
  const kRef = useRef(0);
  const imgRef = useRef<ImageData | null>(null);
  const drag = useRef<{ id: number; x: number; y: number; moved: boolean } | null>(null);

  useEffect(() => {
    let on = true;
    load().then((v) => on && setData(v));
    return () => {
      on = false;
    };
  }, []);

  const years = data && data !== "error" ? data.years : null;
  // front first: the busiest project stands nearest
  const ranges = useMemo(() => (years ? years.ranges.filter((r) => visible.has(r.repo)).sort((a, b) => b.total - a.total) : []), [years, visible]);
  const colors = useMemo(() => ranges.map(colorOf), [ranges]);
  const byName = useMemo(() => new Map(repos.map((r) => [r.name, r])), [repos]);
  const selected = sel < ranges.length ? sel : -1;
  // the range that stands forward: the picked one, else the one pointed at (a card or the picture)
  const lifted = selected >= 0 ? selected : hover < ranges.length ? hover : -1;

  useEffect(() => {
    const el = stageRef.current;
    if (!el) return;
    // the ranges are laid out and painted once the window has opened, never mid transition
    let cancel = () => {};
    const ro = new ResizeObserver(([e]) => {
      const next = { W: Math.floor(e.contentRect.width / CELL), H: Math.floor(e.contentRect.height / CELL) };
      cancel();
      cancel = afterTransition(() => setBox(next));
    });
    ro.observe(el);
    return () => {
      cancel();
      ro.disconnect();
    };
  }, [data]);

  const layout = useMemo(() => (box.W > 20 && box.H > 20 && ranges.length ? layoutYears(ranges, box.W, box.H, compact) : null), [ranges, box, compact]);

  // paint: a layout, then whatever is picked and scrubbed
  const paintRef = useRef<() => void>(() => {});
  useEffect(() => {
    paintRef.current = () => {
      const L = layoutRef.current;
      const cv = canvasRef.current;
      const ctx = cv?.getContext("2d");
      if (!L || !cv || !ctx) return;
      if (!imgRef.current || imgRef.current.width !== L.W || imgRef.current.height !== L.H) imgRef.current = new ImageData(L.W, L.H);
      paintYears(L, colors, lifted, kRef.current, week, imgRef.current.data);
      ctx.putImageData(imgRef.current, 0, 0);
    };
  });
  useEffect(() => {
    const cv = canvasRef.current;
    layoutRef.current = layout;
    if (!layout || !cv) return;
    cv.width = layout.W;
    cv.height = layout.H;
    cv.style.width = `${layout.W * CELL}px`;
    cv.style.height = `${layout.H * CELL}px`;
    paintRef.current();
  }, [layout]);
  useEffect(() => {
    paintRef.current();
  }, [week, colors]);
  // the picked range comes forward (its haze lifts, the others' deepens)
  useEffect(() => {
    if (reduced) {
      kRef.current = 1;
      paintRef.current();
      return;
    }
    kRef.current = 0;
    const c = animate(0, 1, {
      ...spring.snappy,
      onUpdate: (v) => {
        kRef.current = v;
        paintRef.current();
      },
    });
    return () => c.stop();
  }, [lifted, reduced]);

  const start = years ? Date.parse(`${years.start}T12:00:00Z`) : 0;
  const locale = lang === "fr" ? "fr-FR" : "en-GB";
  const dayFmt = new Intl.DateTimeFormat(locale, { day: "numeric", month: "short", timeZone: "UTC" });
  const monthFmt = new Intl.DateTimeFormat(locale, { month: "short", timeZone: "UTC" });
  const weekDate = (w: number) => dayFmt.format(new Date(start + w * 7 * DAY)).replace(/\.$/, "");
  const count = (n: number) => (n === 0 ? y.noCommits : n === 1 ? y.commitOne : fmt(y.commits, { n }));

  // which range the card talks about, and which week
  const who = selected >= 0 ? selected : hover >= 0 ? hover : ranges.length ? 0 : -1;
  const range = who >= 0 ? ranges[who] : null;
  const busiest = range ? range.weeks.indexOf(Math.max(...range.weeks)) : -1;
  const shownWeek = week >= 0 ? week : busiest;

  const pointAt = (e: { clientX: number; clientY: number }) => {
    const el = stageRef.current;
    if (!el || !layout) return null;
    const r = el.getBoundingClientRect();
    return { x: (e.clientX - r.left) / CELL, y: (e.clientY - r.top) / CELL };
  };

  const onPointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    const p = pointAt(e);
    if (!p || !layout) return;
    const d = drag.current;
    if (d && Math.abs(e.clientX - d.x) > 6) d.moved = true;
    // a mouse reads as it moves; a finger reads while it drags
    if (e.pointerType === "mouse" || d) {
      setWeek(weekAt(layout, p.x));
      if (e.pointerType === "mouse") setHover(rangeAt(layout, p.x, p.y));
    }
  };
  const onPointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    if (e.button !== 0) return;
    drag.current = { id: e.pointerId, x: e.clientX, y: e.clientY, moved: false };
    const p = pointAt(e);
    if (p && layout && e.pointerType !== "mouse") setWeek(weekAt(layout, p.x));
  };
  const onPointerUp = (e: React.PointerEvent<HTMLDivElement>) => {
    const d = drag.current;
    drag.current = null;
    if (!d || d.moved || !layout) return;
    const p = pointAt(e);
    if (!p) return;
    const j = rangeAt(layout, p.x, p.y);
    setSel((s) => (j === s ? -1 : j));
    blip(j >= 0 ? "select" : "tick");
  };

  const announce = (j: number, w: number) => {
    const r = ranges[j];
    if (r && w >= 0) setSaid(fmt(y.said, { repo: r.repo, date: weekDate(w), n: count(r.weeks[w] ?? 0) }));
  };
  const onKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
    if (!ranges.length) return;
    const j = selected >= 0 ? selected : 0;
    const w = week >= 0 ? week : WEEKS - 1;
    let nj = j;
    let nw = w;
    if (e.key === "ArrowLeft") nw = Math.max(0, w - (week >= 0 ? 1 : 0));
    else if (e.key === "ArrowRight") nw = Math.min(WEEKS - 1, w + (week >= 0 ? 1 : 0));
    else if (e.key === "Home") nw = 0;
    else if (e.key === "End") nw = WEEKS - 1;
    else if (e.key === "ArrowUp") nj = Math.min(ranges.length - 1, (selected >= 0 ? j + 1 : 0));
    else if (e.key === "ArrowDown") nj = Math.max(0, j - 1);
    else if (e.key === "Enter" && ranges[j]) {
      e.preventDefault();
      onOpen(ranges[j].repo);
      return;
    } else if (e.key === "Escape" && (week >= 0 || selected >= 0)) {
      e.preventDefault();
      e.stopPropagation();
      setWeek(-1);
      setSel(-1);
      return;
    } else return;
    e.preventDefault();
    setWeek(nw);
    setSel(nj);
    announce(nj, nw);
  };

  // month labels where months begin, none touching each other or "now"
  const ticks: { label: string; x: number }[] = [];
  if (layout && years) {
    let prev = -1;
    let next = 0;
    const end = layout.W * CELL - 72;
    for (let w = 0; w < WEEKS; w++) {
      const m = new Date(start + w * 7 * DAY).getUTCMonth();
      if (w > 0 && m !== prev) {
        const x = layout.xs[w] * CELL;
        if (x >= next && x < end) {
          ticks.push({ label: monthFmt.format(new Date(start + w * 7 * DAY)).replace(/\.$/, ""), x });
          next = x + 44;
        }
      }
      prev = m;
    }
  }

  const cardLeft = layout && shownWeek >= 0 ? layout.xs[shownWeek] * CELL > layout.W * CELL * 0.55 : false;

  return (
    <section className="app-work-years" aria-labelledby="app-work-years-title">
      <header className="app-work-years-head">
        <h2 id="app-work-years-title" className="app-work-years-title">
          {y.title}
        </h2>
        <p className="app-work-years-lede">{y.lede}</p>
      </header>

      <div className="app-work-years-body">
        <div className="app-work-years-main">
          <div
            ref={stageRef}
            className="app-work-years-stage"
            role="group"
            tabIndex={ranges.length ? 0 : -1}
            aria-label={y.label}
            data-no-drag
            onPointerMove={onPointerMove}
            onPointerDown={onPointerDown}
            onPointerUp={onPointerUp}
            onPointerCancel={() => (drag.current = null)}
            onPointerLeave={(e) => {
              if (e.pointerType !== "mouse") return;
              setWeek(-1);
              setHover(-1);
            }}
            onKeyDown={onKeyDown}
          >
            <canvas ref={canvasRef} className="app-work-years-canvas" width={1} height={1} aria-hidden />
            {data === null && <p className="app-work-years-state">{y.loading}</p>}
            {data === "error" && <p className="app-work-years-state">{y.error}</p>}
            {years && !ranges.length && <p className="app-work-years-state">{y.empty}</p>}

          </div>

          {layout && (
            <div className="app-work-years-axis" aria-hidden>
              {ticks.map((tk) => (
                <span key={`${tk.label}-${tk.x}`} style={{ left: tk.x }}>
                  {tk.label}
                </span>
              ))}
              <span className="app-work-years-now">{y.now}</span>
            </div>
          )}
          {range && shownWeek >= 0 && (
            <div
              className="app-work-years-card"
              data-side={cardLeft ? "left" : "right"}
              aria-hidden
            >
              <p className="app-work-years-card-k tabular">
                {fmt(y.week, { date: weekDate(shownWeek) })} · {count(range.weeks[shownWeek] ?? 0)}
              </p>
              <p className="app-work-years-card-t" style={{ "--c": colors[who] } as React.CSSProperties}>
                {range.repo}
              </p>
              {range.last && (
                <p className="app-work-years-card-l">
                  <span className="app-work-years-card-ago">{fmt(y.lastCommit, { ago: timeAgo(range.last.date, lang) })}</span>
                  <span className="app-work-years-card-msg">{range.last.message}</span>
                </p>
              )}
              {selected >= 0 && (
                <button type="button" className="app-work-years-card-open" onClick={() => onOpen(range.repo)} tabIndex={-1}>
                  {y.open} <span aria-hidden>→</span>
                </button>
              )}
            </div>
          )}
          <p className="app-work-years-foot">
            <span>{fine ? y.hint : y.hintTouch}</span>
            {data && data !== "error" && data.sample && <span className="app-work-years-sample">{y.sample}</span>}
          </p>
        </div>
      </div>

      {ranges.length > 0 && (
        <ol className="app-work-years-cards">
          {ranges.map((r, j) => {
            const repo = byName.get(r.repo);
            return (
              <li key={r.repo}>
                <button
                  type="button"
                  id={itemId(r.repo)}
                  className="app-work-years-proj"
                  data-on={(hover === j || selected === j) || undefined}
                  data-dim={((hover >= 0 && hover !== j) || (hover < 0 && selected >= 0 && selected !== j)) || undefined}
                  style={{ "--c": colors[j] } as React.CSSProperties}
                  onPointerEnter={(e) => e.pointerType === "mouse" && setHover(j)}
                  onPointerLeave={(e) => e.pointerType === "mouse" && setHover(-1)}
                  onFocus={() => setHover(j)}
                  onBlur={() => setHover(-1)}
                  onClick={() => {
                    blip("select");
                    onOpen(r.repo);
                  }}
                >
                  <span className="app-work-years-proj-name" data-ql-origin>
                    {r.repo}
                  </span>
                  {repo?.description && <span className="app-work-years-proj-desc">{repo.description}</span>}
                  <span className="app-work-years-proj-meta tabular">
                    {[r.language, count(r.total), repo && repo.stars > 0 ? `★ ${repo.stars}` : "", repo ? timeAgo(repo.pushedAt, lang) : ""]
                      .filter(Boolean)
                      .join(" · ")}
                  </span>
                </button>
              </li>
            );
          })}
        </ol>
      )}

      {/* the card's button is for pointers; keyboards press Enter on the stage */}
      <p className="sr-only" aria-live="polite">
        {said}
      </p>
    </section>
  );
}
