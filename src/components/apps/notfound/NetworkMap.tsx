"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { animate, useMotionValue, useMotionValueEvent, type AnimationPlaybackControls } from "motion/react";
import { useI18n } from "@/i18n/client";
import { useMedia, useReduced } from "@/hooks/env";
import { useSound } from "@/lib/sound";
import { springFrom } from "@/lib/motion";
import { usePalette } from "@/components/ui/palette";
import { APPS, type PublicAppId } from "@/components/os/apps";
import { useSiteData } from "@/components/os/SiteData";
import { Glass } from "@/components/os/Glass";
import { middleTruncate, type Suggestion } from "./suggest";

/**
 * The 404's network map: emOS as a small metro diagram on the 8px grid,
 * orthogonal and 45° segments only. Line A (red, like Toulouse's A) runs
 * through the six apps; line B (yellow, like the B) crosses it at Writing
 * and runs through the latest posts to a "blog" terminus; a thin lilac tram
 * leaves Projects through the most recently pushed repos; the Garonne
 * crosses it all. The address that failed is a "you are here" ring on a
 * dotted spur off the station it was nearest, the spur as long as the
 * address was far off (a cell for a prefix, two a typo, six at most); with
 * no match it floats unconnected, "not served". Hovering a station lights
 * the route from the pin; picking one sends a little train along it, and
 * the page opens when it arrives. Nothing moves at rest.
 */

type Line = "A" | "B" | "T";
type Pt = { x: number; y: number; id?: string };
type Station = {
  id: string;
  line: Line;
  x: number;
  y: number;
  name: string;
  label: string;
  lx: number;
  ly: number;
  anchor: "start" | "middle" | "end";
  href: string;
  external?: boolean;
  kind: "stop" | "interchange" | "terminus";
};
type Branch = { pts: Pt[]; at: Record<string, number> };
type Net = { W: number; H: number; stations: Station[]; branches: Record<Line, Branch>; river: Pt[]; riverLabel: { x: number; y: number; anchor: "start" | "end" } };
type Rect = { x: number; y: number; w: number; h: number };

const ORDER: PublicAppId[] = ["home", "work", "writing", "atlas", "now", "contact"];
const JUNCTION: Record<"B" | "T", string> = { T: "work", B: "writing" };
const CH = 6.6;
const short = (s: string, n: number) => (s.length > n ? `${s.slice(0, n - 1).trimEnd()}…` : s);

type Inputs = {
  apps: { id: PublicAppId; name: string; href: string }[];
  posts: { id: string; name: string; href: string }[];
  repos: { id: string; name: string; href: string }[];
  blog: { name: string; href: string };
};

function wide(d: Inputs): Net {
  const W = 840;
  const H = 272;
  const AY = 150;
  const TY = 74;
  const BY = 220;
  const stations: Station[] = [];
  const A: Branch = { pts: [], at: {} };
  const ax = [70, 210, 350, 490, 630, 770];
  d.apps.forEach((a, i) => {
    // line B leaves Writing downward: its name goes above
    const up = a.id === "writing";
    const s: Station = {
      id: a.id,
      line: "A",
      x: ax[i],
      y: AY,
      name: a.name,
      label: a.name,
      lx: ax[i],
      ly: up ? AY - 16 : AY + 26,
      anchor: "middle",
      href: a.href,
      kind: i === 0 || i === d.apps.length - 1 ? "terminus" : a.id === "work" || a.id === "writing" ? "interchange" : "stop",
    };
    stations.push(s);
    A.at[s.id] = A.pts.length;
    A.pts.push({ x: s.x, y: s.y, id: s.id });
  });
  // the tram: up out of Projects, along the top
  const T: Branch = { pts: [{ x: 210, y: AY, id: "work" }, { x: 210, y: TY + 40 }, { x: 250, y: TY }], at: { work: 0 } };
  d.repos.forEach((r, i) => {
    const x = 290 + i * 120;
    const s: Station = { id: r.id, line: "T", x, y: TY, name: r.name, label: short(r.name, 16), lx: x, ly: TY - 16, anchor: "middle", href: r.href, external: true, kind: i === d.repos.length - 1 ? "terminus" : "stop" };
    stations.push(s);
    T.at[s.id] = T.pts.length;
    T.pts.push({ x, y: TY, id: s.id });
  });
  // line B: down out of Writing, along the bottom to the blog
  const B: Branch = { pts: [{ x: 350, y: AY, id: "writing" }, { x: 350, y: BY - 40 }, { x: 390, y: BY }], at: { writing: 0 } };
  [...d.posts, { id: "blog", name: d.blog.name, href: d.blog.href }].forEach((p, i, all) => {
    const x = 430 + i * 76;
    const above = i % 2 === 1;
    const s: Station = { id: p.id, line: "B", x, y: BY, name: p.name, label: short(p.name, 22), lx: x, ly: above ? BY - 16 : BY + 26, anchor: "middle", href: p.href, external: p.id === "blog", kind: i === all.length - 1 ? "terminus" : "stop" };
    stations.push(s);
    B.at[s.id] = B.pts.length;
    B.pts.push({ x, y: BY, id: s.id });
  });
  return {
    W,
    H,
    stations,
    branches: { A, B, T },
    river: [
      { x: 671, y: 0 },
      { x: 689, y: 0 },
      { x: 509, y: H },
      { x: 491, y: H },
    ],
    riverLabel: { x: 698, y: 18, anchor: "start" },
  };
}

