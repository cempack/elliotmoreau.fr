"use client";

import { createContext, forwardRef, useContext, useEffect, useId, useRef, useState } from "react";

/**
 * Liquid glass: a backdrop-filter that actually bends what's behind it.
 *
 * Each surface measures itself and gets its own displacement map, drawn
 * once into a canvas (R = x shift, G = y shift, 128 = rest). The map is
 * edge-weighted: flat in the middle, bending hard along a rounded bevel,
 * always sampling *inward* the way a convex rim magnifies. The SVG filter
 * displaces R, G and B by slightly different amounts for a faint
 * chromatic split, then CSS adds blur and saturation on top.
 *
 * Only Chromium renders SVG filters inside backdrop-filter, so the root
 * provides `refract` from a UA check; everywhere else the same element
 * falls back to frosted glass purely through CSS.
 */

export const GlassCtx = createContext<{ refract: boolean }>({ refract: false });

type Mode = "rim" | "lens";

export type GlassOptions = {
  /** this surface may refract (keep ≤ 3 on screen) */
  enabled?: boolean;
  /** corner radius in px, or "pill" for height / 2 */
  radius?: number | "pill";
  /** width of the bending rim in px */
  bevel?: number;
  /** displacement scale in px (max shift ≈ strength / 2) */
  strength?: number;
  /** 0..1, how far the R and B channels drift apart */
  chroma?: number;
  mode?: Mode;
};

const mapCache = new Map<string, string>();

function smoothstep(a: number, b: number, x: number) {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
}

