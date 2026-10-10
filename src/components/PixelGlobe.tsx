"use client";

import { useEffect, useRef } from "react";
import { feature } from "topojson-client";
import type { Topology, GeometryObject } from "topojson-specification";
import land110 from "world-atlas/land-110m.json";
import type { Place } from "@/lib/places";

const LAND_W = 360;
const LAND_H = 180;
// land inks, dim → bright: indigo plains, a few ion and lilac highlights
const GREENS = ["#33376A", "#4A5096", "#8BE9FF", "#B3A4FF"];

let landGrid: Uint8Array | null = null;

function getLandGrid(): Uint8Array {
  if (landGrid) return landGrid;
  const canvas = document.createElement("canvas");
  canvas.width = LAND_W;
  canvas.height = LAND_H;
  const g = canvas.getContext("2d", { willReadFrequently: true })!;
  g.fillStyle = "#000";
  g.fillRect(0, 0, LAND_W, LAND_H);
  g.fillStyle = "#fff";
  const topo = land110 as unknown as Topology;
  const landGeom = (topo.objects as unknown as { land: GeometryObject }).land;
  const geo = feature(topo, landGeom) as unknown as
    | GeoJSON.FeatureCollection
    | GeoJSON.Feature
    | GeoJSON.Geometry;
  const polys: number[][][][] = [];
  const pushGeom = (geom: GeoJSON.Geometry) => {
    if (geom.type === "Polygon") polys.push(geom.coordinates as number[][][]);
    else if (geom.type === "MultiPolygon") polys.push(...(geom.coordinates as number[][][][]));
  };
  if (geo.type === "FeatureCollection") {
    for (const f of geo.features) pushGeom(f.geometry);
  } else if (geo.type === "Feature") {
    pushGeom(geo.geometry);
  } else {
    pushGeom(geo);
  }
  const X = (lon: number) => ((lon + 180) / 360) * LAND_W;
  const Y = (lat: number) => ((90 - lat) / 180) * LAND_H;
  for (const poly of polys) {
    for (const ring of poly) {
      g.beginPath();
      let px = 0;
      ring.forEach(([lon, lat], i) => {
        const x = X(lon);
        const y = Y(lat);
        if (i === 0 || Math.abs(x - px) > LAND_W / 2) g.moveTo(x, y);
        else g.lineTo(x, y);
        px = x;
      });
      g.closePath();
      g.fill();
    }
  }
  const img = g.getImageData(0, 0, LAND_W, LAND_H).data;
  landGrid = new Uint8Array(LAND_W * LAND_H);
  for (let i = 0; i < landGrid.length; i++) landGrid[i] = img[i * 4] > 128 ? 1 : 0;
  return landGrid;
}

function landAt(lat: number, lon: number): boolean {
  const grid = getLandGrid();
  const x = Math.min(LAND_W - 1, Math.max(0, Math.floor(((lon + 180) / 360) * LAND_W)));
  const y = Math.min(LAND_H - 1, Math.max(0, Math.floor(((90 - lat) / 180) * LAND_H)));
  return grid[y * LAND_W + x] === 1;
}

function hash(n: number) {
  let h = (n * 1664525 + 1013904223) >>> 0;
  h ^= h >>> 15;
  h = (h * 2246822519) >>> 0;
  h ^= h >>> 13;
  return (h >>> 0) / 4294967296;
}

type Dot = { lat: number; lon: number; ink: string; big: boolean };

function buildDots(): Dot[] {
  // fibonacci sphere, land only
  const N = 5200;
  const dots: Dot[] = [];
  const golden = Math.PI * (3 - Math.sqrt(5));
  for (let i = 0; i < N; i++) {
    const y = 1 - (i / (N - 1)) * 2;
    const r = Math.sqrt(Math.max(0, 1 - y * y));
    const th = golden * i;
    const x = Math.cos(th) * r;
    const z = Math.sin(th) * r;
    const lat = Math.asin(Math.max(-1, Math.min(1, y))) * (180 / Math.PI);
    const lon = Math.atan2(z, x) * (180 / Math.PI);
    if (!landAt(lat, lon)) continue;
    const h = hash(i);
    dots.push({
      lat,
      lon,
      ink: GREENS[Math.min(GREENS.length - 1, Math.floor(h * h * GREENS.length + 0.6))],
      big: h > 0.9,
    });
  }
  return dots;
}

