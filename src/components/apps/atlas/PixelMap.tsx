"use client";

import { useEffect, useRef } from "react";
import type { PlaceRow } from "@/lib/content";
import { usePlaces } from "@/components/os/SiteData";
import { tileFor } from "./geo";
import { TILE_H, TILE_W } from "./landmass";

type RGB = [number, number, number];
const hex = (h: string): RGB => [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16)];

const SEA_DEEP = hex("#090c27");
const SEA = hex("#0d1233");
const SHALLOW = hex("#152054");
const SURF = hex("#22327a");
const WAVE = hex("#121a48");
const GRID = hex("#18215a");
const LAND_LO = hex("#4a50a8");
const LAND = hex("#5c64c2");
const LAND_HI = hex("#7880dc");
const COAST = hex("#aea3c8");
const SHADOW = hex("#3a3f8e");
const INK = hex("#0a0c0b");
const MARK: Record<string, RGB> = { home: hex("#b0cc86"), been: hex("#e0bd6e"), want: hex("#89b4a8") };

const BAYER = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5];
const bayer = (x: number, y: number) => (BAYER[((y & 3) << 2) | (x & 3)] + 0.5) / 16;

/** Paints the postcard map of a place (and the others in its frame) into a TILE_W × TILE_H canvas. */
function paintMap(place: PlaceRow, others: readonly PlaceRow[], ctx: CanvasRenderingContext2D) {
  const W = TILE_W;
  const H = TILE_H;
  const tile = tileFor(place);
  const land = tile.land;
  const at = (x: number, y: number) => (x < 0 || y < 0 || x >= W || y >= H ? 0 : land[y * W + x]);

  // distance to the coast, in pixels, up to 3 (sea side only)
  const near = new Uint8Array(W * H).fill(9);
  for (let y = 0; y < H; y++)
    for (let x = 0; x < W; x++) {
      if (at(x, y)) continue;
      let best = 9;
      for (let dy = -3; dy <= 3; dy++)
        for (let dx = -3; dx <= 3; dx++) {
          if (!at(x + dx, y + dy)) continue;
          const d = Math.max(Math.abs(dx), Math.abs(dy));
          if (d < best) best = d;
        }
      near[y * W + x] = best;
    }

  const img = ctx.createImageData(W, H);
  const d = img.data;
  const put = (x: number, y: number, c: RGB) => {
    if (x < 0 || y < 0 || x >= W || y >= H) return;
    const i = (y * W + x) * 4;
    d[i] = c[0];
    d[i + 1] = c[1];
    d[i + 2] = c[2];
    d[i + 3] = 255;
  };

  // graticule step: 5° for close-ups, 10° for continents
  const step = tile.dLon * W > 40 ? 10 : 5;
  const isGrid = (x: number, y: number) => {
    const lon = tile.west + (x + 0.5) * tile.dLon;
    const lat = tile.north - (y + 0.5) * tile.dLat;
    const gx = Math.abs(lon / step - Math.round(lon / step)) * step < tile.dLon / 2;
    const gy = Math.abs(lat / step - Math.round(lat / step)) * step < tile.dLat / 2;
    return (gx && y % 2 === 0) || (gy && x % 2 === 0);
  };

  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const b = bayer(x, y);
      // light falls from the top left
      const lightT = 1 - (x / W) * 0.55 - (y / H) * 0.45;
      if (at(x, y)) {
        const lit = !at(x - 1, y) || !at(x, y - 1);
        const shade = !at(x + 1, y) || !at(x, y + 1);
        if (lit) put(x, y, COAST);
        else if (shade) put(x, y, SHADOW);
        else put(x, y, lightT * 1.4 - 0.2 > b ? (lightT > 0.72 && b < 0.3 ? LAND_HI : LAND) : LAND_LO);
      } else {
        const n = near[y * W + x];
        if (n === 1) put(x, y, b < 0.5 ? SURF : SHALLOW);
        else if (n === 2) put(x, y, b < 0.55 ? SHALLOW : SEA);
        else if (isGrid(x, y)) put(x, y, GRID);
        else if (y % 4 === 1 && (x + (y >> 2) * 5) % 11 < 2) put(x, y, WAVE);
        else put(x, y, lightT * 0.9 > b ? SEA : SEA_DEEP);
      }
    }
  }

  // every place inside the frame; this one last and largest
  const px = (p: PlaceRow) => ({
    x: Math.floor((p.lon - tile.west) / tile.dLon),
    y: Math.floor((tile.north - p.lat) / tile.dLat),
  });
  for (const p of others) {
    if (p.id === place.id) continue;
    const { x, y } = px(p);
    if (x < 1 || y < 1 || x >= W - 1 || y >= H - 1) continue;
    const c = MARK[p.home ? "home" : p.status];
    put(x, y, c);
    put(x + 1, y, c);
    put(x, y + 1, c);
    put(x + 1, y + 1, c);
  }
  const { x, y } = px(place);
  const c = MARK[place.home ? "home" : place.status];
  for (let dy = -3; dy <= 3; dy++)
    for (let dx = -3; dx <= 3; dx++) {
      const r = Math.max(Math.abs(dx), Math.abs(dy));
      if (place.status === "want") {
        if (r === 2) put(x + dx, y + dy, c);
        else if (r === 3 || r === 1) put(x + dx, y + dy, INK);
      } else if (r <= 1) put(x + dx, y + dy, c);
      else if (r === 2) put(x + dx, y + dy, INK);
    }
  if (place.status !== "want") put(x, y, INK);

  ctx.putImageData(img, 0, 0);
}

/** A crisp pixel map of a place, drawn once (static canvas). The other
    markers in the frame are the site's places unless `places` is given. */
export function PixelMap({ place, places, className = "" }: { place: PlaceRow; places?: readonly PlaceRow[]; className?: string }) {
  const ref = useRef<HTMLCanvasElement>(null);
  const site = usePlaces();
  const others = places ?? site;
  useEffect(() => {
    const ctx = ref.current?.getContext("2d");
    if (ctx) paintMap(place, others, ctx);
  }, [place, others]);
  return <canvas ref={ref} width={TILE_W} height={TILE_H} aria-hidden className={className} />;
}
