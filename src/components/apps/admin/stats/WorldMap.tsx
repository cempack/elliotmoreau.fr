"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { worldGrid } from "@/components/apps/atlas/land";
import { WORLD_H, WORLD_W } from "@/components/apps/atlas/landmass";
import type { StatsRow } from "../api";
import { countryAt } from "./countries";

/** the map's frame: 2° cells, from the Arctic down to Cape Horn (no Antarctica) */
const CELL = 2;
const NORTH = 80;
const SOUTH = -58;
const COLS = 360 / CELL;
const ROWS = (NORTH - SOUTH) / CELL;

/** which 2° cells are land (any of the 0.5° grid's under them) */
function landCells() {
  const g = worldGrid();
  const k = (WORLD_W / 360) * CELL;
  const out = new Uint8Array(COLS * ROWS);
  const row0 = Math.round((90 - NORTH) * (WORLD_H / 180));
  for (let r = 0; r < ROWS; r++)
    for (let c = 0; c < COLS; c++) {
      let n = 0;
      for (let j = 0; j < k; j++) for (let i = 0; i < k; i++) n += g[(row0 + r * k + j) * WORLD_W + c * k + i];
      out[r * COLS + c] = n >= (k * k) / 3 ? 1 : 0;
    }
  return out;
}
let land: Uint8Array | null = null;

type Strings = { tipVisitors: string; tipVisitorsOne: string; tipViews: string; showOnly: string };

/**
 * Where visitors are: the world in the Atlas's pixels, a dot on each
 * country sized by its visitors (the area, not the radius, grows with
 * them), the biggest underneath. Hover a dot for its figures; click it to
 * show only that country. The ranked list beside it carries the same
 * figures for keyboards and screen readers.
 */
export function WorldMap({
  rows,
  name,
  fmt,
  s,
  active,
  onPick,
}: {
  rows: StatsRow[];
  name: (code: string) => string;
  fmt: (n: number) => string;
  s: Strings;
  active?: string;
  onPick: (code: string) => void;
}) {
  const wrap = useRef<HTMLDivElement>(null);
  const canvas = useRef<HTMLCanvasElement>(null);
  const [w, setW] = useState(0);
  const [hover, setHover] = useState<string | null>(null);
  const h = Math.round((w * ROWS) / COLS);

  useEffect(() => {
    const el = wrap.current;
    if (!el) return;
    const ro = new ResizeObserver(([e]) => setW(Math.round(e.contentRect.width)));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // the land, once per size: one square per cell, a hairline apart
  useEffect(() => {
    const cv = canvas.current;
    if (!cv || !w) return;
    land ??= landCells();
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    cv.width = Math.round(w * dpr);
    cv.height = Math.round(h * dpr);
    const ctx = cv.getContext("2d");
    if (!ctx) return;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, w, h);
    ctx.fillStyle = getComputedStyle(cv).color;
    const cw = w / COLS;
    const gap = cw > 3 ? 1 : 0.5;
    for (let r = 0; r < ROWS; r++)
      for (let c = 0; c < COLS; c++) if (land[r * COLS + c]) ctx.fillRect(c * cw, r * cw, cw - gap, cw - gap);
  }, [w, h]);

  const max = Math.max(1, ...rows.map((r) => r.visitors));
  const dots = useMemo(
    () =>
      rows
        .map((r) => {
          const at = countryAt(r.key);
          if (!at) return null;
          const [lat, lon] = at;
          return { ...r, x: ((lon + 180) / 360) * w, y: ((NORTH - Math.max(SOUTH, Math.min(NORTH, lat))) / (NORTH - SOUTH)) * h, r: 3 + 11 * Math.sqrt(r.visitors / max) };
        })
        .filter((d): d is NonNullable<typeof d> => !!d)
        .sort((a, b) => b.r - a.r),
    [rows, w, h, max]
  );
  const tip = hover ? dots.find((d) => d.key === hover) : null;

  return (
    <div ref={wrap} className="st-map" style={{ height: h || undefined }}>
      <canvas ref={canvas} className="st-map-land" style={{ width: w, height: h }} aria-hidden />
      {w > 0 && (
        <svg className="st-map-dots" width={w} height={h} viewBox={`0 0 ${w} ${h}`} aria-hidden>
          {dots.map((d) => (
            <g key={d.key} data-on={hover === d.key || active === d.key || undefined}>
              <circle cx={d.x} cy={d.y} r={d.r} className="st-map-dot" />
              {/* a hit area bigger than the dot */}
              <circle
                cx={d.x}
                cy={d.y}
                r={Math.max(12, d.r + 4)}
                className="st-map-hit"
                onPointerEnter={() => setHover(d.key)}
                onPointerLeave={() => setHover((k) => (k === d.key ? null : k))}
                onClick={() => onPick(d.key)}
              >
                <title>{s.showOnly}</title>
              </circle>
            </g>
          ))}
        </svg>
      )}
      {tip && (
        <div className="st-tip" style={{ left: `${(tip.x / w) * 100}%`, top: `${tip.y - tip.r - 6}px` }} data-place="above" data-side={tip.x / w > 0.75 ? "left" : tip.x / w < 0.25 ? "right" : undefined}>
          <span className="st-tip-when">{name(tip.key)}</span>
          <strong>{tip.visitors === 1 ? s.tipVisitorsOne : s.tipVisitors.replace("{n}", fmt(tip.visitors))}</strong>
          <span>{s.tipViews.replace("{n}", fmt(tip.views))}</span>
        </div>
      )}
    </div>
  );
}