function narrow(d: Inputs): Net {
  const W = 340;
  const H = 548;
  const AX = 36;
  const ay = [36, 100, 256, 400, 456, 512];
  const stations: Station[] = [];
  const A: Branch = { pts: [], at: {} };
  d.apps.forEach((a, i) => {
    const branchy = a.id === "work" || a.id === "writing";
    const s: Station = {
      id: a.id,
      line: "A",
      x: AX,
      y: ay[i],
      name: a.name,
      label: a.name,
      lx: AX + 16,
      // above the branch leaving to the right
      ly: branchy ? ay[i] - 10 : ay[i] + 4,
      anchor: "start",
      href: a.href,
      kind: i === 0 || i === d.apps.length - 1 ? "terminus" : branchy ? "interchange" : "stop",
    };
    stations.push(s);
    A.at[s.id] = A.pts.length;
    A.pts.push({ x: s.x, y: s.y, id: s.id });
  });
  // room between the trunk and the branches for the pin and its name
  const BX = 176;
  const T: Branch = { pts: [{ x: AX, y: 100, id: "work" }, { x: BX, y: 100 }], at: { work: 0 } };
  d.repos.forEach((r, i) => {
    const y = 140 + i * 40;
    const s: Station = { id: r.id, line: "T", x: BX, y, name: r.name, label: short(r.name, 22), lx: BX + 14, ly: y + 4, anchor: "start", href: r.href, external: true, kind: i === d.repos.length - 1 ? "terminus" : "stop" };
    stations.push(s);
    T.at[s.id] = T.pts.length;
    T.pts.push({ x: BX, y, id: s.id });
  });
  const B: Branch = { pts: [{ x: AX, y: 256, id: "writing" }, { x: BX, y: 256 }], at: { writing: 0 } };
  [...d.posts, { id: "blog", name: d.blog.name, href: d.blog.href }].forEach((p, i, all) => {
    const y = 296 + i * 40;
    const s: Station = { id: p.id, line: "B", x: BX, y, name: p.name, label: short(p.name, 22), lx: BX + 14, ly: y + 4, anchor: "start", href: p.href, external: p.id === "blog", kind: i === all.length - 1 ? "terminus" : "stop" };
    stations.push(s);
    B.at[s.id] = B.pts.length;
    B.pts.push({ x: BX, y, id: s.id });
  });
  return {
    W,
    H,
    stations,
    branches: { A, B, T },
    river: [
      { x: W, y: 121 },
      { x: W, y: 139 },
      { x: 0, y: 379 },
      { x: 0, y: 361 },
    ],
    riverLabel: { x: W - 4, y: 110, anchor: "end" },
  };
}

/** the stations and bends between two stations, along the lines (A is the trunk) */
function routeOf(net: Net, from: Station, to: Station): Pt[] {
  const slice = (b: Branch, i: number, j: number) => (i <= j ? b.pts.slice(i, j + 1) : b.pts.slice(j, i + 1).reverse());
  if (from.line === to.line && from.line !== "A") {
    const b = net.branches[from.line];
    return slice(b, b.at[from.id], b.at[to.id]);
  }
  const out: Pt[] = [];
  let aFrom = from.id;
  if (from.line !== "A") {
    const b = net.branches[from.line];
    out.push(...slice(b, b.at[from.id], 0));
    aFrom = JUNCTION[from.line];
  }
  const aTo = to.line === "A" ? to.id : JUNCTION[to.line];
  const A = net.branches.A;
  const mid = slice(A, A.at[aFrom], A.at[aTo]);
  out.push(...(out.length ? mid.slice(1) : mid));
  if (to.line !== "A") {
    const b = net.branches[to.line];
    out.push(...b.pts.slice(1, b.at[to.id] + 1));
  }
  return out;
}

