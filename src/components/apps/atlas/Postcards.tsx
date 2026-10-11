"use client";

import { useEffect, useRef, useState } from "react";
import { animate, m, useMotionValue } from "motion/react";
import { useI18n } from "@/i18n/client";
import { nearest, project, rubberband, spring } from "@/lib/motion";
import { useReduced } from "@/hooks/env";
import { PixelGlyph } from "@/components/glyphs";
import { G_CHEVRON } from "@/components/os/window/glyphs";
import { HOME, fmtCoords } from "@/lib/places";
import { ORDERED, distanceKm } from "./geo";
import { PixelMap } from "./PixelMap";
import { Stamp } from "./Stamp";
import { StatusChip } from "./PlaceCard";
import { fill, useKm } from "./fmt";

type Sample = { t: number; x: number };

function velocity(samples: Sample[], now: number) {
  const last = samples[samples.length - 1];
  if (!last || now - last.t > 60) return 0;
  let first = last;
  for (let i = samples.length - 1; i >= 0; i--) {
    if (last.t - samples[i].t > 80) break;
    first = samples[i];
  }
  const dt = Math.max(8, last.t - first.t);
  return ((last.x - first.x) / dt) * 1000;
}

const band = (v: number, min: number, max: number, dim: number) =>
  v < min ? min - rubberband(min - v, dim) : v > max ? max + rubberband(v - max, dim) : v;

/**
 * A strip of pixel-map postcards, one per place, that you fling.
 * 1:1 from the grab point, rubber-banded past both ends; on release the
 * velocity is projected (project()) and the strip springs to the nearest
 * card edge carrying that velocity (a little bounce only after a real
 * throw). Trackpad swipes, arrow buttons and focus all land on the same
 * snap points. A click (not a drag) flies the globe there.
 */
