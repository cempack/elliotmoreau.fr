import type { PlaceRow } from "@/lib/content";
import { TILES, TILE_H, TILE_W, WORLD, WORLD_H, WORLD_W } from "./landmass";

/* ───────────────────────────── landmass ─────────────────────────────
   The baked land (landmass.ts, ~50 KB) behind its own module, so pages
   that only want the Atlas's maths (distances, bearings) never ship it. */

const RAD = Math.PI / 180;

function unpack(b64: string, n: number) {
  const bin = atob(b64);
  const out = new Uint8Array(n);
  for (let i = 0; i < n; i++) out[i] = (bin.charCodeAt(i >> 3) >> (i & 7)) & 1;
  return out;
}

let world: Uint8Array | null = null;
/** 1° land grid (client only: uses atob). */
export function worldGrid() {
  if (!world) world = unpack(WORLD, WORLD_W * WORLD_H);
  return world;
}

export function isLand(lat: number, lon: number) {
  const g = worldGrid();
  const x = Math.min(WORLD_W - 1, Math.max(0, Math.floor(((((lon + 180) % 360) + 360) % 360) * (WORLD_W / 360))));
  const y = Math.min(WORLD_H - 1, Math.max(0, Math.floor((90 - lat) * (WORLD_H / 180))));
  return g[y * WORLD_W + x] === 1;
}

export type TileGeo = { w: number; h: number; west: number; north: number; dLon: number; dLat: number; land: Uint8Array };

/** The postcard map for a place: the baked tile, or one sampled from the
    world grid for places added after the bake. */
export function tileFor(p: PlaceRow): TileGeo {
  const t = TILES[p.id];
  const span = t?.span ?? 24;
  const lat = t?.lat ?? p.lat;
  const lon = t?.lon ?? p.lon;
  const dLon = span / TILE_W;
  const dLat = dLon * Math.cos(lat * RAD);
  const west = lon - (TILE_W / 2) * dLon;
  const north = lat + (TILE_H / 2) * dLat;
  let land: Uint8Array;
  if (t) land = unpack(t.bits, TILE_W * TILE_H);
  else {
    land = new Uint8Array(TILE_W * TILE_H);
    for (let y = 0; y < TILE_H; y++)
      for (let x = 0; x < TILE_W; x++) land[y * TILE_W + x] = isLand(north - (y + 0.5) * dLat, west + (x + 0.5) * dLon) ? 1 : 0;
  }
  return { w: TILE_W, h: TILE_H, west, north, dLon, dLat, land };
}
