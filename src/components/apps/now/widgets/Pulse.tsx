"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useI18n } from "@/i18n/client";
import { useHydrated, useReduced } from "@/hooks/env";
import type { PushHistory } from "@/lib/github";
import { RollText } from "../bits";
import { fill, useNow, useOnScreen } from "../lib";

/** 13 weeks: about all the public events API remembers */
const MAX_DAYS = 91;

const dayFmt = new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Paris", year: "numeric", month: "2-digit", day: "2-digit" });
/** YYYY-MM-DD ± n days (calendar arithmetic, no time zone drift) */
function shift(d: string, n: number) {
  const t = Date.UTC(+d.slice(0, 4), +d.slice(5, 7) - 1, +d.slice(8, 10)) + n * 86_400_000;
  return new Date(t).toISOString().slice(0, 10);
}
const noon = (d: string) => new Date(`${d}T12:00:00Z`);
/** Monday = 0 … Sunday = 6 */
const weekday = (d: string) => (noon(d).getUTCDay() + 6) % 7;

type Day = { d: string; n: number; repo: string };

/** Every day from the first one the API remembers (`most` at most) to today, pushes or not. */
function daysOf(pushes: PushHistory, today: string, most: number): Day[] {
  const by = new Map(pushes.days.map((x) => [x.d, x]));
  let start = shift(today, -(most - 1));
  if (pushes.since && pushes.since > start) start = pushes.since;
  const out: Day[] = [];
  for (let d = start; d <= today; d = shift(d, 1)) {
    const p = by.get(d);
    out.push({ d, n: p?.n ?? 0, repo: p?.repo ?? "" });
  }
  return out;
}

/** What the days add up to: the total, the busiest weekday, the longest run of days in a row. */
function factsOf(days: Day[]) {
  const total = days.reduce((s, x) => s + x.n, 0);
  const byWeekday = Array<number>(7).fill(0);
  for (const x of days) byWeekday[weekday(x.d)] += x.n;
  let run = 0;
  let best = 0;
  for (const x of days) {
    run = x.n > 0 ? run + 1 : 0;
    best = Math.max(best, run);
  }
  return { total, busiest: total ? byWeekday.indexOf(Math.max(...byWeekday)) : -1, best };
}

/** The chart's geometry for a box: whole-pixel bars, today on the right edge. */
function geometry(n: number, width: number, height: number, max: number) {
  const pitch = Math.max(3, Math.min(14, Math.floor(width / Math.max(1, n))));
  const gap = pitch >= 7 ? 2 : 1;
  const bar = pitch - gap;
  // square cells by default, taller when the busiest day leaves the room
  const cell = Math.max(Math.max(2, bar), Math.min(bar * 4, Math.floor((height * 0.92 + gap) / Math.max(1, max)) - gap));
  const room = Math.max(1, Math.floor((height + gap) / (cell + gap)));
  return { pitch, gap, bar, cell, per: Math.max(1, Math.ceil(max / room)), left: width - n * pitch + gap };
}

/**
 * The pulse: every day of the last 13 weeks (as many as fit on a phone) as
 * a column of pixel blocks, one block a public push (or a few, on a very
 * busy stretch), today on the right. Above it, the total and two things the days say: the busiest
 * weekday and the longest run of days in a row. Scrub the chart (hover,
 * drag a finger, or the arrow keys) and the big number rolls to that
 * day's count. The columns rise once when they come into view; nothing
 * moves at rest.
 */