const project = (
  lat: number,
  lon: number,
  yaw: number,
  tilt: number,
  R: number,
  cx: number,
  cy: number
) => {
  const phi = ((90 - lat) * Math.PI) / 180;
  const theta = ((lon + 180) * Math.PI) / 180;
  const x = -Math.sin(phi) * Math.cos(theta);
  const y = Math.cos(phi);
  const z = Math.sin(phi) * Math.sin(theta);
  const x1 = x * Math.cos(yaw) + z * Math.sin(yaw);
  const z1 = -x * Math.sin(yaw) + z * Math.cos(yaw);
  const y2 = y * Math.cos(tilt) - z1 * Math.sin(tilt);
  const z2 = y * Math.sin(tilt) + z1 * Math.cos(tilt);
  return { x: cx + x1 * R, y: cy - y2 * R, z: z2 };
};

const yawFor = (lat: number, lon: number) => {
  const phi = ((90 - lat) * Math.PI) / 180;
  const theta = ((lon + 180) * Math.PI) / 180;
  const x = -Math.sin(phi) * Math.cos(theta);
  const z = Math.sin(phi) * Math.sin(theta);
  let yaw = Math.atan2(-x, z);
  // ensure front-facing
  const z1 = -x * Math.sin(yaw) + z * Math.cos(yaw);
  if (z1 < 0) yaw += Math.PI;
  return yaw;
};

