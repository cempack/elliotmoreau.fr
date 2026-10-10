"use client";

import "./miniplayer.css";
import { useCallback, useEffect, useId, useLayoutEffect, useRef, useState } from "react";
import { animate, m, useMotionValue } from "motion/react";
import { useI18n } from "@/i18n/client";
import { useSound } from "@/lib/sound";
import { project, rubberband, spring } from "@/lib/motion";
import { useHydrated, useReduced } from "@/hooks/env";
import { useSpotifyStatus } from "@/hooks/useSpotifyStatus";
import { PixelPlanet } from "@/components/PixelPlanet";
import { PixelGlyph } from "@/components/glyphs";
import { SOCIALS } from "@/lib/places";
import { timeAgo } from "@/lib/format";
import type { TrackInfo } from "@/lib/spotify";
import { useSiteData } from "./SiteData";
import { Glass } from "./Glass";
import { PixelEq } from "./window/PixelEq";
import { releaseVelocity } from "./window/useWindowDrag";
import { G_CHEVRON, G_EXTERNAL } from "./window/glyphs";

type Corner = "tl" | "tr" | "bl" | "br";
const CORNERS: Corner[] = ["tl", "tr", "bl", "br"];
const CORNER_KEY = "em-pip-corner";
const COLLAPSED_KEY = "em-pip-collapsed";

/**
 * CONTRACT (owner: window agent)
 * Persistent now-playing picture-in-picture widget (fixed, all routes).
 * Glass card: artwork (or seeded PixelPlanet when there's no image),
 * title/artist, pixel equalizer that moves only while playing, progress.
 * Fling it with a pointer/finger: 1:1 tracking from the grab offset, on
 * release project the velocity (project()) and snap to the nearest of
 * four safe corners (clear of menu bar and dock) with a spring carrying
 * the release velocity (spring.flick only after a real throw); rubber-band
 * past the viewport. Remembers its corner. Collapses to a pill on tap of a
 * chevron; hidden when there's no track. Reads useSpotifyStatus(seed from
 * useSiteData().spotify).
 */
export function MiniPlayer() {
  const hydrated = useHydrated();
  const { spotify } = useSiteData();
  const { status, track, playing } = useSpotifyStatus(spotify);
  // client-only: its corner lives in localStorage
  if (!hydrated || !track) return null;
  return <Pip track={track} playing={playing} live={Boolean(status?.now)} />;
}

type Grab = {
  pid: number;
  sx: number;
  sy: number;
  x0: number;
  y0: number;
  moved: boolean;
  samples: { t: number; x: number; y: number }[];
};

function band(v: number, min: number, max: number, dim: number) {
  if (v < min) return min - rubberband(min - v, dim);
  if (v > max) return max + rubberband(v - max, dim);
  return v;
}

const fmt = (ms: number) => {
  const s = Math.max(0, Math.floor(ms / 1000));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
};

function readCorner(): Corner {
  try {
    const v = localStorage.getItem(CORNER_KEY) as Corner | null;
    if (v && CORNERS.includes(v)) return v;
  } catch {}
  return "br";
}
function readCollapsed() {
  try {
    const v = localStorage.getItem(COLLAPSED_KEY);
    if (v === "1" || v === "0") return v === "1";
  } catch {}
  // phones start as the pill: the content is the point there
  return window.matchMedia("(max-width: 767px)").matches;
}
const save = (k: string, v: string) => {
  try {
    localStorage.setItem(k, v);
  } catch {}
};

function Art({ track, round }: { track: TrackInfo; round: boolean }) {
  return (
    <m.span
      layoutId="os-pip-art"
      className="os-pip-art"
      data-round={round || undefined}
      style={{ borderRadius: round ? 999 : 12 }}
      transition={spring.default}
    >
      {track.image ? (
        // remote album art, already small: next/image would need a remote loader
        // eslint-disable-next-line @next/next/no-img-element
        <img src={track.image} alt="" draggable={false} className="os-pip-img" />
      ) : (
        <PixelPlanet seed={`${track.title} · ${track.artist}`} className="os-pip-planet" />
      )}
    </m.span>
  );
}