export function Postcards({
  selectedId,
  onPick,
  compact = false,
}: {
  selectedId: string;
  onPick: (id: string) => void;
  compact?: boolean;
}) {
  const { t, lang } = useI18n();
  const a = t.atlas;
  const fmt = useKm();
  const reduced = useReduced();
  const viewRef = useRef<HTMLDivElement>(null);
  const trackRef = useRef<HTMLUListElement>(null);
  const x = useMotionValue(0);
  const geo = useRef({ min: 0, step: 1, w: 1 });
  const [ends, setEnds] = useState({ start: true, end: false });
  const grab = useRef<{ id: number; sx: number; sy: number; x0: number; on: boolean; samples: Sample[] } | null>(null);
  const dragged = useRef(false);

  const snaps = () => {
    const { min, step } = geo.current;
    const out: number[] = [];
    for (let v = 0; v > min; v -= step) out.push(v);
    out.push(min);
    return out;
  };

  const settle = (to: number, v = 0) => {
    if (reduced) {
      x.jump(to);
      return;
    }
    animate(x, to, { ...(Math.abs(v) > 900 ? spring.flick : spring.default), velocity: v });
  };

  // geometry + which ends are reached (for the arrow buttons)
  useEffect(() => {
    const view = viewRef.current;
    const track = trackRef.current;
    if (!view || !track) return;
    const measure = () => {
      const first = track.querySelector<HTMLElement>("li");
      const gap = parseFloat(getComputedStyle(track).columnGap) || 0;
      const w = view.clientWidth;
      const min = Math.min(0, w - track.scrollWidth);
      geo.current = { min, step: (first?.offsetWidth ?? 300) + gap, w };
      if (x.get() < min) x.jump(min);
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(view);
    ro.observe(track);
    const unsub = x.on("change", (v) => {
      const start = v > -2;
      const end = v < geo.current.min + 2;
      setEnds((e) => (e.start === start && e.end === end ? e : { start, end }));
    });
    // horizontal trackpad swipes move the strip; it settles when they stop
    let idle = 0;
    const onWheel = (e: WheelEvent) => {
      if (Math.abs(e.deltaX) <= Math.abs(e.deltaY)) return;
      e.preventDefault();
      x.stop();
      const { min, w: vw } = geo.current;
      x.set(band(x.get() - e.deltaX, min, 0, vw * 0.25));
      window.clearTimeout(idle);
      idle = window.setTimeout(() => {
        const to = nearest(Math.min(0, Math.max(min, x.get())), snaps());
        settle(to);
      }, 140);
    };
    view.addEventListener("wheel", onWheel, { passive: false });
    return () => {
      ro.disconnect();
      unsub();
      view.removeEventListener("wheel", onWheel);
      window.clearTimeout(idle);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [x]);

  const onPointerDown = (e: React.PointerEvent) => {
    if (e.button !== 0) return;
    x.stop();
    dragged.current = false;
    grab.current = { id: e.pointerId, sx: e.clientX, sy: e.clientY, x0: x.get(), on: false, samples: [{ t: e.timeStamp, x: e.clientX }] };
  };
  const onPointerMove = (e: React.PointerEvent) => {
    const g = grab.current;
    if (!g || g.id !== e.pointerId) return;
    const dx = e.clientX - g.sx;
    const dy = e.clientY - g.sy;
    if (!g.on) {
      if (Math.abs(dy) > 8 && Math.abs(dy) > Math.abs(dx)) {
        grab.current = null; // a vertical gesture: not ours
        return;
      }
      if (Math.abs(dx) < 6) return;
      g.on = true;
      dragged.current = true;
      (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
      viewRef.current?.setAttribute("data-grabbing", "");
    }
    const { min, w } = geo.current;
    x.set(band(g.x0 + dx, min, 0, w));
    g.samples.push({ t: e.timeStamp, x: e.clientX });
    if (g.samples.length > 12) g.samples.shift();
  };
  const onPointerUp = (e: React.PointerEvent) => {
    const g = grab.current;
    grab.current = null;
    viewRef.current?.removeAttribute("data-grabbing");
    if (!g || !g.on) return;
    const v = reduced ? 0 : velocity(g.samples, e.timeStamp);
    const { min } = geo.current;
    const to = nearest(Math.min(0, Math.max(min, x.get() + project(v))), snaps());
    settle(to, v);
  };

  const page = (dir: 1 | -1) => {
    const { min, step, w } = geo.current;
    const per = Math.max(1, Math.floor(w / step));
    const cur = Math.round(-x.get() / step);
    const to = Math.max(min, Math.min(0, -(cur + dir * per) * step));
    settle(nearest(to, snaps()));
  };

  // keyboard focus brings its card into view on the same snap points
  const reveal = (i: number) => {
    const { min, step, w } = geo.current;
    const left = i * step;
    const cur = -x.get();
    if (left >= cur && left + step <= cur + w + 1) return;
    const want = left < cur ? -left : -(left + step - w);
    settle(nearest(Math.max(min, Math.min(0, want)), snaps()));
  };

  return (
    <div className="app-atlas-pcs" data-compact={compact || undefined}>
      {!compact && (
        <div className="app-atlas-pcs-nav">
          <button type="button" className="app-atlas-pcs-btn" onClick={() => page(-1)} disabled={ends.start} aria-label={a.postcards.prev}>
            <PixelGlyph cells={G_CHEVRON} size={11} className="app-atlas-step-prev" />
          </button>
          <button type="button" className="app-atlas-pcs-btn" onClick={() => page(1)} disabled={ends.end} aria-label={a.postcards.next}>
            <PixelGlyph cells={G_CHEVRON} size={11} className="app-atlas-step-next" />
          </button>
        </div>
      )}
      <div
        ref={viewRef}
        className="app-atlas-pcs-view"
        data-atlas-hscroll=""
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
        onClickCapture={(e) => {
          if (dragged.current) {
            e.preventDefault();
            e.stopPropagation();
            dragged.current = false;
          }
        }}
      >
        <m.ul ref={trackRef} className="app-atlas-pcs-track" role="list" aria-label={a.postcards.label} style={{ x }}>
          {ORDERED.map((p, i) => {
            const name = p.name[lang];
            const active = p.id === selectedId;
            const km = distanceKm(HOME, p);
            return (
              <li key={p.id} className="app-atlas-pc-li">
                <button
                  type="button"
                  className="app-atlas-pc"
                  data-active={active || undefined}
                  data-tone={p.home ? "home" : p.status}
                  aria-pressed={active}
                  aria-label={`${a.postcards.show}: ${name}`}
                  data-cursor={a.postcards.show}
                  onClick={() => onPick(p.id)}
                  onFocus={() => reveal(i)}
                  draggable={false}
                >
                  <span className="app-atlas-pc-art" role="img" aria-label={fill(a.postcards.map, { place: name })}>
                    <PixelMap place={p} className="app-atlas-pc-map" />
                  </span>
                  <span className="app-atlas-pc-scrim" aria-hidden />
                  <span className="app-atlas-pc-chip">
                    <StatusChip place={p} />
                  </span>
                  <span className="app-atlas-pc-stamp">
                    <Stamp place={p} size="sm" />
                  </span>
                  <span className="app-atlas-pc-text">
                    <span className="app-atlas-pc-kicker">{a.postcards.greetings}</span>
                    <span className="app-atlas-pc-name">{name}</span>
                    <span className="app-atlas-pc-meta tabular">
                      {fmtCoords(p.lat, p.lon)}
                      {!p.home && ` · ${fmt(km)} ${a.km}`}
                    </span>
                  </span>
                </button>
              </li>
            );
          })}
        </m.ul>
      </div>
    </div>
  );
}
