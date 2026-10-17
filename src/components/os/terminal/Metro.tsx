"use client";

import { useContext, useEffect, useMemo, useRef, useState } from "react";
import { animate, m, useMotionValue, useMotionValueEvent, type AnimationPlaybackControls } from "motion/react";
import { useI18n } from "@/i18n/client";
import { useSound } from "@/lib/sound";
import { useReduced } from "@/hooks/env";
import { useArtPalette } from "@/hooks/useTheme";
import { project, rubberband, spring } from "@/lib/motion";
import { mix } from "@/lib/theme";
import { timeAgo } from "@/lib/format";
import { LANG_COLORS } from "@/lib/langColors";
import type { MetroLine } from "@/lib/github";
import { useGit } from "./Git";
import { ActionsCtx, Cmd, fill } from "./ui";
import { ledCells, LED_CELL, LED_LINE } from "./led";

/**
 * `git log`: Elliot's recent commits as the line map over a Toulouse metro
 * door. Each recently pushed repo is a line in its language's colour, each
 * commit a station, oldest on the left, the terminus ringed and signed
 * "direction <repo>". The lines share one time axis, a column per hour
 * that saw a commit: commits from different repos in the same hour line up
 * and get a transfer, and quiet spells longer than a day fold into a
 * dotted stretch with its length. Station names are the message's first
 * words, alternating above and below. Drag the little VAL train along a line
 * (or step with the arrows) and the LED next-stop board reads out each
 * commit. Every time shown is real. Phones turn the map on its side.
 */

type Stop = { id: string; line: number; i: number; message: string; date: string; url: string; t: number; col: number };
type Track = { repo: string; url: string; color: string; stops: Stop[] };
type Col = { hour: number; gap?: undefined } | { gap: number; hour?: undefined };

const MAX_STOPS = 8;
/** the side-on (vertical) map below this width */
const NARROW = 520;

function build(lines: MetroLine[], maxLines: number, fallback: string[]) {
  const used = new Set<string>();
  const tracks: Track[] = lines.slice(0, maxLines).map((l, line) => {
    // its language's colour, unless a line already runs in it
    let color = LANG_COLORS[l.language];
    if (!color || used.has(color)) color = fallback.find((c) => !used.has(c)) ?? fallback[line % fallback.length];
    used.add(color);
    const stops = l.commits
      .slice(0, MAX_STOPS)
      .map((c) => ({ id: `${l.repo}-${c.sha.slice(0, 7)}`, line, i: 0, message: c.message, date: c.date, url: c.url, t: Date.parse(c.date), col: 0 }))
      .sort((a, b) => a.t - b.t);
    stops.forEach((s, i) => (s.i = i));
    return { repo: l.repo, url: l.url, color, stops };
  });
  const hours = [...new Set(tracks.flatMap((tr) => tr.stops.map((s) => Math.floor(s.t / 3_600_000))))].sort((a, b) => a - b);
  const cols: Col[] = [];
  const colOf = new Map<number, number>();
  let prev: number | null = null;
  for (const h of hours) {
    if (prev !== null && h - prev > 24) cols.push({ gap: Math.round((h - prev) / 24) });
    cols.push({ hour: h });
    colOf.set(h, cols.length - 1);
    prev = h;
  }
  for (const tr of tracks) for (const s of tr.stops) s.col = colOf.get(Math.floor(s.t / 3_600_000)) ?? 0;
  return { tracks, cols, more: Math.max(0, lines.length - maxLines) };
}

/* ───────────────────────── the LED board ───────────────────────── */

const PITCH = 3;
const PAD = 2;

