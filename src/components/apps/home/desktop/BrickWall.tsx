"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import { useI18n } from "@/i18n/client";
import { useHydrated } from "@/hooks/env";
import { timeAgo } from "@/lib/format";
import { useSound } from "@/lib/sound";
import { Glass } from "@/components/os/Glass";
import { useSiteData } from "@/components/os/SiteData";
import type { PushDay } from "@/lib/github";

const fill = (s: string, v: Record<string, string | number>) => s.replace(/\{(\w+)\}/g, (_, k: string) => String(v[k] ?? ""));

/* ───────────────────────────── the wall ─────────────────────────────
   The last push widget as a stretch of Toulouse brick wall: one brick per
   day of public pushes, coloured like kiln heat (unfired clay for none,
   pale rose, Toulouse rose, deep fired red, overfired for the busiest).
   Columns are weeks, oldest on the left; courses are weekdays, Monday at
   the bottom, so each week is built from the ground up. Bricks are long
   and flat (foraine, 6 × 2 cells, 1-cell mortar) in running bond, and the
   current week stops at today: the toothing of a wall still going up. */

const WEEKS = 13;
const BW = 6;
const BH = 2;
const CW = 1 + WEEKS * (BW + 1) + 4;
const CH = 1 + 7 * (BH + 1);
const SEEN_KEY = "em-wall-seen";

/** kiln ramp: [body, top highlight] */
const KILN: [string, string][] = [
  ["#6e6962", "#78736b"], // unfired clay: no public push
  ["#d29c88", "#dba895"], // 1
  ["#c4735b", "#cd8169"], // 2–3
  ["#a0463a", "#ab5345"], // 4–6
  ["#66292a", "#713333"], // 7+
];
const heat = (n: number) => (n <= 0 ? 0 : n === 1 ? 1 : n <= 3 ? 2 : n <= 6 ? 3 : 4);
const MORTAR = "#26241f";
const SHADOW = "#151412";

const dayFmt = new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Paris", year: "numeric", month: "2-digit", day: "2-digit" });
/** YYYY-MM-DD ± n days (calendar arithmetic, no time zone drift) */
function shift(d: string, n: number) {
  const t = Date.UTC(+d.slice(0, 4), +d.slice(5, 7) - 1, +d.slice(8, 10)) + n * 86_400_000;
  return new Date(t).toISOString().slice(0, 10);
}
/** Monday = 0 … Sunday = 6 */
const weekday = (d: string) => (new Date(`${d}T12:00:00Z`).getUTCDay() + 6) % 7;

type Brick = { d: string; week: number; course: number; x: number; y: number; n: number; day: PushDay | null };

function buildWall(today: string, byDay: Map<string, PushDay>, since: string) {
  const monday = shift(today, -weekday(today));
  const first = shift(monday, -(WEEKS - 1) * 7);
  const bricks: Brick[] = [];
  for (let w = 0; w < WEEKS; w++) {
    for (let c = 0; c < 7; c++) {
      const d = shift(first, w * 7 + c);
      // after today: not laid yet; before the API's memory: not known
      if (d > today || (since && d < since)) continue;
      const day = byDay.get(d) ?? null;
      bricks.push({ d, week: w, course: c, x: 1 + w * (BW + 1) + (c % 2 ? 4 : 0), y: 1 + (6 - c) * (BH + 1), n: day?.n ?? 0, day });
    }
  }
  return bricks;
}