/** Edge-weighted normal map for a rounded rect, or a magnifier for a disc. */
function buildMap(w: number, h: number, radius: number, bevel: number, mode: Mode) {
  const key = `${mode}:${w}x${h}:${radius}:${bevel}`;
  const hit = mapCache.get(key);
  if (hit) return hit;
  // the map is smooth, half resolution is plenty (lens wants full)
  const res = mode === "lens" ? 1 : Math.min(1, 360 / Math.max(w, h, 1)) * 0.9 + 0.1;
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
      let dx = 0;
      let dy = 0;
      if (mode === "lens") {
        // uniform magnification inside, a steeper fisheye in the outer rim
        const R = Math.min(hw, hh);
        const rx = px / R;
        const ry = py / R;
        const rr = Math.hypot(rx, ry);
        if (rr < 1) {
          const rim = smoothstep(0.72, 1, rr);
          const k = 0.78 + rim * 0.22;
          dx = -rx * k;
          dy = -ry * k;
        }
      } else {
        // signed distance to the rounded rect (negative inside)
        const qx = Math.abs(px) - (hw - r);
        const qy = Math.abs(py) - (hh - r);
        const ox = Math.max(qx, 0);
        const oy = Math.max(qy, 0);
        const outside = Math.hypot(ox, oy);
        const sd = outside + Math.min(Math.max(qx, qy), 0) - r;
        const depth = -sd;
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
  if (mapCache.size > 48) mapCache.clear();
  mapCache.set(key, url);
  return url;
}

const ONLY = {
  r: "1 0 0 0 0  0 0 0 0 0  0 0 0 0 0  0 0 0 1 0",
  g: "0 0 0 0 0  0 1 0 0 0  0 0 0 0 0  0 0 0 1 0",
  b: "0 0 0 0 0  0 0 0 0 0  0 0 1 0 0  0 0 0 1 0",
};

function Filter({
  id,
  w,
  h,
  url,
  strength,
  chroma,
}: {
  id: string;
  w: number;
  h: number;
  url: string;
  strength: number;
  chroma: number;
}) {
  const s = { r: strength * (1 + chroma), g: strength, b: strength * (1 - chroma) };
  return (
    <svg aria-hidden width="0" height="0" className="lg-defs" focusable="false">
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
    </svg>
  );
}

/**
 * Hook form. Render `layer` as the first child of the surface (class
 * `lg`), and put `ref` on the surface.
 *
 * The material lives on an inset child pane, not on the surface itself:
 * Chromium shifts an SVG backdrop filter's origin by the element's ink
 * overflow, so the drop shadow (and anything that overflows) must stay on
 * the parent while the refracting pane has none.
 */
export function useLiquidGlass<T extends HTMLElement>({
  enabled = true,
  radius = 28,
  bevel = 24,
  strength = 40,
  chroma = 0.05,
  mode = "rim",
}: GlassOptions = {}) {
  const ref = useRef<T>(null);
  const { refract } = useContext(GlassCtx);
  const on = refract && enabled;
  const [map, setMap] = useState<{ w: number; h: number; url: string } | null>(null);
  const id = "lg" + useId().replace(/[^a-zA-Z0-9]/g, "");

  useEffect(() => {
    if (!on) return;
    const el = ref.current;
    if (!el) return;
    let raf = 0;
    let last = "";
    const measure = () => {
      // layout size, unaffected by tilt/press transforms
      const w = Math.round(el.offsetWidth);
      const h = Math.round(el.offsetHeight);
      const k = `${w}x${h}`;
      if (k === last || w < 8 || h < 8) return;
      last = k;
      const rad = radius === "pill" ? h / 2 : Math.min(radius, w / 2, h / 2);
      const bev = Math.min(bevel, w / 2, h / 2);
      setMap({ w, h, url: buildMap(w, h, rad, bev, mode) });
    };
    const ro = new ResizeObserver(() => {
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(measure);
    });
    ro.observe(el);
    return () => {
      ro.disconnect();
      cancelAnimationFrame(raf);
    };
  }, [on, radius, bevel, mode]);

  const live = on && !!map;
  const layer = (
    <>
      {live && map && <Filter id={id} w={map.w} h={map.h} url={map.url} strength={strength} chroma={chroma} />}
      <span
        aria-hidden
        className="lg-pane"
        data-lg-live={live ? "" : undefined}
        style={live ? ({ "--lg-filter": `url(#${id})` } as React.CSSProperties) : undefined}
      />
    </>
  );
  return { ref, layer, live };
}

/** The frosted pane for surfaces that never refract. */
export function GlassPane() {
  return <span aria-hidden className="lg-pane" />;
}

/** Pointer-following specular sheen; writes CSS vars, never re-renders. */
export function sheenMove(e: React.PointerEvent<HTMLElement>) {
  if (e.pointerType !== "mouse") return;
  const el = e.currentTarget;
  const r = el.getBoundingClientRect();
  el.style.setProperty("--mx", `${(((e.clientX - r.left) / r.width) * 100).toFixed(1)}%`);
  el.style.setProperty("--my", `${(((e.clientY - r.top) / r.height) * 100).toFixed(1)}%`);
  el.style.setProperty("--sheen", "1");
}
export function sheenLeave(e: React.PointerEvent<HTMLElement>) {
  e.currentTarget.style.setProperty("--sheen", "0");
}

type DivProps = React.HTMLAttributes<HTMLDivElement> & GlassOptions & { thickness?: "thin" | "regular" | "thick" };

/** Plain div surface. */
export const LiquidGlass = forwardRef<HTMLDivElement, DivProps>(function LiquidGlass(
  { enabled, radius, bevel, strength, chroma, mode, thickness = "regular", className = "", style, children, ...rest },
  forwarded
) {
  const { ref, layer } = useLiquidGlass<HTMLDivElement>({ enabled, radius, bevel, strength, chroma, mode });
  return (
    <div
      {...rest}
      ref={(node) => {
        ref.current = node;
        if (typeof forwarded === "function") forwarded(node);
        else if (forwarded) forwarded.current = node;
      }}
      className={`lg lg--${thickness} ${className}`}
      style={style}
      onPointerMove={(e) => {
        sheenMove(e);
        rest.onPointerMove?.(e);
      }}
      onPointerLeave={(e) => {
        sheenLeave(e);
        rest.onPointerLeave?.(e);
      }}
    >
      {layer}
      {children}
    </div>
  );
});
