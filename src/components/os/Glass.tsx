"use client";

import { useCallback, useEffect, useId, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useChromium, useMedia } from "@/hooks/env";
import "./glass.css";

/**
 * Glass: the emOS Liquid Glass material.
 *
 * ── API ─────────────────────────────────────────────────────────────────
 *   <Glass
 *     thickness="thin" | "regular" | "thick"   // default "regular"
 *     as="div" | "section" | "aside" | "header" | "nav" | "footer"
 *        | "article" | "span" | "ul" | "li" | "form"   // default "div"
 *     refract={boolean}      // real refraction where supported; default
 *                            //   true for regular/thick, false for thin
 *     interactive={boolean}  // soft specular sheen that follows a fine
 *                            //   pointer; default false
 *     shadow={boolean}       // the material's own drop shadow; default
 *                            //   false (most surfaces own their shadow)
 *     className / style / ref / aria-* / handlers …  // passed through
 *   />
 *
 * Two ways to use it:
 *   1. As a container:  <Glass className="rounded-[var(--radius-card)] p-4">…</Glass>
 *      Children paint above the material; no extra wrapper is needed.
 *   2. As a material layer under your own content (what windows, the dock
 *      and the mini player do): <Glass aria-hidden className="absolute inset-0
 *      rounded-[inherit]" /> as the first child of your surface, with the
 *      drop shadow on the surface itself.
 *
 * Radius: set it on the Glass (or `border-radius: inherit`); the material,
 * the rim and the refraction map all follow the computed radius.
 *
 * What it renders: the element you asked for, holding an inset `pane`
 * (tint, blur or refraction, inner light) at z-index −1, an optional sheen,
 * and a specular rim (::after). The element gets `position: relative;
 * z-index: 0` from a low-priority layer, so your own position / z-index
 * utilities or CSS always win.
 *
 * Refraction: Chromium (≥ 640px wide) renders an SVG displacement map
 * inside backdrop-filter, edge-weighted like a convex bevel, with a faint
 * chromatic split. The map is drawn per size and cached; while the surface
 * resizes the previous map stretches and is redrawn once the size settles.
 * Everywhere else it is frosted glass. Under prefers-reduced-transparency
 * it is opaque; under prefers-contrast: more it is solid with a visible rim.
 *
 * Gotchas for consumers:
 *   • Don't put `glass`, `glass-thin` or `glass-thick` (or any
 *     backdrop-filter, filter, opacity < 1, mask or mix-blend-mode) on the
 *     Glass element or an ancestor while you need it to see the page: each
 *     makes a "backdrop root" and the pane goes blank. Animate entrances
 *     with transform/scale; fade a sibling, not the glass.
 *   • Don't make the Glass itself the scroll container (the pane would
 *     scroll away); scroll a child (with data-lenis-prevent).
 *   • Keep ≤ ~4 refracting surfaces on screen; pass refract={false} for
 *     small or numerous chips.
 *
 * Tuning: override --os-glass-tint, --os-glass-frost (the frosted blur
 * chain; keep single radii ≤ 12px, bigger ones alias the dithered
 * wallpaper), --os-glass-rblur (blur after refraction), --os-glass-sat or
 * --os-glass-shadow on the element (or an ancestor) from your own CSS.
 */

type Thickness = "thin" | "regular" | "thick";
type GlassTag = "div" | "section" | "aside" | "header" | "nav" | "footer" | "article" | "span" | "ul" | "li" | "form";

export type GlassProps = {
  as?: GlassTag;
  thickness?: Thickness;
  className?: string;
  refract?: boolean;
  interactive?: boolean;
  shadow?: boolean;
  children?: React.ReactNode;
  ref?: React.Ref<HTMLElement>;
} & React.HTMLAttributes<HTMLElement>;

/** bevel width (px), displacement scale (px), chromatic split per thickness */
const OPTICS: Record<Thickness, { bevel: number; strength: number; chroma: number }> = {
  thin: { bevel: 12, strength: 30, chroma: 0.05 },
  regular: { bevel: 24, strength: 92, chroma: 0.08 },
  thick: { bevel: 32, strength: 92, chroma: 0.08 },
};