function Pip({ track, playing, live }: { track: TrackInfo; playing: boolean; live: boolean }) {
  const { t, lang } = useI18n();
  const p = t.windowing.player;
  const { blip } = useSound();
  const reduced = useReduced();
  const [collapsed, setCollapsed] = useState(readCollapsed);
  const [placed, setPlaced] = useState(false);
  const [announce, setAnnounce] = useState("");
  const hintId = useId();
  const rootRef = useRef<HTMLElement>(null);
  const safeRef = useRef<HTMLSpanElement>(null);
  const corner = useRef<Corner>("br");
  const grab = useRef<Grab | null>(null);
  const dragged = useRef(false);
  const firstLayout = useRef(true);
  const x = useMotionValue(0);
  const y = useMotionValue(0);
  const s = useMotionValue(1);
  const originX = useMotionValue(1);
  const originY = useMotionValue(1);

  /** Top-left position of the card in a corner of the safe area. */
  const targetFor = useCallback((c: Corner) => {
    const el = rootRef.current;
    const safe = safeRef.current;
    if (!el || !safe) return { x: 0, y: 0 };
    const r = safe.getBoundingClientRect();
    const w = el.offsetWidth;
    const h = el.offsetHeight;
    return {
      x: c[1] === "l" ? r.left : Math.max(r.left, r.right - w),
      y: c[0] === "t" ? r.top : Math.max(r.top, r.bottom - h),
    };
  }, []);

  // seat it in its remembered corner, and keep it there on resize
  useLayoutEffect(() => {
    corner.current = readCorner();
    const place = () => {
      if (grab.current) return;
      const to = targetFor(corner.current);
      x.jump(to.x);
      y.jump(to.y);
    };
    place();
    // grow in from its corner (scale, never opacity: that would blank the glass)
    const [v, h] = corner.current;
    originX.jump(h === "l" ? 0 : 1);
    originY.jump(v === "t" ? 0 : 1);
    if (!window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      s.jump(0.82);
      animate(s, 1, { ...spring.gentle, delay: 0.35 });
    }
    queueMicrotask(() => setPlaced(true));
    window.addEventListener("resize", place);
    return () => window.removeEventListener("resize", place);
  }, [targetFor, x, y, s, originX, originY]);

  // collapse/expand: the card resizes on a layout spring; the same spring
  // carries it to its corner, so the corner-side edges stay pinned
  useLayoutEffect(() => {
    if (firstLayout.current) {
      firstLayout.current = false;
      return;
    }
    const to = targetFor(corner.current);
    if (reduced) {
      x.jump(to.x);
      y.jump(to.y);
      return;
    }
    animate(x, to.x, spring.default);
    animate(y, to.y, spring.default);
  }, [collapsed, reduced, targetFor, x, y]);

  // progress: interpolate locally between polls, in whole pixel cells
  const sync = useRef({ ms: track.progressMs, at: 0 });
  const trackRef = useRef<HTMLSpanElement>(null);
  const fillRef = useRef<HTMLSpanElement>(null);
  const fillInnerRef = useRef<HTMLSpanElement>(null);
  const elapsedRef = useRef<HTMLSpanElement>(null);
  useEffect(() => {
    sync.current = { ms: track.progressMs, at: performance.now() };
  }, [track]);
  useEffect(() => {
    if (!live || collapsed) return;
    const dur = track.durationMs;
    let raf = 0;
    let lastSec = -1;
    let lastLit = -1;
    const tick = () => {
      const { ms: base, at } = sync.current;
      const ms = Math.min(dur, base + (playing ? performance.now() - at : 0));
      const bar = trackRef.current;
      const fill = fillRef.current;
      const inner = fillInnerRef.current;
      if (bar && fill && inner && dur > 0) {
        const W = bar.clientWidth;
        const lit = Math.round(((ms / dur) * W) / 4) * 4;
        if (lit !== lastLit) {
          lastLit = lit;
          fill.style.transform = `translateX(${lit - W}px)`;
          inner.style.transform = `translateX(${W - lit}px)`;
        }
      }
      const sec = Math.floor(ms / 1000);
      if (sec !== lastSec) {
        lastSec = sec;
        if (elapsedRef.current) elapsedRef.current.textContent = fmt(ms);
        bar?.setAttribute("aria-valuenow", String(sec));
        bar?.setAttribute("aria-valuetext", `${fmt(ms)} / ${fmt(dur)}`);
      }
      if (playing && ms < dur) raf = requestAnimationFrame(tick);
    };
    tick();
    return () => cancelAnimationFrame(raf);
  }, [track, playing, live, collapsed]);

  const snapTo = (c: Corner, vx: number, vy: number, viaKey = false) => {
    const changed = c !== corner.current;
    corner.current = c;
    save(CORNER_KEY, c);
    const to = targetFor(c);
    if (reduced) {
      x.jump(to.x);
      y.jump(to.y);
    } else {
      // a little bounce only when it was actually thrown
      const tr = Math.hypot(vx, vy) > 800 ? spring.flick : spring.default;
      animate(x, to.x, { ...tr, velocity: vx });
      animate(y, to.y, { ...tr, velocity: vy });
    }
    if (changed) blip("tick");
    if (viaKey) setAnnounce(p.corner[c]);
  };

  const onPointerDown = (e: React.PointerEvent<HTMLElement>) => {
    const el = rootRef.current;
    if (!el || grab.current) return;
    if (e.pointerType === "mouse" && e.button !== 0) return;
    dragged.current = false;
    x.stop();
    y.stop();
    grab.current = {
      pid: e.pointerId,
      sx: e.clientX,
      sy: e.clientY,
      x0: x.get(),
      y0: y.get(),
      moved: false,
      samples: [{ t: e.timeStamp, x: e.clientX, y: e.clientY }],
    };
    // respond on touch-down: the card lifts toward the hand
    if (Math.abs(s.get() - 1) < 0.001) {
      originX.jump(0.5);
      originY.jump(0.5);
    }
    if (!reduced) animate(s, 1.03, spring.snappy);

    const move = (ev: PointerEvent) => {
      const g = grab.current;
      if (!g || ev.pointerId !== g.pid) return;
      const dx = ev.clientX - g.sx;
      const dy = ev.clientY - g.sy;
      if (!g.moved) {
        if (Math.hypot(dx, dy) < 4) return;
        g.moved = true;
        dragged.current = true;
        el.dataset.dragging = "";
      }
      g.samples.push({ t: ev.timeStamp, x: ev.clientX, y: ev.clientY });
      while (g.samples.length > 2 && ev.timeStamp - g.samples[0].t > 120) g.samples.shift();
      const vw = window.innerWidth;
      const vh = window.innerHeight;
      x.set(band(g.x0 + dx, 0, vw - el.offsetWidth, vw));
      y.set(band(g.y0 + dy, 0, vh - el.offsetHeight, vh));
    };
    const finish = (ev: PointerEvent) => {
      const g = grab.current;
      if (!g || ev.pointerId !== g.pid) return;
      grab.current = null;
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", finish);
      window.removeEventListener("pointercancel", finish);
      if (reduced) s.jump(1);
      else animate(s, 1, spring.snappy);
      if (!g.moved) return;
      delete el.dataset.dragging;
      const cancelled = ev.type === "pointercancel";
      const { vx, vy } = cancelled ? { vx: 0, vy: 0 } : releaseVelocity(g.samples, ev.timeStamp);
      // where the throw would come to rest picks the corner, not where it let go
      const px = x.get() + project(vx);
      const py = y.get() + project(vy);
      let best: Corner = corner.current;
      let bestD = Infinity;
      for (const c of CORNERS) {
        const to = targetFor(c);
        const d = Math.hypot(to.x - px, to.y - py);
        if (d < bestD) {
          bestD = d;
          best = c;
        }
      }
      snapTo(best, vx, vy);
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", finish);
    window.addEventListener("pointercancel", finish);
  };

  const onKeyDown = (e: React.KeyboardEvent<HTMLElement>) => {
    if (e.metaKey || e.ctrlKey || e.altKey) return;
    const [v, h] = corner.current;
    const next =
      e.key === "ArrowLeft"
        ? `${v}l`
        : e.key === "ArrowRight"
          ? `${v}r`
          : e.key === "ArrowUp"
            ? `t${h}`
            : e.key === "ArrowDown"
              ? `b${h}`
              : null;
    if (!next) return;
    e.preventDefault();
    if (next !== corner.current) snapTo(next as Corner, 0, 0, true);
  };

  const toggle = () => {
    const next = !collapsed;
    setCollapsed(next);
    save(COLLAPSED_KEY, next ? "1" : "0");
    blip("toggle");
  };

  const kicker = !live ? p.lastPlayed : playing ? p.nowPlaying : p.paused;
  const href = track.url || SOCIALS.spotifyUser;
  const durSec = Math.floor(track.durationMs / 1000);

  return (
    <>
      <span ref={safeRef} className="os-pip-safe" aria-hidden />
      <m.aside
        ref={rootRef}
        layout
        aria-label={p.region}
        aria-describedby={hintId}
        className="os-pip"
        data-collapsed={collapsed || undefined}
        data-placed={placed || undefined}
        style={{ x, y, scale: s, originX, originY }}
        animate={{ borderRadius: collapsed ? 26 : 20 }}
        transition={{ layout: spring.default, borderRadius: spring.default }}
        onPointerDown={onPointerDown}
        onKeyDown={onKeyDown}
        onClickCapture={(e) => {
          // a drag that ended on a control is not a click
          if (!dragged.current) return;
          dragged.current = false;
          e.preventDefault();
          e.stopPropagation();
        }}
      >
        <Glass thickness="thick" className="os-pip-glass" aria-hidden />
        <span className="os-pip-sheen" aria-hidden />

        {collapsed ? (
          <button
            type="button"
            className="os-pip-pill"
            onClick={toggle}
            aria-expanded={false}
            aria-label={`${p.expand}: ${track.title}, ${track.artist}`}
          >
            <Art track={track} round />
            <m.span layoutId="os-pip-eq" className="os-pip-eq" transition={spring.default}>
              <PixelEq playing={playing} />
            </m.span>
          </button>
        ) : (
          <>
            <m.div layout="position" className="os-pip-row">
              <Art track={track} round={false} />
              <div className="os-pip-meta">
                <p className="os-pip-kicker">
                  <span className="os-pip-dot" data-live={(live && playing) || undefined} aria-hidden />
                  <span>{kicker}</span>
                  <m.span layoutId="os-pip-eq" className="os-pip-eq" transition={spring.default}>
                    <PixelEq playing={playing} />
                  </m.span>
                </p>
                <p className="os-pip-title" title={track.title}>
                  {track.title}
                </p>
                <p className="os-pip-artist" title={track.artist}>
                  <span className="sr-only">{p.by} </span>
                  {track.artist}
                </p>
              </div>
              <div className="os-pip-actions">
                <button
                  type="button"
                  className="os-pip-btn"
                  onClick={toggle}
                  aria-expanded
                  aria-label={p.collapse}
                >
                  <PixelGlyph cells={G_CHEVRON} size={14} />
                </button>
                <a
                  href={href}
                  target="_blank"
                  rel="noreferrer"
                  draggable={false}
                  className="os-pip-btn"
                  aria-label={p.openSpotify}
                >
                  <PixelGlyph cells={G_EXTERNAL} size={14} />
                </a>
              </div>
            </m.div>

            {live ? (
              <m.div layout="position" className="os-pip-foot">
                <span ref={elapsedRef} className="os-pip-time tabular">
                  {fmt(track.progressMs)}
                </span>
                <span
                  ref={trackRef}
                  role="progressbar"
                  aria-label={p.progress}
                  aria-valuemin={0}
                  aria-valuemax={durSec}
                  className="os-pip-track"
                >
                  <span ref={fillRef} className="os-pip-fill">
                    <span ref={fillInnerRef} className="os-pip-fill-cells" />
                  </span>
                </span>
                <span className="os-pip-time tabular">{fmt(track.durationMs)}</span>
              </m.div>
            ) : (
              track.playedAt && (
                <m.div layout="position" className="os-pip-foot">
                  <span className="os-pip-time">{timeAgo(track.playedAt, lang)}</span>
                </m.div>
              )
            )}
          </>
        )}
        <span id={hintId} className="sr-only">
          {p.moveHint}
        </span>
        <span className="sr-only" aria-live="polite">
          {announce}
        </span>
      </m.aside>
    </>
  );
}