export function PixelGlobe({
  places,
  selectedId,
  onSelect,
}: {
  places: Place[];
  selectedId: string | null;
  onSelect: (id: string) => void;
}) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const cb = useRef({ selectedId, onSelect });
  const easeRef = useRef<() => void>(() => {});
  useEffect(() => {
    cb.current = { selectedId, onSelect };
  });

  useEffect(() => {
    const wrap = wrapRef.current!;
    const cvs = canvasRef.current!;
    const ctx = cvs.getContext("2d")!;
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const dots = buildDots();

    const st = {
      yaw: 0,
      tilt: -0.42,
      targetYaw: null as number | null,
      easeT: 0,
      fromYaw: 0,
      lastDrag: 0,
      dragging: false,
      raf: 0,
    };
    const faceSelected = (animate: boolean) => {
      const p = places.find((pl) => pl.id === cb.current.selectedId);
      const target = p ? yawFor(p.lat, p.lon) : yawFor(46.6, 1.9);
      const twoPi = Math.PI * 2;
      let d = (target - st.yaw) % twoPi;
      if (d > Math.PI) d -= twoPi;
      if (d < -Math.PI) d += twoPi;
      if (!animate || reduced) {
        st.yaw += d;
        st.targetYaw = null;
      } else {
        st.fromYaw = st.yaw;
        st.targetYaw = st.yaw + d;
        st.easeT = 0;
      }
    };
    faceSelected(false);
    easeRef.current = () => faceSelected(true);

    const layout = () => {
      const w = wrap.clientWidth;
      const h = wrap.clientHeight;
      cvs.width = Math.round(w * dpr);
      cvs.height = Math.round(h * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    };
    layout();
    window.addEventListener("resize", layout);

    const t0 = performance.now();
    const paint = (now: number) => {
      const t = (now - t0) / 1000;
      const w = wrap.clientWidth;
      const h = wrap.clientHeight;
      const R = Math.min(w, h) / 2 - 26;
      const cx = w / 2;
      const cy = h / 2;
      ctx.clearRect(0, 0, w, h);

      if (st.targetYaw !== null) {
        st.easeT = Math.min(1, st.easeT + 0.028);
        const k = 1 - Math.pow(1 - st.easeT, 3);
        st.yaw = st.fromYaw + (st.targetYaw - st.fromYaw) * k;
        if (st.easeT >= 1) st.targetYaw = null;
      } else if (!st.dragging && !reduced && now - st.lastDrag > 3000) {
        st.yaw += 0.0016;
      }

      // dotted sphere rim
      ctx.strokeStyle = "rgba(179,164,255,0.28)";
      ctx.lineWidth = 2;
      ctx.setLineDash([6, 7]);
      ctx.beginPath();
      ctx.arc(cx, cy, R + 12, 0, Math.PI * 2);
      ctx.stroke();
      ctx.setLineDash([]);

      // land dots, front hemisphere only
      for (let i = 0; i < dots.length; i++) {
        const d = dots[i];
        const p = project(d.lat, d.lon, st.yaw, st.tilt, R, cx, cy);
        if (p.z <= 0.02) continue;
        const tw = reduced ? 0.85 : 0.6 + 0.4 * Math.sin(t * 1.4 + (i % 37));
        ctx.globalAlpha = Math.min(1, (0.25 + p.z * 0.75) * tw + 0.15);
        ctx.fillStyle = d.ink;
        const sz = d.big ? 4 : 3;
        ctx.fillRect(Math.round(p.x / 2) * 2, Math.round(p.y / 2) * 2, sz, sz);
      }

      // markers
      const blink = reduced ? 1 : 0.6 + 0.4 * Math.sin(t * 4);
      for (const place of places) {
        const p = project(place.lat, place.lon, st.yaw, st.tilt, R, cx, cy);
        if (p.z <= 0.12) continue;
        const isSel = place.id === cb.current.selectedId;
        const want = place.status === "want";
        const qx = Math.round(p.x);
        const qy = Math.round(p.y);
        if (want) {
          ctx.globalAlpha = isSel ? 1 : 0.75;
          ctx.strokeStyle = isSel ? "#F5F2EC" : "#8BE9FF";
          ctx.lineWidth = 2;
          ctx.strokeRect(qx - 5, qy - 5, 10, 10);
        } else {
          ctx.globalAlpha = 1;
          ctx.fillStyle = place.home ? "#C6FF5E" : "#FFB86B";
          ctx.fillRect(qx - 4, qy - 4, 8, 8);
          ctx.fillStyle = "#0A0B12";
          ctx.fillRect(qx - 1, qy - 1, 3, 3);
        }
        if (isSel) {
          ctx.globalAlpha = blink;
          ctx.strokeStyle = "#F5F2EC";
          ctx.lineWidth = 2;
          const o = 10;
          const l = 6;
          ctx.beginPath();
          ctx.moveTo(qx - o, qy - o + l); ctx.lineTo(qx - o, qy - o); ctx.lineTo(qx - o + l, qy - o);
          ctx.moveTo(qx + o - l, qy - o); ctx.lineTo(qx + o, qy - o); ctx.lineTo(qx + o, qy - o + l);
          ctx.moveTo(qx + o, qy + o - l); ctx.lineTo(qx + o, qy + o); ctx.lineTo(qx + o - l, qy + o);
          ctx.moveTo(qx - o + l, qy + o); ctx.lineTo(qx - o, qy + o); ctx.lineTo(qx - o, qy + o - l);
          ctx.stroke();
        }
      }
      ctx.globalAlpha = 1;
      return { R, cx, cy };
    };

    let geo = { R: 0, cx: 0, cy: 0 };
    // the globe is below the fold most of the time: stop the loop while
    // off-screen and resume when it returns (selections made while away
    // just paint on the next visible frame)
    let visible = true;
    const frame = (now: number) => {
      st.raf = 0;
      if (!visible) return;
      st.raf = requestAnimationFrame(frame);
      geo = paint(now);
    };
    const kick = () => {
      if (!reduced && !st.raf) st.raf = requestAnimationFrame(frame);
    };
    if (reduced) paint(t0);
    else kick();
    const io = new IntersectionObserver(
      ([entry]) => {
        visible = entry.isIntersecting;
        if (visible) {
          layout();
          kick();
        }
      },
      { rootMargin: "128px" }
    );
    io.observe(wrap);

    // drag to spin, tap to select
    let downX = 0;
    let downYaw = 0;
    let moved = false;
    const onDown = (e: PointerEvent) => {
      st.dragging = true;
      moved = false;
      downX = e.clientX;
      downYaw = st.yaw;
      st.targetYaw = null;
      (e.target as Element).setPointerCapture?.(e.pointerId);
    };
    const onMove = (e: PointerEvent) => {
      if (!st.dragging) return;
      const dx = e.clientX - downX;
      if (Math.abs(dx) > 4) moved = true;
      const w = wrap.clientWidth;
      const R = Math.min(w, wrap.clientHeight) / 2 - 26;
      st.yaw = downYaw + (dx / Math.max(1, R)) * 1.2;
    };
    const onUp = (e: PointerEvent) => {
      st.dragging = false;
      st.lastDrag = performance.now();
      if (!moved) {
        const r = cvs.getBoundingClientRect();
        const mx = e.clientX - r.left;
        const my = e.clientY - r.top;
        let bestId: string | null = null;
        let bestD = 20;
        for (const place of places) {
          const p = project(place.lat, place.lon, st.yaw, st.tilt, geo.R || 100, geo.cx || 0, geo.cy || 0);
          if (p.z <= 0.12) continue;
          const d = Math.hypot(p.x - mx, p.y - my);
          if (d < bestD) {
            bestD = d;
            bestId = place.id;
          }
        }
        if (bestId) cb.current.onSelect(bestId);
      }
    };
    cvs.addEventListener("pointerdown", onDown);
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);

    return () => {
      cancelAnimationFrame(st.raf);
      io.disconnect();
      window.removeEventListener("resize", layout);
      cvs.removeEventListener("pointerdown", onDown);
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // refocus when the list selection changes
  const firstSel = useRef(true);
  useEffect(() => {
    if (firstSel.current) {
      firstSel.current = false;
      return;
    }
    easeRef.current();
  }, [selectedId]);

  return (
    <div ref={wrapRef} className="absolute inset-0 touch-pan-y select-none">
      <canvas ref={canvasRef} className="block h-full w-full [image-rendering:pixelated]" />
    </div>
  );
}