/* ───────────────────────── displacement maps ───────────────────────── */

const mapCache = new Map<string, string>();

/** Edge-weighted normal map for a rounded rect: flat in the middle, bending
    hard along a circular bevel, always sampling inward like a convex rim
    (R = x shift, G = y shift, 128 = rest). Drawn at reduced resolution. */
function buildMap(w: number, h: number, radius: number, bevel: number) {
  const key = `${w}x${h}:${radius}:${bevel}`;
  const hit = mapCache.get(key);
  if (hit) return hit;
  const res = Math.min(1, 360 / Math.max(w, h, 1)) * 0.9 + 0.1;
  const W = Math.max(4, Math.round(w * res));
  const H = Math.max(4, Math.round(h * res));
  const canvas = document.createElement("canvas");
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext("2d");
  if (!ctx) return "";
  const img = ctx.createImageData(W, H);
  const d = img.data;
  const sx = W / w;
  const r = Math.max(0.5, radius * sx);
  const b = Math.max(1, bevel * sx);
  const hw = W / 2;
  const hh = H / 2;
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const px = x + 0.5 - hw;
      const py = y + 0.5 - hh;
      // signed distance to the rounded rect (negative inside)
      const qx = Math.abs(px) - (hw - r);
      const qy = Math.abs(py) - (hh - r);
      const ox = Math.max(qx, 0);
      const oy = Math.max(qy, 0);
      const outside = Math.hypot(ox, oy);
      const depth = -(outside + Math.min(Math.max(qx, qy), 0) - r);
      let dx = 0;
      let dy = 0;
      if (depth >= 0 && depth < b) {
        // outward normal of the nearest edge
        let nx = 0;
        let ny = 0;
        if (qx > 0 && qy > 0 && outside > 0) {
          nx = (ox / outside) * Math.sign(px);
          ny = (oy / outside) * Math.sign(py);
        } else if (qx > qy) {
          nx = Math.sign(px);
        } else {
          ny = Math.sign(py);
        }
        // circular bevel profile: calm inside, bends hard at the lip
        const t = 1 - depth / b;
        const mag = 1 - Math.sqrt(Math.max(0, 1 - t * t));
        dx = -nx * mag;
        dy = -ny * mag;
      }
      const i = (y * W + x) * 4;
      d[i] = Math.round(128 + dx * 127);
      d[i + 1] = Math.round(128 + dy * 127);
      d[i + 2] = 128;
      d[i + 3] = 255;
    }
  }
  ctx.putImageData(img, 0, 0);
  const url = canvas.toDataURL("image/png");
  if (mapCache.size > 64) mapCache.clear();
  mapCache.set(key, url);
  return url;
}

/* ───────────────────────── shared <defs> host ───────────────────────── */

const SVG_NS = "http://www.w3.org/2000/svg";
let defsHost: SVGDefsElement | null = null;

/** The one hidden <svg><defs> every refracting surface portals its filter
    into, created on first use. */
function glassDefs(): SVGDefsElement {
  if (defsHost?.isConnected) return defsHost;
  const svg = document.createElementNS(SVG_NS, "svg");
  svg.setAttribute("aria-hidden", "true");
  svg.setAttribute("focusable", "false");
  svg.setAttribute("width", "0");
  svg.setAttribute("height", "0");
  svg.setAttribute("class", "os-glass-defs");
  const defs = document.createElementNS(SVG_NS, "defs");
  svg.appendChild(defs);
  document.body.appendChild(svg);
  defsHost = defs;
  return defs;
}

/** Optional: mount once to create the shared filter host ahead of the first
    refracting surface. Glass creates it lazily on its own, so nothing has
    to render this. */
export function GlassDefs() {
  useEffect(() => {
    glassDefs();
  }, []);
  return null;
}