/* ───────────── where the pin goes: clear of every line, station and name ───────────── */

const labelBox = (s: { lx: number; ly: number; anchor: string; label: string }): Rect => {
  const w = s.label.length * CH;
  const x = s.anchor === "start" ? s.lx : s.anchor === "end" ? s.lx - w : s.lx - w / 2;
  return { x: x - 2, y: s.ly - 11, w: w + 4, h: 15 };
};
const inRect = (p: Pt, r: Rect, m = 0) => p.x >= r.x - m && p.x <= r.x + r.w + m && p.y >= r.y - m && p.y <= r.y + r.h + m;
const distSeg = (p: Pt, a: Pt, b: Pt) => {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const t = Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / (dx * dx + dy * dy || 1)));
  return Math.hypot(p.x - (a.x + t * dx), p.y - (a.y + t * dy));
};

type Pin = { at: Pt; from: Station | null; box: Rect; side: "left" | "right" | "above" | "below" };

function placePin(net: Net, from: Station | null, cells: number, here: string, path: string): Pin {
  const river = labelBox({ lx: net.riverLabel.x, ly: net.riverLabel.y, anchor: net.riverLabel.anchor, label: "Garonne" });
  const segs: [Pt, Pt][] = [];
  for (const b of Object.values(net.branches)) for (let i = 1; i < b.pts.length; i++) segs.push([b.pts[i - 1], b.pts[i]]);
  const labels = [...net.stations.map(labelBox), river];
  const bw = Math.max(here.length * 6.4, path.length * CH) + 6;
  const bh = 28;
  const clear = (p: Pt, m: number, skip?: Station) =>
    segs.every(([a, b]) => distSeg(p, a, b) > m + 4) &&
    net.stations.every((s) => s === skip || Math.hypot(p.x - s.x, p.y - s.y) > m + 9) &&
    labels.every((r) => !inRect(p, r, m));
  const boxFor = (p: Pt, dx: number, dy: number): { box: Rect; side: Pin["side"] } =>
    Math.abs(dx) >= Math.abs(dy) && dx !== 0
      ? dx > 0
        ? { box: { x: p.x + 11, y: p.y - bh / 2, w: bw, h: bh }, side: "right" }
        : { box: { x: p.x - 11 - bw, y: p.y - bh / 2, w: bw, h: bh }, side: "left" }
      : dy < 0
        ? { box: { x: p.x - bw / 2, y: p.y - 11 - bh, w: bw, h: bh }, side: "above" }
        : { box: { x: p.x - bw / 2, y: p.y + 11, w: bw, h: bh }, side: "below" };
  const fits = (box: Rect, skip?: Station) => {
    if (box.x < 2 || box.y < 2 || box.x + box.w > net.W - 2 || box.y + box.h > net.H - 2) return false;
    for (let x = box.x; x <= box.x + box.w; x += 4)
      for (let y = box.y; y <= box.y + box.h; y += 4) if (!clear({ x, y }, 0, skip)) return false;
    return true;
  };

  if (from) {
    // first the side away from the station's name, then the diagonals, then the rest
    const away = { x: Math.sign(from.x - (from.lx + (from.anchor === "start" ? 20 : 0))), y: Math.sign(from.y - from.ly) };
    const dirs: [number, number][] = [
      [0, -1],
      [0, 1],
      [-1, 0],
      [1, 0],
      [-1, -1],
      [1, -1],
      [-1, 1],
      [1, 1],
    ];
    dirs.sort((a, b) => b[0] * away.x + b[1] * away.y - (a[0] * away.x + a[1] * away.y));
    for (const extra of [0, 16, 32]) {
      for (const [dx, dy] of dirs) {
        const len = 14 + cells * 8 + extra;
        const n = Math.hypot(dx, dy);
        const at = { x: from.x + (dx / n) * len, y: from.y + (dy / n) * len };
        let ok = clear(at, 8, from);
        for (let t = 12; ok && t < len; t += 3) ok = clear({ x: from.x + (dx / n) * t, y: from.y + (dy / n) * t }, 1, from);
        const { box, side } = boxFor(at, dx, dy);
        if (ok && fits(box, from)) return { at, from, box, side };
      }
    }
    // nowhere clear: straight off the name's far side
    const at = { x: from.x, y: from.y - 22 };
    return { at, from, ...boxFor(at, 0, -1) };
  }
  // not served: unconnected, in the first free corner
  for (const at of [
    { x: 20, y: 24 },
    { x: net.W - bw - 24, y: 24 },
    { x: net.W - bw - 24, y: net.H - 24 },
    { x: 20, y: net.H - 24 },
  ]) {
    const { box, side } = boxFor(at, 1, 0);
    if (clear(at, 8) && fits(box)) return { at, from: null, box, side };
  }
  const at = { x: 20, y: 24 };
  return { at, from: null, ...boxFor(at, 1, 0) };
}