export function Pulse({ pushes }: { pushes: PushHistory | null }) {
  const { t, lang } = useI18n();
  const p = t.now.pulse;
  const reduced = useReduced();
  const hydrated = useHydrated();
  const now = useNow(3_600_000);
  const plotRef = useRef<HTMLDivElement>(null);
  const on = useOnScreen(plotRef, "-40px");
  const [box, setBox] = useState({ w: 0, h: 0 });
  const [risen, setRisen] = useState(false);
  const [sel, setSel] = useState<number | null>(null);
  const [said, setSaid] = useState("");
  const locale = lang === "fr" ? "fr-FR" : "en-GB";

  // today in Toulouse once mounted; the newest day the server sent before that (hydration-safe)
  const today = hydrated && now ? dayFmt.format(now) : (pushes?.days[0]?.d ?? null);
  // as many days as fit at 4 px a column or more (a phone shows a little under 13 weeks)
  const most = box.w ? Math.min(MAX_DAYS, Math.floor((box.w + 1) / 4)) : MAX_DAYS;
  const days = useMemo(() => (pushes && today ? daysOf(pushes, today, most) : []), [pushes, today, most]);
  const facts = useMemo(() => factsOf(days), [days]);
  const max = days.reduce((m, x) => Math.max(m, x.n), 0);

  useEffect(() => {
    const el = plotRef.current;
    if (!el) return;
    const ro = new ResizeObserver(([e]) => setBox({ w: Math.floor(e.contentRect.width), h: Math.floor(e.contentRect.height) }));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // the columns rise the first time the chart is seen, then stay
  useEffect(() => {
    if (!on || risen || !box.w) return;
    const id = window.setTimeout(() => setRisen(true), 60);
    return () => window.clearTimeout(id);
  }, [on, risen, box.w]);

  // a tap elsewhere puts the summary back (touch keeps the day it last showed)
  useEffect(() => {
    if (sel == null) return;
    const off = (e: PointerEvent) => {
      if (!plotRef.current?.contains(e.target as Node)) setSel(null);
    };
    document.addEventListener("pointerdown", off);
    return () => document.removeEventListener("pointerdown", off);
  }, [sel]);

  const geo = box.w && days.length ? geometry(days.length, box.w, box.h, max) : null;
  const at = (clientX: number) => {
    const el = plotRef.current;
    if (!el || !geo) return null;
    const x = clientX - el.getBoundingClientRect().left - geo.left;
    return Math.max(0, Math.min(days.length - 1, Math.floor(x / geo.pitch)));
  };

  const dateLong = new Intl.DateTimeFormat(locale, { day: "numeric", month: "long", timeZone: "UTC" });
  const dateDay = new Intl.DateTimeFormat(locale, { weekday: "short", day: "numeric", month: "short", timeZone: "UTC" });
  const monthFmt = new Intl.DateTimeFormat(locale, { month: "short", timeZone: "UTC" });
  const weekdayName = (i: number) => new Intl.DateTimeFormat(locale, { weekday: "long", timeZone: "UTC" }).format(noon(shift("2024-01-01", i)));
  const unit = (n: number) => (n === 1 ? p.unitOne : p.unit);

  const day = sel != null ? days[sel] : null;
  const shown = day ? day.n : facts.total;
  const summary = days.length ? fill(p.since, { unit: unit(facts.total), date: dateLong.format(noon(days[0].d)) }) : "";
  const caption = day
    ? fill(p.on, { unit: unit(day.n), date: dateDay.format(noon(day.d)) }) + (day.n && day.repo ? ` · ${day.repo}` : "")
    : summary;
  const sayDay = (i: number) => {
    const x = days[i];
    setSaid(`${x.n} ${fill(p.on, { unit: unit(x.n), date: dateDay.format(noon(x.d)) })}${x.n && x.repo ? `, ${x.repo}` : ""}`);
  };

  const onKeyDown = (e: React.KeyboardEvent) => {
    const last = days.length - 1;
    const from = sel ?? last + 1;
    const to =
      e.key === "ArrowLeft" ? from - 1 : e.key === "ArrowRight" ? (sel == null ? last : sel + 1) : e.key === "Home" ? 0 : e.key === "End" ? last : null;
    if (to != null) {
      e.preventDefault();
      const k = Math.max(0, Math.min(last, to));
      setSel(k);
      sayDay(k);
    } else if (e.key === "Escape" && sel != null) {
      e.preventDefault();
      e.stopPropagation();
      setSel(null);
    }
  };

  // month labels where months begin, left to right, none touching "today" or each other
  const ticks: { label: string; x: number }[] = [];
  if (geo) {
    const ch = 7.4; // mono 12px, per character
    const end = box.w - p.today.length * ch - 12;
    let next = 0;
    days.forEach((x, i) => {
      if (i === 0 || !x.d.endsWith("-01")) return;
      const label = monthFmt.format(noon(x.d)).replace(/\.$/, "");
      const lx = geo.left + i * geo.pitch;
      if (lx < next || lx + label.length * ch > end) return;
      ticks.push({ label, x: lx });
      next = lx + label.length * ch + 12;
    });
  }

  if (!pushes || !days.length) {
    return (
      <div className="app-now-pulse">
        <p className="app-now-muted">{p.empty}</p>
      </div>
    );
  }

  return (
    <div className="app-now-pulse" data-scrub={sel != null || undefined}>
      <div className="app-now-pulse-head">
        <p className="app-now-pulse-stat">
          <span className="sr-only">
            {facts.total} {summary}
          </span>
          <RollText text={String(shown)} className="app-now-pulse-n" />
          <span className="app-now-pulse-caption" aria-hidden>
            {caption}
          </span>
        </p>
        {facts.total > 0 && (
          <dl className="app-now-pulse-facts">
            <div>
              <dt>{p.busiest}</dt>
              <dd>{weekdayName(facts.busiest)}</dd>
            </div>
            <div>
              <dt>{p.longest}</dt>
              <dd>{facts.best === 1 ? p.dayOne : fill(p.days, { n: facts.best })}</dd>
            </div>
          </dl>
        )}
      </div>

      <div className="app-now-pulse-chart">
        <div
          ref={plotRef}
          className="app-now-pulse-plot"
          role="group"
          tabIndex={0}
          aria-label={fill(p.label, { date: dateLong.format(noon(days[0].d)) })}
          data-no-drag
          data-risen={risen || reduced || undefined}
          onPointerMove={(e) => {
            if (e.pointerType === "mouse" || e.buttons) setSel(at(e.clientX));
          }}
          onPointerDown={(e) => {
            if (e.pointerType === "mouse") return;
            const k = at(e.clientX);
            setSel((v) => (v === k ? null : k));
          }}
          onPointerLeave={(e) => {
            if (e.pointerType === "mouse") setSel(null);
          }}
          onKeyDown={onKeyDown}
          onBlur={() => setSel(null)}
        >
          {geo && (
            <div className="app-now-pulse-bars" style={{ paddingLeft: geo.left, gap: geo.gap }}>
              {days.map((x, i) => (
                <span
                  key={x.d}
                  className="app-now-pulse-col"
                  data-zero={x.n ? undefined : ""}
                  data-on={sel === i || undefined}
                  style={{ width: geo.bar, "--k": i } as React.CSSProperties}
                >
                  {/* a day without a push is a 2 px tick on the baseline, not a block */}
                  <i
                    style={
                      x.n
                        ? {
                            height: Math.ceil(x.n / geo.per) * (geo.cell + geo.gap) - geo.gap,
                            backgroundSize: `100% ${geo.cell + geo.gap}px`,
                            backgroundImage: `linear-gradient(0deg, currentColor 0 ${geo.cell}px, transparent ${geo.cell}px)`,
                          }
                        : { height: 2, background: "currentColor" }
                    }
                  />
                </span>
              ))}
            </div>
          )}
        </div>
        <div className="app-now-pulse-axis" aria-hidden>
          {ticks.map((tk) => (
            <span key={tk.label} style={{ left: tk.x }}>
              {tk.label}
            </span>
          ))}
          <span className="app-now-pulse-today">{p.today}</span>
        </div>
      </div>
      <p className="sr-only" aria-live="polite">
        {said}
      </p>
    </div>
  );
}