export function PushWidget() {
  const { t, lang, path } = useI18n();
  const w = t.home.widgets.push;
  const { activity, pushes } = useSiteData();
  const hydrated = useHydrated();
  const { blip } = useSound();
  const [active, setActive] = useState<number | null>(null);
  const [fresh, setFresh] = useState<Set<string>>(() => new Set());
  const svgRef = useRef<SVGSVGElement>(null);
  const scrub = useRef<{ pid: number; touch: boolean } | null>(null);

  // the server renders the wall as of its own today; the client re-lays it
  // for the visitor's Toulouse date after hydration
  const today = hydrated ? dayFmt.format(new Date()) : (pushes?.days[0]?.d ?? dayFmt.format(new Date(0)));
  const bricks = useMemo(() => {
    const byDay = new Map((pushes?.days ?? []).map((d) => [d.d, d]));
    return buildWall(today, byDay, pushes?.since ?? "");
  }, [today, pushes]);

  // bricks pushed since this visitor last looked are laid in once
  useEffect(() => {
    let seen: string | null = null;
    try {
      seen = localStorage.getItem(SEEN_KEY);
      localStorage.setItem(SEEN_KEY, dayFmt.format(new Date()));
    } catch {}
    if (!seen) return;
    const s = seen;
    const id = window.setTimeout(() => setFresh(new Set(bricks.filter((b) => b.n > 0 && b.d > s).map((b) => b.d))), 0);
    return () => window.clearTimeout(id);
    // once per mount: the wall as it stood when the desk was revealed
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  useEffect(() => {
    if (!fresh.size || window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const els = svgRef.current?.querySelectorAll<SVGGElement>("[data-fresh]") ?? [];
    els.forEach((el, i) =>
      el.animate([{ transform: "translateY(-1px)", opacity: 0 }, { transform: "none", opacity: 1 }], {
        duration: 320,
        delay: 300 + i * 40,
        easing: "cubic-bezier(0.23, 1, 0.32, 1)",
        fill: "backwards",
      })
    );
  }, [fresh]);

  const hasAny = bricks.some((b) => b.n > 0);
  const cur = active != null ? bricks[active] : null;

  /* ── the readout: the latest push, or the brick in hand ── */
  const dateLabel = (d: string) =>
    new Intl.DateTimeFormat(lang === "fr" ? "fr-FR" : "en-GB", { weekday: "short", day: "numeric", month: "short", timeZone: "UTC" }).format(
      new Date(`${d}T12:00:00Z`)
    );
  let msg: string;
  let meta: string;
  let repo: string | null;
  if (cur) {
    repo = cur.day?.repo ?? null;
    msg = cur.day ? cur.day.msg || cur.day.repo : w.none;
    meta = cur.day
      ? fill(cur.n === 1 ? w.dayOne : w.dayMany, { date: dateLabel(cur.d), n: cur.n, repo: cur.day.repo })
      : fill(w.dayNone, { date: dateLabel(cur.d) });
  } else if (activity) {
    repo = activity.repo;
    msg = activity.message || activity.repo;
    meta = `${activity.repo} · ${hydrated ? timeAgo(activity.createdAt, lang) : ""}`;
  } else {
    repo = null;
    msg = w.empty;
    meta = "";
  }
  const href = repo ? `${path("/work")}?repo=${encodeURIComponent(repo)}` : path("/work");

  /* ── hand and keys ── */
  const brickAt = (clientX: number, clientY: number, touch: boolean) => {
    const svg = svgRef.current;
    if (!svg || !bricks.length) return null;
    const r = svg.getBoundingClientRect();
    const cx = ((clientX - r.left) / r.width) * CW;
    const cy = ((clientY - r.top) / r.height) * CH;
    if (touch) {
      // a finger can't pick a 12 px brick: along the wall is along time
      const k = Math.round(Math.max(0, Math.min(1, (cx - 1) / (CW - 2))) * (bricks.length - 1));
      return k;
    }
    let best = -1;
    let bd = Infinity;
    bricks.forEach((b, i) => {
      const dx = Math.max(b.x - cx, 0, cx - (b.x + BW));
      const dy = Math.max(b.y - cy, 0, cy - (b.y + BH));
      const d = dx * dx + dy * dy;
      if (d < bd) {
        bd = d;
        best = i;
      }
    });
    return bd <= 1 ? best : null;
  };
  const pick = (i: number | null) => {
    if (i === active) return;
    setActive(i);
    if (i != null && scrub.current) blip("tick");
  };

  const onPointerDown = (e: React.PointerEvent<SVGSVGElement>) => {
    if (e.button !== 0) return;
    const touch = e.pointerType !== "mouse";
    e.currentTarget.setPointerCapture(e.pointerId);
    scrub.current = { pid: e.pointerId, touch };
    pick(brickAt(e.clientX, e.clientY, touch));
  };
  const onPointerMove = (e: React.PointerEvent<SVGSVGElement>) => {
    const s = scrub.current;
    if (s && s.pid !== e.pointerId) return;
    if (!s && e.pointerType !== "mouse") return;
    pick(brickAt(e.clientX, e.clientY, s?.touch ?? false));
  };
  const onPointerUp = (e: React.PointerEvent<SVGSVGElement>) => {
    if (scrub.current?.pid !== e.pointerId) return;
    const touch = scrub.current.touch;
    scrub.current = null;
    // a finger lets go of the day it chose; a mouse keeps hovering
    if (touch) window.setTimeout(() => setActive(null), 1600);
  };
  const onKeyDown = (e: React.KeyboardEvent<SVGSVGElement>) => {
    if (!bricks.length) return;
    const i = active ?? bricks.length - 1;
    const by = (n: number) => Math.max(0, Math.min(bricks.length - 1, i + n));
    let next: number | null = null;
    if (e.key === "ArrowUp") next = by(1);
    else if (e.key === "ArrowDown") next = by(-1);
    else if (e.key === "ArrowRight") next = by(7);
    else if (e.key === "ArrowLeft") next = by(-7);
    else if (e.key === "Home") next = 0;
    else if (e.key === "End") next = bricks.length - 1;
    else if (e.key === "Enter" && repo) {
      e.preventDefault();
      document.querySelector<HTMLAnchorElement>(".app-home-wall-readout")?.click();
      return;
    } else if (e.key === "Escape") next = null;
    else return;
    e.preventDefault();
    setActive(next);
  };

  return (
    <div className="app-home-widget app-home-widget--push">
      <Glass thickness="regular" refract={false} aria-hidden className="app-home-widget-glass" />
      <svg
        ref={svgRef}
        viewBox={`0 0 ${CW} ${CH}`}
        className="app-home-wall"
        shapeRendering="crispEdges"
        role="group"
        tabIndex={0}
        aria-roledescription={w.wallRole}
        aria-label={w.wall}
        aria-describedby="app-home-wall-hint"
        data-no-drag
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
        onPointerLeave={(e) => {
          if (!scrub.current && e.pointerType === "mouse") setActive(null);
        }}
        onKeyDown={onKeyDown}
        onBlur={() => setActive(null)}
      >
        <rect x={0} y={0} width={CW} height={CH} fill={MORTAR} />
        {/* half bricks closing the odd courses at the left end */}
        {[1, 3, 5].map((c) => (
          <rect key={`h${c}`} x={1} y={1 + (6 - c) * (BH + 1)} width={3} height={BH} fill="#4a4640" />
        ))}
        {bricks.map((b, i) => {
          const [body, hi] = KILN[heat(b.n)];
          const on = i === active;
          const isFresh = fresh.has(b.d);
          return (
            <g key={b.d} className="app-home-wall-brick" data-on={on || undefined} data-fresh={isFresh || undefined}>
              {on && <rect x={b.x} y={b.y + 1} width={BW} height={BH} fill={SHADOW} />}
              <g className="app-home-wall-lift" style={on ? { transform: "translate(-1px, -1px)" } : undefined}>
                <rect x={b.x} y={b.y} width={BW} height={BH} fill={body} />
                <rect x={b.x} y={b.y} width={BW - 1} height={1} fill={hi} />
                {(b.d.charCodeAt(9) + b.d.charCodeAt(6)) % 3 === 0 && <rect x={b.x + 1 + (b.d.charCodeAt(8) % 4)} y={b.y + 1} width={1} height={1} fill={body} opacity={0.6} />}
                {on && <rect x={b.x} y={b.y} width={BW} height={BH} fill="none" stroke="#b0cc86" strokeWidth={0.34} className="app-home-wall-ring" />}
              </g>
              {isFresh && <rect x={b.x} y={b.y + BH} width={BW} height={0.5} fill="#b0cc86" className="app-home-wall-new" />}
            </g>
          );
        })}
      </svg>
      <span id="app-home-wall-hint" className="sr-only">
        {w.hint}
      </span>
      <Link href={href} transitionTypes={["app-open"]} className="app-home-wall-readout" aria-live="polite">
        <span className="app-home-wall-msg" data-empty={!hasAny && !cur ? "" : undefined}>
          {hasAny || cur || activity ? msg : w.empty}
        </span>
        <span className="app-home-wall-meta" suppressHydrationWarning>
          {meta}
        </span>
      </Link>
    </div>
  );
}