/* ───────────────────────── the map ───────────────────────── */

export function NetworkMap({
  suggestion,
  path,
  go,
  home,
}: {
  suggestion: Suggestion | null;
  /** the address that failed, as typed */
  path: string;
  go: (href: string) => void;
  home: string;
}) {
  const { t, path: localize } = useI18n();
  const m = t.notfound.map;
  const { posts, repos } = useSiteData();
  const isWide = useMedia("(min-width: 760px)", true);
  const reduced = useReduced();
  const { blip } = useSound();
  const palette = usePalette();

  const inputs = useMemo<Inputs>(
    () => ({
      apps: ORDER.map((id) => {
        const app = APPS.find((a) => a.id === id)!;
        return { id, name: t.shell.apps[app.label], href: localize(app.path) };
      }),
      posts: posts.slice(0, 5).map((p) => ({ id: `post:${p.slug}`, name: p.title, href: localize(`/writing/${p.slug}`) })),
      repos: repos.slice(0, 3).map((r) => ({ id: `repo:${r.name}`, name: r.name, href: r.url })),
      blog: { name: m.blog, href: localize("/writing") },
    }),
    [posts, repos, t, localize, m.blog]
  );
  const net = useMemo(() => (isWide ? wide(inputs) : narrow(inputs)), [isWide, inputs]);
  const byId = useMemo(() => new Map(net.stations.map((s) => [s.id, s])), [net]);

  // the station the address was nearest, and how far off it was
  const from = useMemo(() => {
    if (!suggestion) return null;
    if (suggestion.kind === "app") return byId.get(suggestion.app) ?? byId.get("home") ?? null;
    if (suggestion.kind === "post") return byId.get(`post:${suggestion.href.split("/").pop()}`) ?? byId.get("writing") ?? null;
    return byId.get(`repo:${suggestion.name}`) ?? byId.get("work") ?? null;
  }, [suggestion, byId]);
  const score = suggestion?.score ?? 0;
  const cells = score <= 0.5 ? 1 : Math.min(6, Math.round(score) * 2);
  const shownPath = middleTruncate(path, isWide ? 24 : 14);
  const pinText = from ? m.here : m.notServed;
  const pin = useMemo(() => placePin(net, from, cells, pinText, shownPath), [net, from, cells, pinText, shownPath]);
  const origin = from ?? byId.get("home")!;

  const [hover, setHover] = useState<string | null>(null);
  const routeTo = (id: string): Pt[] => {
    const to = byId.get(id);
    if (!to) return [];
    return [...(from ? [pin.at] : []), ...routeOf(net, origin, to)];
  };
  const lit = hover ? routeTo(hover) : null;

  /* the ride */
  const prog = useMotionValue(0);
  const ride = useRef<{ pts: Pt[]; lens: number[]; total: number; to: Station } | null>(null);
  const anim = useRef<AnimationPlaybackControls | null>(null);
  const train = useRef<SVGGElement>(null);
  const svg = useRef<SVGSVGElement>(null);
  const timer = useRef(0);
  useEffect(
    () => () => {
      anim.current?.stop();
      window.clearTimeout(timer.current);
    },
    []
  );

  const pointAt = (d: number) => {
    const r = ride.current!;
    let i = 0;
    while (i < r.lens.length - 2 && r.lens[i + 1] < d) i++;
    const a = r.pts[i];
    const b = r.pts[i + 1] ?? a;
    const span = r.lens[i + 1] - r.lens[i] || 1;
    const k = Math.max(0, Math.min(1, (d - r.lens[i]) / span));
    return { x: a.x + (b.x - a.x) * k, y: a.y + (b.y - a.y) * k, angle: (Math.atan2(b.y - a.y, b.x - a.x) * 180) / Math.PI, i };
  };
  useMotionValueEvent(prog, "change", (p) => {
    const r = ride.current;
    const g = train.current;
    if (!r || !g) return;
    const d = p * r.total;
    const at = pointAt(d);
    g.setAttribute("transform", `translate(${at.x.toFixed(1)} ${at.y.toFixed(1)}) rotate(${at.angle.toFixed(0)})`);
    g.style.visibility = "visible";
    // each station passed lights once
    r.pts.forEach((pt, i) => {
      if (pt.id && r.lens[i] <= d) svg.current?.querySelector(`[data-stop="${CSS.escape(pt.id)}"]`)?.setAttribute("data-lit", "");
    });
  });

  const arrive = (to: Station) => {
    ride.current = null;
    if (to.external) {
      window.open(to.href, "_blank", "noopener,noreferrer");
      if (train.current) train.current.style.visibility = "hidden";
      svg.current?.querySelectorAll("[data-lit]").forEach((el) => el.removeAttribute("data-lit"));
      return;
    }
    go(to.href);
  };

  const start = (id: string) => {
    const to = byId.get(id);
    if (!to) return;
    blip("select");
    // tapped again while on its way: go straight there
    if (ride.current?.to.id === id) {
      anim.current?.stop();
      arrive(to);
      return;
    }
    if (reduced) {
      setHover(id);
      window.clearTimeout(timer.current);
      timer.current = window.setTimeout(() => arrive(to), 200);
      return;
    }
    let pts: Pt[];
    const r = ride.current;
    if (r) {
      // re-routed mid-ride: on from where the train is, never back to the start
      const at = pointAt(prog.get() * r.total);
      const passed = [...r.pts.slice(0, at.i + 1)].reverse().find((p) => p.id && byId.get(p.id));
      const via = (passed?.id && byId.get(passed.id)) || origin;
      pts = [{ x: at.x, y: at.y }, ...routeOf(net, via, to)];
    } else pts = routeTo(id);
    const lens = [0];
    for (let i = 1; i < pts.length; i++) lens.push(lens[i - 1] + Math.hypot(pts[i].x - pts[i - 1].x, pts[i].y - pts[i - 1].y));
    const total = lens[lens.length - 1] || 1;
    ride.current = { pts, lens, total, to };
    svg.current?.querySelectorAll("[data-lit]").forEach((el) => el.removeAttribute("data-lit"));
    anim.current?.stop();
    prog.jump(0);
    // any ride arrives in about half a second
    anim.current = animate(prog, 1, { ...springFrom(Math.min(0.5, 0.25 + total / 2400)), restDelta: 0.002, onComplete: () => arrive(to) });
  };

  const prefetch = (s: Station) => {
    if (s.external || document.head.querySelector(`link[rel="prefetch"][href="${CSS.escape(s.href)}"]`)) return;
    const link = document.createElement("link");
    link.rel = "prefetch";
    link.href = s.href;
    document.head.append(link);
  };

  const C = { A: "var(--color-flare)", B: "var(--color-ember)", T: "var(--color-lilac)" };
  const W = { A: 7, B: 5, T: 3 };
  const poly = (pts: Pt[]) => pts.map((p) => `${p.x},${p.y}`).join(" ");
  const nearest = from?.name ?? "";

  return (
    <section className="app-nf-net" id="network-map" aria-labelledby="app-nf-net-title">
      <Glass thickness="regular" refract={false} className="app-nf-net-tile">
        <header className="app-nf-net-bar">
          <h2 id="app-nf-net-title" className="app-nf-net-title">
            {m.title}
          </h2>
          <p className="app-nf-net-hint">{m.hint}</p>
        </header>
        <div
          className="app-nf-net-map"
          data-wide={isWide || undefined}
          style={{ aspectRatio: `${net.W} / ${net.H}` }}
          onKeyDown={(e) => {
            if (e.key === "Escape") {
              e.preventDefault();
              go(home);
            } else if (e.key === "/") {
              e.preventDefault();
              palette.open();
            }
          }}
        >
          <svg ref={svg} viewBox={`0 0 ${net.W} ${net.H}`} className="app-nf-net-svg" aria-hidden data-dim={lit ? "" : undefined}>
            <defs>
              <pattern id="app-nf-river" width="4" height="4" patternUnits="userSpaceOnUse">
                <rect width="4" height="4" fill="var(--color-ion)" opacity="0.28" />
                <rect width="2" height="2" fill="var(--color-ion)" opacity="0.5" />
                <rect x="2" y="2" width="2" height="2" fill="var(--color-ion)" opacity="0.5" />
              </pattern>
            </defs>
            <polygon points={poly(net.river)} fill="url(#app-nf-river)" />
            <text className="app-nf-net-river" x={net.riverLabel.x} y={net.riverLabel.y} textAnchor={net.riverLabel.anchor}>
              {m.river}
            </text>
            <g className="app-nf-net-lines">
              {(["T", "B", "A"] as Line[]).map((l) => (
                <polyline key={l} points={poly(net.branches[l].pts)} fill="none" stroke={C[l]} strokeWidth={W[l]} strokeLinecap="round" strokeLinejoin="round" />
              ))}
            </g>
            {lit && lit.length > 1 && <polyline className="app-nf-net-route" points={poly(lit)} fill="none" />}
            {/* you are here */}
            {from && <line className="app-nf-net-spur" x1={from.x} y1={from.y} x2={pin.at.x} y2={pin.at.y} />}
            <circle className="app-nf-net-pin" cx={pin.at.x} cy={pin.at.y} r={6} />
            <text
              className="app-nf-net-here"
              x={pin.side === "left" ? pin.box.x + pin.box.w - 3 : pin.side === "right" ? pin.box.x + 3 : pin.box.x + pin.box.w / 2}
              y={pin.box.y + 11}
              textAnchor={pin.side === "left" ? "end" : pin.side === "right" ? "start" : "middle"}
            >
              {pinText}
              <tspan
                className="app-nf-net-herepath"
                x={pin.side === "left" ? pin.box.x + pin.box.w - 3 : pin.side === "right" ? pin.box.x + 3 : pin.box.x + pin.box.w / 2}
                dy={14}
              >
                {shownPath}
              </tspan>
            </text>
            {net.stations.map((s) => (
              <g key={s.id} className="app-nf-net-stop" data-stop={s.id} data-on={hover === s.id || undefined} data-kind={s.kind}>
                <circle
                  cx={s.x}
                  cy={s.y}
                  r={s.kind === "interchange" ? 7.5 : s.kind === "terminus" ? 5.5 : 4.5}
                  stroke={s.kind === "terminus" ? C[s.line] : "var(--color-ink-950)"}
                  strokeWidth={s.kind === "interchange" ? 2.5 : 2}
                />
                <text x={s.lx} y={s.ly} textAnchor={s.anchor}>
                  {s.label}
                </text>
              </g>
            ))}
            {/* the train: two cars and a lit window strip */}
            <g ref={train} className="app-nf-net-train" style={{ visibility: "hidden" }}>
              <rect x={-11} y={-4} width={10} height={8} rx={1.5} />
              <rect x={1} y={-4} width={10} height={8} rx={1.5} />
              <rect className="app-nf-net-windows" x={-9.5} y={-2} width={19} height={2} />
            </g>
          </svg>
          {net.stations.map((s) => (
            <button
              key={s.id}
              type="button"
              className="app-nf-net-hit"
              style={{ left: `${(s.x / net.W) * 100}%`, top: `${(s.y / net.H) * 100}%` }}
              aria-label={m.ride.replace("{name}", s.name)}
              onPointerEnter={() => setHover(s.id)}
              onPointerLeave={() => setHover((h) => (h === s.id ? null : h))}
              onFocus={() => setHover(s.id)}
              onBlur={() => setHover((h) => (h === s.id ? null : h))}
              onPointerDown={() => prefetch(s)}
              onClick={() => start(s.id)}
            />
          ))}
          {!from && (
            <button
              type="button"
              className="app-nf-net-search"
              style={{ left: `${((pin.box.x + 3) / net.W) * 100}%`, top: `${((pin.box.y + pin.box.h + 6) / net.H) * 100}%` }}
              onClick={palette.open}
            >
              {m.search}
            </button>
          )}
        </div>
        <p className="app-nf-net-status">
          <span>{m.status.replace("{path}", shownPath)}</span>
          {nearest && <span className="app-nf-net-nearest">{m.nearest.replace("{name}", nearest)}</span>}
        </p>
      </Glass>
    </section>
  );
}