const ONLY = {
  r: "1 0 0 0 0  0 0 0 0 0  0 0 0 0 0  0 0 0 1 0",
  g: "0 0 0 0 0  0 1 0 0 0  0 0 0 0 0  0 0 0 1 0",
  b: "0 0 0 0 0  0 0 0 0 0  0 0 1 0 0  0 0 0 1 0",
};

/** Displace R, G and B by slightly different amounts (a faint chromatic
    split at the rim), then screen them back together. Large surfaces skip
    the split: one displacement pass instead of three plus the recombine. */
function GlassFilter({ id, w, h, url, strength, chroma }: { id: string; w: number; h: number; url: string; strength: number; chroma: number }) {
  const s = { r: strength * (1 + chroma), g: strength, b: strength * (1 - chroma) };
  if (chroma <= 0) {
    return (
      <filter
        id={id}
        x="0"
        y="0"
        width={w}
        height={h}
        filterUnits="userSpaceOnUse"
        primitiveUnits="userSpaceOnUse"
        colorInterpolationFilters="sRGB"
      >
        <feImage href={url} x="0" y="0" width={w} height={h} preserveAspectRatio="none" result="map" />
        <feDisplacementMap in="SourceGraphic" in2="map" scale={strength} xChannelSelector="R" yChannelSelector="G" />
      </filter>
    );
  }
  return (
    <filter
      id={id}
      x="0"
      y="0"
      width={w}
      height={h}
      filterUnits="userSpaceOnUse"
      primitiveUnits="userSpaceOnUse"
      colorInterpolationFilters="sRGB"
    >
      <feImage href={url} x="0" y="0" width={w} height={h} preserveAspectRatio="none" result="map" />
      {(["r", "g", "b"] as const).map((c) => (
        <feDisplacementMap
          key={`d${c}`}
          in="SourceGraphic"
          in2="map"
          scale={s[c]}
          xChannelSelector="R"
          yChannelSelector="G"
          result={`d${c}`}
        />
      ))}
      {(["r", "g", "b"] as const).map((c) => (
        <feColorMatrix key={`c${c}`} in={`d${c}`} type="matrix" values={ONLY[c]} result={`c${c}`} />
      ))}
      <feBlend in="cr" in2="cg" mode="screen" result="rg" />
      <feBlend in="rg" in2="cb" mode="screen" />
    </filter>
  );
}

function radiusOf(el: HTMLElement, w: number, h: number) {
  const raw = getComputedStyle(el).borderTopLeftRadius || "0";
  const first = raw.split(" ")[0];
  const v = parseFloat(first) || 0;
  const px = first.endsWith("%") ? (v / 100) * Math.min(w, h) : v;
  return Math.min(px, w / 2, h / 2);
}

type MapState = { w: number; h: number; url: string; host: SVGDefsElement };

/* ───────────────────────────── component ───────────────────────────── */

