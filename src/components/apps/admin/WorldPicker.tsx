"use client";

import { useEffect, useRef } from "react";
import type { PlaceRow } from "@/lib/content";
import { isLand } from "@/components/apps/atlas/geo";

/**
 * Click the world to place a pin. Two pixel maps from the Atlas's land
 * grid: the whole world, and a loupe 30° wide around the pin for the last
 * few kilometres. Arrow keys nudge the pin (Shift: ten times more).
 */

type View = { west: number; north: number; spanLon: number; spanLat: number };

const SEA: [number, number, number] = [16, 19, 17];
const SEA_GRID: [number, number, number] = [24, 29, 26];
const LAND: [number, number, number] = [63, 72, 66];
const LAND_HI: [number, number, number] = [86, 97, 89];
const MARK = { home: "#b0cc86", been: "#e0bd6e", want: "#89b4a8", pin: "#e2786b" };

const WORLD: View = { west: -180, north: 90, spanLon: 360, spanLat: 180 };
const round = (n: number) => Math.round(n * 100) / 100;
const clamp = (n: number, a: number, b: number) => Math.max(a, Math.min(b, n));
const wrap = (lon: number) => ((((lon + 180) % 360) + 360) % 360) - 180;

function loupeView(lat: number, lon: number): View {
  const spanLon = 30;
  const spanLat = 15;
  return { west: lon - spanLon / 2, north: clamp(lat + spanLat / 2, -90 + spanLat, 90), spanLon, spanLat };
}

function paint(canvas: HTMLCanvasElement, view: View, places: readonly PlaceRow[], pin: { lat: number; lon: number } | null, selected?: string) {
  const W = canvas.width;
  const H = canvas.height;
  const ctx = canvas.getContext("2d");
  if (!ctx) return;
  const img = ctx.createImageData(W, H);
  const d = img.data;
  const gridEvery = view.spanLon > 90 ? 30 : 5;
  for (let y = 0; y < H; y++) {
    const lat = view.north - ((y + 0.5) / H) * view.spanLat;
    for (let x = 0; x < W; x++) {
      const lon = wrap(view.west + ((x + 0.5) / W) * view.spanLon);
      const land = isLand(lat, lon);
      // a lit northern edge on land, a faint graticule at sea
      const above = land && !isLand(lat + view.spanLat / H, lon);
      const onGrid =
        Math.abs((lon / gridEvery) % 1) < view.spanLon / W / gridEvery || Math.abs((lat / gridEvery) % 1) < view.spanLat / H / gridEvery;
      const c = land ? (above ? LAND_HI : LAND) : onGrid ? SEA_GRID : SEA;
      const i = (y * W + x) * 4;
      d[i] = c[0];
      d[i + 1] = c[1];
      d[i + 2] = c[2];
      d[i + 3] = 255;
    }
  }
  ctx.putImageData(img, 0, 0);

  const toXY = (lat: number, lon: number) => {
    let dx = lon - view.west;
    if (dx < 0) dx += 360;
    if (dx > 360) dx -= 360;
    return { x: (dx / view.spanLon) * W, y: ((view.north - lat) / view.spanLat) * H };
  };
  const s = Math.max(2, Math.round(W / 180));
  for (const p of places) {
    if (p.id === selected) continue;
    const { x, y } = toXY(p.lat, p.lon);
    if (x < -s || y < -s || x > W + s || y > H + s) continue;
    ctx.fillStyle = p.home ? MARK.home : p.status === "been" ? MARK.been : MARK.want;
    ctx.fillRect(Math.round(x - s / 2), Math.round(y - s / 2), s, s);
  }
  if (pin) {
    const { x, y } = toXY(pin.lat, pin.lon);
    const r = s * 2;
    ctx.fillStyle = MARK.pin;
    ctx.fillRect(Math.round(x) - r, Math.round(y), r * 2 + 1, 1);
    ctx.fillRect(Math.round(x), Math.round(y) - r, 1, r * 2 + 1);
    ctx.fillRect(Math.round(x - s / 2), Math.round(y - s / 2), s + 1, s + 1);
  }
}

export function WorldPicker({
  places,
  value,
  selected,
  onChange,
  label,
}: {
  places: readonly PlaceRow[];
  value: { lat: number; lon: number } | null;
  selected?: string;
  onChange: (v: { lat: number; lon: number }) => void;
  label: string;
}) {
  const world = useRef<HTMLCanvasElement>(null);
  const loupe = useRef<HTMLCanvasElement>(null);
  const lv = value ? loupeView(value.lat, value.lon) : null;

  useEffect(() => {
    if (world.current) paint(world.current, WORLD, places, value, selected);
    if (loupe.current && value) paint(loupe.current, loupeView(value.lat, value.lon), places, value, selected);
  }, [places, value, selected]);

  const pick = (view: View) => (e: React.PointerEvent<HTMLCanvasElement>) => {
    const r = e.currentTarget.getBoundingClientRect();
    const fx = clamp((e.clientX - r.left) / r.width, 0, 1);
    const fy = clamp((e.clientY - r.top) / r.height, 0, 1);
    onChange({ lat: round(clamp(view.north - fy * view.spanLat, -90, 90)), lon: round(wrap(view.west + fx * view.spanLon)) });
  };

  const onKey = (step: number) => (e: React.KeyboardEvent) => {
    if (!value) return;
    const k = e.shiftKey ? step * 10 : step;
    const moves: Record<string, [number, number]> = { ArrowUp: [k, 0], ArrowDown: [-k, 0], ArrowLeft: [0, -k], ArrowRight: [0, k] };
    const m = moves[e.key];
    if (!m) return;
    e.preventDefault();
    onChange({ lat: round(clamp(value.lat + m[0], -90, 90)), lon: round(wrap(value.lon + m[1])) });
  };

  return (
    <div className="app-admin-map">
      <canvas
        ref={world}
        width={360}
        height={180}
        className="app-admin-map-world"
        role="slider"
        tabIndex={0}
        aria-label={label}
        aria-valuemin={-180}
        aria-valuemax={180}
        aria-valuenow={value?.lon ?? 0}
        aria-valuetext={value ? `${value.lat}, ${value.lon}` : undefined}
        onPointerDown={pick(WORLD)}
        onKeyDown={onKey(1)}
      />
      {lv && (
        <canvas
          ref={loupe}
          width={240}
          height={120}
          className="app-admin-map-loupe"
          role="slider"
          tabIndex={0}
          aria-label={label}
          aria-valuemin={-180}
          aria-valuemax={180}
          aria-valuenow={value?.lon ?? 0}
          aria-valuetext={value ? `${value.lat}, ${value.lon}` : undefined}
          onPointerDown={pick(lv)}
          onKeyDown={onKey(0.05)}
        />
      )}
    </div>
  );
}