function LedBoard({ label, time, text }: { label: string; time: string; text: string }) {
  const P = useArtPalette();
  const reduced = useReduced();
  const wrap = useRef<HTMLDivElement>(null);
  const canvas = useRef<HTMLCanvasElement>(null);
  const [w, setW] = useState(0);

  useEffect(() => {
    const el = wrap.current;
    if (!el) return;
    const ro = new ResizeObserver(([e]) => setW(Math.floor(e.contentRect.width)));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  useEffect(() => {
    const c = canvas.current;
    const ctx = c?.getContext("2d");
    if (!c || !ctx || w < 40) return;
    const cols = Math.floor(w / PITCH);
    const rows = PAD * 2 + LED_LINE * 2 + 1;
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    c.width = cols * PITCH * dpr;
    c.height = rows * PITCH * dpr;
    c.style.width = `${cols * PITCH}px`;
    c.style.height = `${rows * PITCH}px`;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    const lit = P.ember;
    const off = mix(P.ink950, P.ember, 0.1);
    const inner = cols - PAD * 2;
    const cap = Math.floor((inner + 1) / LED_CELL);
    let msg = ledCells(text);
    const overflow = msg.length - cap;
    if (overflow > 0 && reduced) msg = [...msg.slice(0, cap - 3), ...ledCells("...")];
    const head = ledCells(label);
    const clock = ledCells(time);
    const grid = new Uint8Array(cols * rows);

    const plot = (cells: ReturnType<typeof ledCells>, x0: number, y0: number) => {
      cells.forEach((cell, k) => {
        const cx = x0 + k * LED_CELL;
        const put = (bits: number, y: number) => {
          for (let b = 0; b < 5; b++) {
            const x = cx + b;
            if ((bits >> (4 - b)) & 1 && x >= PAD && x < PAD + inner) grid[y * cols + x] = 1;
          }
        };
        put(cell.mark, y0);
        cell.rows.forEach((bits, r) => put(bits, y0 + 1 + r));
      });
    };
    const draw = (shift: number) => {
      grid.fill(0);
      plot(head, PAD, PAD);
      plot(clock, PAD + inner - clock.length * LED_CELL + 1, PAD);
      plot(msg, PAD - shift, PAD + LED_LINE + 1);
      ctx.clearRect(0, 0, cols * PITCH, rows * PITCH);
      ctx.fillStyle = off;
      for (let i = 0; i < grid.length; i++) if (!grid[i]) ctx.fillRect((i % cols) * PITCH, Math.floor(i / cols) * PITCH, PITCH - 1, PITCH - 1);
      ctx.fillStyle = lit;
      for (let i = 0; i < grid.length; i++) if (grid[i]) ctx.fillRect((i % cols) * PITCH, Math.floor(i / cols) * PITCH, PITCH - 1, PITCH - 1);
    };
    draw(0);
    if (overflow <= 0 || reduced) return;
    // a long message runs through once, rests on its end, then comes back to its start
    const dots = overflow * LED_CELL;
    let raf = 0;
    let t0 = 0;
    const DELAY = 900;
    const SPEED = 22; // dots a second
    const HOLD = 1400;
    const run = (now: number) => {
      t0 ||= now;
      const e = now - t0 - DELAY;
      const d = Math.max(0, Math.min(dots, Math.floor((e / 1000) * SPEED)));
      draw(d);
      if (e < (dots / SPEED) * 1000 + HOLD) raf = requestAnimationFrame(run);
      else draw(0);
    };
    raf = requestAnimationFrame(run);
    return () => cancelAnimationFrame(raf);
  }, [w, label, time, text, P, reduced]);

  return (
    <div ref={wrap} className="os-metro-led" role="img" aria-label={`${label}: ${text}, ${time}`}>
      <canvas ref={canvas} />
    </div>
  );
}

/* ───────────────────────── the map ───────────────────────── */

export function Metro() {
  const { t, lang } = useI18n();
  const g = t.system.term.git;
  const mt = t.system.term.metro;
  const s = useGit<MetroLine[]>("/api/git?metro", (j) => j.lines as MetroLine[] | undefined);
  if (s.status === "loading") return <p className="os-term-dim">{g.loading}</p>;
  if (s.status === "error") return <p className="os-term-err">{g.offline}</p>;
  if (!s.value.length)
    return (
      <div className="os-term-block os-metro-empty">
        <p className="os-metro-closed">
          <span className="os-metro-closed-line" aria-hidden />
          {mt.noService}
        </p>
        <p className="os-term-dim">
          {mt.noServiceHint} <Cmd value="open work" />
        </p>
      </div>
    );
  return <MetroMap lines={s.value} lang={lang} />;
}

function MetroMap({ lines, lang }: { lines: MetroLine[]; lang: "en" | "fr" }) {
  const { t } = useI18n();
  const mt = t.system.term.metro;
  const P = useArtPalette();
  const { blip } = useSound();
  const reduced = useReduced();
  const { run } = useContext(ActionsCtx);
  const box = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(0);
  useEffect(() => {
    const el = box.current;
    if (!el) return;
    const ro = new ResizeObserver(([e]) => setWidth(Math.floor(e.contentRect.width)));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  const narrow = width > 0 && width < NARROW;

  const { tracks, cols, more } = useMemo(
    () => build(lines, narrow ? 3 : 4, [P.signal, P.ion, P.lilac, P.flare, P.ember]),
    [lines, narrow, P]
  );

  // the newest commit of all to start on
  const first = useMemo(() => {
    let best = { line: 0, i: Math.max(0, (tracks[0]?.stops.length ?? 1) - 1) };
    let bt = -Infinity;
    for (const tr of tracks) {
      const last = tr.stops[tr.stops.length - 1];
      if (last && last.t > bt) {
        bt = last.t;
        best = { line: last.line, i: last.i };
      }
    }
    return best;
  }, [tracks]);
  const [sel, setSel] = useState(first);
  const at = tracks[sel.line]?.stops[sel.i] ? sel : first;
  const stop = tracks[at.line]?.stops[at.i];

  /* geometry: `axis` runs along time, `cross` across the lines */
  const n = tracks.length;
  const COL = 68;
  const GAP = 46;
  const ROW = 60;
  const ROW_V = 34;
  const GAP_V = 26;
  const LANE_V = 20;
  const axisOf = useMemo(() => {
    const out: number[] = [];
    if (!narrow) {
      let x = 26;
      cols.forEach((c, k) => {
        if (k) x += c.gap || cols[k - 1].gap ? GAP : COL;
        out.push(x);
      });
    } else {
      // newest on top
      let y = 16;
      for (let k = cols.length - 1; k >= 0; k--) {
        out[k] = y;
        y += cols[k].gap || cols[k - 1]?.gap ? GAP_V : ROW_V;
      }
    }
    return out;
  }, [cols, narrow]);
  const crossOf = (line: number) => (narrow ? 14 + line * LANE_V : 34 + line * ROW);
  const span = narrow ? (axisOf[0] ?? 0) + 18 : (axisOf[axisOf.length - 1] ?? 0) + 190;
  const depth = narrow ? 14 + (n - 1) * LANE_V + 14 : 34 + (n - 1) * ROW + 44;
  const W = narrow ? depth : span;
  const H = narrow ? span : depth;
  const pt = (axis: number, cross: number) => (narrow ? { x: cross, y: axis } : { x: axis, y: cross });

  /* the train: its place along the time axis, on the selected line */
  const pos = useMotionValue(stop ? axisOf[stop.col] : 0);
  const mapRef = useRef<HTMLDivElement>(null);
  const anim = useRef<AnimationPlaybackControls | null>(null);
  const dragging = useRef(false);
  const lastTick = useRef(0);

  // follow the selection (step, tap, keyboard) unless a finger is on it
  const target = stop ? axisOf[stop.col] : 0;
  useEffect(() => {
    if (dragging.current) return;
    anim.current?.stop();
    if (reduced) pos.jump(target);
    else anim.current = animate(pos, target, spring.default);
  }, [target, at.line, pos, reduced]);

  // while dragged, the board reads each station the train passes
  useMotionValueEvent(pos, "change", (p) => {
    if (!dragging.current) return;
    const tr = tracks[at.line];
    if (!tr) return;
    const near = tr.stops.reduce((b, s) => (Math.abs(axisOf[s.col] - p) < Math.abs(axisOf[b.col] - p) ? s : b), tr.stops[0]);
    if (near.i !== at.i) {
      setSel({ line: at.line, i: near.i });
      const now = performance.now();
      if (now - lastTick.current > 40) {
        lastTick.current = now;
        blip("tick");
      }
    }
  });

  const grab = useRef<{ id: number; start: number; p0: number; samples: [number, number][] } | null>(null);
  const along = (e: React.PointerEvent) => (narrow ? e.clientY : e.clientX);
  const onTrainDown = (e: React.PointerEvent<SVGGElement>) => {
    if (e.button !== 0) return;
    e.preventDefault();
    anim.current?.stop();
    dragging.current = true;
    (e.currentTarget.ownerSVGElement ?? e.currentTarget).setPointerCapture(e.pointerId);
    grab.current = { id: e.pointerId, start: along(e), p0: pos.get(), samples: [[e.timeStamp, along(e)]] };
  };
  const onMove = (e: React.PointerEvent<SVGSVGElement>) => {
    const gr = grab.current;
    const tr = tracks[at.line];
    if (!gr || gr.id !== e.pointerId || !tr) return;
    const lo = axisOf[tr.stops[0].col];
    const hi = axisOf[tr.stops[tr.stops.length - 1].col];
    const [min, max] = lo < hi ? [lo, hi] : [hi, lo];
    let p = gr.p0 + along(e) - gr.start;
    // past the terminus it resists
    if (p < min) p = min + rubberband(p - min, 120);
    if (p > max) p = max + rubberband(p - max, 120);
    pos.set(p);
    gr.samples.push([e.timeStamp, along(e)]);
    while (gr.samples.length > 2 && e.timeStamp - gr.samples[0][0] > 100) gr.samples.shift();
  };
  const onUp = (e: React.PointerEvent<SVGSVGElement>) => {
    const gr = grab.current;
    if (!gr || gr.id !== e.pointerId) return;
    grab.current = null;
    dragging.current = false;
    const tr = tracks[at.line];
    if (!tr) return;
    const [t0, a0] = gr.samples[0];
    const dt = (e.timeStamp - t0) / 1000;
    const v = dt > 0.008 ? (along(e) - a0) / dt : 0;
    const land = pos.get() + (reduced ? 0 : project(v));
    const near = tr.stops.reduce((b, s) => (Math.abs(axisOf[s.col] - land) < Math.abs(axisOf[b.col] - land) ? s : b), tr.stops[0]);
    setSel({ line: at.line, i: near.i });
    anim.current?.stop();
    const to = axisOf[near.col];
    if (reduced) pos.jump(to);
    // a slight bounce only when it was thrown
    else anim.current = animate(pos, to, Math.abs(v) > 300 ? { ...spring.flick, velocity: v } : { ...spring.default, velocity: v });
    // the doors' chime as it pulls in
    window.setTimeout(() => blip("chime"), reduced ? 0 : 260);
  };

  // wide maps open on their newest end
  useEffect(() => {
    const el = mapRef.current;
    if (el && !narrow) el.scrollLeft = el.scrollWidth;
  }, [narrow, W]);

  const go = (line: number, i: number) => {
    if (line !== at.line || i !== at.i) blip("tick");
    setSel({ line, i });
  };
  const onKey = (e: React.KeyboardEvent) => {
    const tr = tracks[at.line];
    if (!tr || !stop) return;
    const k = e.key;
    let handled = true;
    if (k === "ArrowLeft" || k === "h") go(at.line, Math.max(0, at.i - 1));
    else if (k === "ArrowRight" || k === "l") go(at.line, Math.min(tr.stops.length - 1, at.i + 1));
    else if (k === "Home") go(at.line, 0);
    else if (k === "End") go(at.line, tr.stops.length - 1);
    else if (k === "ArrowUp" || k === "k" || k === "ArrowDown" || k === "j") {
      // change lines only at a transfer: a station in the same hour
      const dir = k === "ArrowUp" || k === "k" ? -1 : 1;
      for (let l = at.line + dir; l >= 0 && l < n; l += dir) {
        const s2 = tracks[l].stops.find((s) => s.col === stop.col);
        if (s2) {
          go(l, s2.i);
          break;
        }
      }
    } else if (k === "Enter") window.open(stop.url, "_blank", "noopener,noreferrer");
    else if (k === "o") run("open work");
    else handled = false;
    if (handled) {
      e.preventDefault();
      e.stopPropagation();
    }
  };

  const ago = (d: string) => timeAgo(d, lang);
  const clock = (d: string) =>
    new Intl.DateTimeFormat("fr-FR", { timeZone: "Europe/Paris", hour: "2-digit", minute: "2-digit" }).format(new Date(d));
  const short = (msg: string) => (msg.length > 14 ? `${msg.slice(0, 13).trimEnd()}…` : msg);
  const gapText = (d: number) => (d === 1 ? mt.gapOne : fill(mt.gapMany, { n: d }));

  return (
    <div className="os-term-block os-metro" ref={box}>
      {stop && (
        <>
          <LedBoard label={mt.next} time={clock(stop.date)} text={stop.message} />
          <p className="os-metro-sub">
            <span style={{ color: tracks[at.line].color }}>{fill(mt.direction, { repo: tracks[at.line].repo })}</span>
            <span className="os-term-dim"> · {ago(stop.date)}</span>
          </p>
        </>
      )}
      {narrow && (
        <ul className="os-metro-legend">
          {tracks.map((tr) => (
            <li key={tr.repo} style={{ color: tr.color }}>
              {fill(mt.direction, { repo: tr.repo })}
            </li>
          ))}
        </ul>
      )}
      <div
        ref={mapRef}
        className="os-metro-map"
        data-narrow={narrow || undefined}
        role="listbox"
        tabIndex={0}
        aria-label={mt.label}
        aria-activedescendant={stop ? `os-metro-${stop.id}` : undefined}
        onKeyDown={onKey}
      >
        <div className="os-metro-canvas" style={{ width: narrow ? "100%" : W, height: H }}>
          <svg width={W} height={H} viewBox={`0 0 ${W} ${H}`} onPointerMove={onMove} onPointerUp={onUp} onPointerCancel={onUp} aria-hidden>
            {/* folded quiet spells */}
            {cols.map((c, k) =>
              c.gap ? (
                <g key={`gap${k}`} className="os-metro-gap">
                  {narrow ? (
                    <line x1={4} x2={W - 4} y1={axisOf[k]} y2={axisOf[k]} />
                  ) : (
                    <line x1={axisOf[k]} x2={axisOf[k]} y1={8} y2={H - 22} />
                  )}
                </g>
              ) : null
            )}
            {/* the lines: solid between stations, dotted across a fold */}
            {tracks.map((tr) =>
              tr.stops.slice(1).map((s, k) => {
                const a = tr.stops[k];
                const folded = cols.slice(Math.min(a.col, s.col), Math.max(a.col, s.col)).some((c) => c.gap);
                const p1 = pt(axisOf[a.col], crossOf(tr.stops[0].line));
                const p2 = pt(axisOf[s.col], crossOf(tr.stops[0].line));
                return (
                  <line
                    key={`${tr.repo}-${k}`}
                    x1={p1.x}
                    y1={p1.y}
                    x2={p2.x}
                    y2={p2.y}
                    stroke={tr.color}
                    strokeWidth={4}
                    strokeLinecap="round"
                    strokeDasharray={folded ? "1 6" : undefined}
                  />
                );
              })
            )}
            {/* transfers: stations of different lines in the same hour */}
            {cols.map((c, k) => {
              if (c.gap) return null;
              const here = tracks.flatMap((tr) => tr.stops.filter((s) => s.col === k));
              if (here.length < 2) return null;
              const cs = here.map((s) => crossOf(s.line));
              const p1 = pt(axisOf[k], Math.min(...cs));
              const p2 = pt(axisOf[k], Math.max(...cs));
              return <line key={`x${k}`} className="os-metro-transfer" x1={p1.x} y1={p1.y} x2={p2.x} y2={p2.y} />;
            })}
            {/* stations; passed ones light in lime */}
            {tracks.map((tr) =>
              tr.stops.map((s) => {
                const p = pt(axisOf[s.col], crossOf(s.line));
                const terminus = s.i === tr.stops.length - 1;
                const passed = s.line === at.line && s.i <= at.i;
                return (
                  <g key={s.id} className="os-metro-stop" onClick={() => go(s.line, s.i)}>
                    <circle cx={p.x} cy={p.y} r={16} fill="transparent" />
                    <circle cx={p.x} cy={p.y} r={terminus ? 6.5 : 4.5} fill={passed ? P.signal : P.ink950} stroke={tr.color} strokeWidth={2.5} />
                    {terminus && <circle cx={p.x} cy={p.y} r={2.5} fill={passed ? P.ink950 : tr.color} />}
                  </g>
                );
              })
            )}
            {/* the VAL: two cars, a rounded nose, lit windows */}
            <m.g
              className="os-metro-train"
              style={narrow ? { x: crossOf(at.line), y: pos } : { x: pos, y: crossOf(at.line) }}
              onPointerDown={onTrainDown}
            >
              <g transform={narrow ? "rotate(90)" : undefined}>
                <rect x={-20} y={-12} width={40} height={24} fill="transparent" />
                <rect x={-14} y={-5.5} width={13} height={11} rx={2} fill={P.paper} />
                <rect x={1} y={-5.5} width={13} height={11} rx={2} fill={P.paper} />
                <path d="M13 -5.5h1.5a3.5 3.5 0 0 1 3.5 3.5v4a3.5 3.5 0 0 1-3.5 3.5H13z" fill={P.paper} />
                <rect x={-12} y={-3} width={9} height={3} fill={P.signal} />
                <rect x={3} y={-3} width={9} height={3} fill={P.signal} />
                <rect x={-14} y={3} width={31} height={1.5} fill={tracks[at.line]?.color ?? P.ember} />
              </g>
            </m.g>
          </svg>

          {/* labels: the first words, alternating above and below (wide), or a row each (narrow) */}
          <div className="os-metro-labels" aria-hidden>
            {cols.map((c, k) =>
              c.gap ? (
                <span
                  key={`g${k}`}
                  className="os-metro-gaplabel"
                  style={narrow ? { left: W + 10, top: axisOf[k] - 8 } : { left: axisOf[k], top: H - 18 }}
                >
                  {gapText(c.gap)}
                </span>
              ) : null
            )}
            {!narrow &&
              tracks.map((tr) =>
                tr.stops.map((s) => {
                  const p = pt(axisOf[s.col], crossOf(s.line));
                  // alternating, so neighbours never collide
                  const above = s.i % 2 === 1;
                  return (
                    <span
                      key={s.id}
                      className="os-metro-label"
                      data-on={s.line === at.line && s.i === at.i ? "" : undefined}
                      style={{ left: p.x, top: above ? p.y - 24 : p.y + 10 }}
                      onClick={() => go(s.line, s.i)}
                    >
                      {short(s.message)}
                    </span>
                  );
                })
              )}
            {!narrow &&
              tracks.map((tr) => {
                const last = tr.stops[tr.stops.length - 1];
                const p = pt(axisOf[last.col], crossOf(tr.stops[0].line));
                return (
                  <span key={tr.repo} className="os-metro-dir" style={{ left: p.x + 26, top: p.y - 7, color: tr.color }}>
                    {fill(mt.direction, { repo: tr.repo })}
                  </span>
                );
              })}
            {narrow &&
              cols.map((c, k) => {
                if (c.gap) return null;
                const here = tracks.flatMap((tr) => tr.stops.filter((s) => s.col === k));
                const on = here.find((s) => s.line === at.line && s.i === at.i);
                const s0 = on ?? here[0];
                if (!s0) return null;
                return (
                  <span
                    key={`r${k}`}
                    className="os-metro-row"
                    data-on={on ? "" : undefined}
                    style={{ left: W + 10, right: 0, top: axisOf[k] - 9, color: on ? undefined : tracks[s0.line].color }}
                    onClick={() => go(s0.line, s0.i)}
                  >
                    {s0.message}
                    {here.length > 1 && <span className="os-term-dim"> +{here.length - 1}</span>}
                  </span>
                );
              })}
          </div>
        </div>
        {/* what the list announces */}
        {tracks.map((tr) =>
          tr.stops.map((s) => (
            <span
              key={s.id}
              id={`os-metro-${s.id}`}
              role="option"
              aria-selected={s.line === at.line && s.i === at.i}
              className="sr-only"
            >
              {fill(mt.station, { msg: s.message, repo: tr.repo, ago: ago(s.date) })}
            </span>
          ))
        )}
      </div>
      {more > 0 && <p className="os-term-dim">{fill(mt.more, { n: more })}</p>}
      <p className="os-term-dim">{mt.hint}</p>
      <p className="os-term-dim">
        {mt.site} <Cmd value="git log --oneline" />
      </p>
    </div>
  );
}