export function Glass({
  as = "div",
  thickness = "regular",
  className = "",
  refract,
  interactive = false,
  shadow = false,
  children,
  ref,
  ...rest
}: GlassProps) {
  const Tag = as as React.ElementType;
  const elRef = useRef<HTMLElement | null>(null);
  const sheenRef = useRef<HTMLSpanElement | null>(null);
  const id = "os-glass-" + useId().replace(/[^a-zA-Z0-9_-]/g, "");

  const chromium = useChromium();
  const wide = useMedia("(min-width: 640px)");
  const opaque = useMedia("(prefers-reduced-transparency: reduce)");
  const contrast = useMedia("(prefers-contrast: more)");
  const fine = useMedia("(hover: hover) and (pointer: fine)");
  const wantRefract = refract ?? thickness !== "thin";
  const on = wantRefract && chromium && wide && !opaque && !contrast;
  const sheen = interactive && fine && !opaque;
  const optics = OPTICS[thickness];

  const [map, setMap] = useState<MapState | null>(null);

  const setRef = useCallback(
    (node: HTMLElement | null) => {
      elRef.current = node;
      if (typeof ref === "function") ref(node);
      else if (ref) (ref as React.RefObject<HTMLElement | null>).current = node;
    },
    [ref]
  );

  // measure → draw (or reuse) the displacement map; while resizing, the old
  // map stretches and the exact one is drawn once the size settles
  useEffect(() => {
    if (!on) return;
    const el = elRef.current;
    if (!el) return;
    let raf = 0;
    let settle = 0;
    let lastKey = "";
    let hasMap = false;
    const draw = () => {
      const w = Math.round(el.offsetWidth);
      const h = Math.round(el.offsetHeight);
      if (w < 8 || h < 8) return;
      const radius = Math.round(radiusOf(el, w, h));
      const bevel = Math.min(optics.bevel, w / 2, h / 2);
      const key = `${w}x${h}:${radius}`;
      if (key === lastKey) return;
      lastKey = key;
      const url = buildMap(w, h, radius, bevel);
      if (!url) return;
      hasMap = true;
      setMap({ w, h, url, host: glassDefs() });
    };
    const onResize = () => {
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(() => {
        if (!hasMap) {
          draw();
          return;
        }
        const w = Math.round(el.offsetWidth);
        const h = Math.round(el.offsetHeight);
        if (w < 8 || h < 8) return;
        setMap((m) => (m && (m.w !== w || m.h !== h) ? { ...m, w, h } : m));
        window.clearTimeout(settle);
        settle = window.setTimeout(draw, 160);
      });
    };
    const ro = new ResizeObserver(onResize);
    ro.observe(el);
    return () => {
      ro.disconnect();
      cancelAnimationFrame(raf);
      window.clearTimeout(settle);
    };
  }, [on, optics.bevel]);

  // the sheen: a soft light that follows a fine pointer across the surface.
  // Inert layers (pointer-events: none) listen on their parent instead.
  useEffect(() => {
    if (!sheen) return;
    const el = elRef.current;
    const blob = sheenRef.current;
    if (!el || !blob) return;
    const target = getComputedStyle(el).pointerEvents === "none" ? (el.parentElement ?? el) : el;
    let raf = 0;
    let px = 0;
    let py = 0;
    const paint = () => {
      raf = 0;
      const r = el.getBoundingClientRect();
      blob.style.transform = `translate3d(${(px - r.left).toFixed(1)}px, ${(py - r.top).toFixed(1)}px, 0)`;
    };
    const move = (e: PointerEvent) => {
      if (e.pointerType !== "mouse") return;
      px = e.clientX;
      py = e.clientY;
      blob.dataset.on = "";
      if (!raf) raf = requestAnimationFrame(paint);
    };
    const leave = () => {
      delete blob.dataset.on;
    };
    target.addEventListener("pointermove", move, { passive: true });
    target.addEventListener("pointerleave", leave);
    return () => {
      target.removeEventListener("pointermove", move);
      target.removeEventListener("pointerleave", leave);
      cancelAnimationFrame(raf);
    };
  }, [sheen]);

  const live = on && !!map;
  // past ~a laptop-window's area the split is invisible under the frost
  const chroma = map && map.w * map.h > 600_000 ? 0 : optics.chroma;
  return (
    <Tag
      {...rest}
      ref={setRef}
      data-glass={thickness}
      data-glass-shadow={shadow ? "" : undefined}
      className={`os-glass ${className}`}
    >
      {live && map && createPortal(<GlassFilter id={id} w={map.w} h={map.h} url={map.url} strength={optics.strength} chroma={chroma} />, map.host)}
      <span
        aria-hidden
        className="os-glass-pane"
        data-live={live ? "" : undefined}
        style={live ? ({ "--os-glass-filter": `url(#${id})` } as React.CSSProperties) : undefined}
      />
      {sheen && (
        <span aria-hidden className="os-glass-sheen">
          <span ref={sheenRef} className="os-glass-sheen-blob" />
        </span>
      )}
      {children}
    </Tag>
  );
}
