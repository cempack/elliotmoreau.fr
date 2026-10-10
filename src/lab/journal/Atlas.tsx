"use client";

import { useEffect, useId, useRef, useState } from "react";
import { m, useMotionValue, useScroll, useSpring, useTransform, useVelocity } from "motion/react";
import { PixelPlanet } from "@/components/PixelPlanet";
import { PLACES, fmtCoords, type Place } from "@/lib/places";
import { lenisRef } from "@/lib/lenisRef";
import { clamp, project } from "@/lib/motion";
import type { Lang } from "@/lib/i18n";
import { useMedia, useMotionPick, useReduced } from "./hooks";
import { useJ, type JStrings } from "./strings";

const BEEN = PLACES.filter((p) => p.status === "been");
const NEXT = PLACES.filter((p) => p.status === "want");

type Mode = "pin" | "swipe" | "grid";

const cardAt = (p: number) => Math.min(PLACES.length, Math.max(1, Math.round(p * (PLACES.length - 1)) + 1));

/**
 * Chapter three. Desktop: a pinned chapter — the page holds still while a
 * run of postcards slides past, driven by scroll (and draggable with a
 * mouse, with momentum). Touch: a native swipe row. Reduced motion: a
 * plain grid, no pin.
 */
export function Atlas() {
  const reduced = useReduced();
  const touch = useMedia("(max-width: 767px), (pointer: coarse)");
  const mode: Mode = reduced ? "grid" : touch ? "swipe" : "pin";
  if (mode === "pin") return <PinnedAtlas />;
  return <FlatAtlas mode={mode} />;
}

function AtlasTitle({ compact = false }: { compact?: boolean }) {
  const { c, j } = useJ();
  return (
    <div className={`j-atlas-title ${compact ? "is-compact" : ""}`}>
      <p className="j-ch-k">
        {j.chapter} III <span className="j-dim">—</span> 03
      </p>
      <h2 className="j-atlas-h">{c.atlas}</h2>
      <p className="j-atlas-sub">{c.atlasSub}</p>
      <p className="j-atlas-count">
        <span>
          <b>{BEEN.length}</b> {c.been.toLowerCase()}
        </span>
        <span className="j-dot" aria-hidden />
        <span>
          <b>{NEXT.length}</b> {c.want.toLowerCase()}
        </span>
      </p>
      {!compact && (
        <p className="j-atlas-hint" aria-hidden>
          {j.atlasHint}
          <span className="j-arrow">→</span>
        </p>
      )}
    </div>
  );
}

function NextDivider() {
  const { c } = useJ();
  return (
    <div className="j-atlas-div" aria-hidden>
      <span className="j-atlas-div-rule" />
      <span className="j-atlas-div-word">{c.want}.</span>
      <span className="j-atlas-div-rule" />
    </div>
  );
}

function Cards({ lang, j, drag }: { lang: Lang; j: JStrings; drag?: string }) {
  return (
    <>
      {BEEN.map((p, i) => (
        <Postcard key={p.id} place={p} i={i} lang={lang} j={j} drag={drag} />
      ))}
      <NextDivider />
      {NEXT.map((p, i) => (
        <Postcard key={p.id} place={p} i={BEEN.length + i} lang={lang} j={j} drag={drag} />
      ))}
    </>
  );
}

function PinnedAtlas() {
  const { c, j } = useJ();
  const wrapRef = useRef<HTMLElement>(null);
  const trackRef = useRef<HTMLDivElement>(null);
  const [dist, setDist] = useState(0);
  const distMV = useMotionValue(0);
  const [dragging, setDragging] = useState(false);
  const drag = useRef<{
    x: number;
    scroll: number;
    hist: { x: number; t: number }[];
    moved: boolean;
  } | null>(null);

  useEffect(() => {
    const track = trackRef.current;
    if (!track) return;
    const measure = () => {
      const d = Math.max(0, track.scrollWidth - window.innerWidth);
      distMV.set(d);
      setDist(d);
    };
    const ro = new ResizeObserver(measure);
    ro.observe(track);
    window.addEventListener("resize", measure);
    return () => {
      ro.disconnect();
      window.removeEventListener("resize", measure);
    };
  }, [distMV]);

  const { scrollYProgress } = useScroll({
    target: wrapRef,
    offset: ["start start", "end end"],
  });
  const x = useTransform(() => -scrollYProgress.get() * distMV.get());
  // the run leans a hair into fast scrolls, then settles: weight, not wobble
  const vel = useVelocity(scrollYProgress);
  const lean = useSpring(useTransform(vel, [-0.5, 0, 0.5], [2, 0, -2], { clamp: true }), {
    stiffness: 260,
    damping: 40,
  });

  const card = useMotionPick(scrollYProgress, cardAt, 1);

  const wrapTop = () => {
    const el = wrapRef.current;
    return el ? el.getBoundingClientRect().top + window.scrollY : 0;
  };
  const scrollTo = (y: number, immediate: boolean) => {
    const l = lenisRef.current;
    if (l)
      l.scrollTo(
        y,
        immediate
          ? { immediate: true, force: true }
          : {
              duration: 1.1,
              easing: (t) => 1 - Math.pow(1 - t, 4),
              force: true,
            },
      );
    else window.scrollTo({ top: y, behavior: immediate ? "instant" : "smooth" });
  };

  const onDown = (e: React.PointerEvent) => {
    if (e.pointerType !== "mouse" || e.button !== 0) return;
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    drag.current = {
      x: e.clientX,
      scroll: window.scrollY,
      hist: [{ x: e.clientX, t: e.timeStamp }],
      moved: false,
    };
    setDragging(true);
  };
  const onMove = (e: React.PointerEvent) => {
    const d = drag.current;
    if (!d) return;
    const dx = e.clientX - d.x;
    if (Math.abs(dx) > 3) d.moved = true;
    const top = wrapTop();
    scrollTo(clamp(d.scroll - dx, top, top + dist), true);
    d.hist.push({ x: e.clientX, t: e.timeStamp });
    if (d.hist.length > 10) d.hist.shift();
  };
  const onUp = () => {
    const d = drag.current;
    if (!d) return;
    drag.current = null;
    setDragging(false);
    const last = d.hist[d.hist.length - 1];
    let first = d.hist[0];
    for (let i = d.hist.length - 2; i >= 0; i--) {
      first = d.hist[i];
      if (last.t - d.hist[i].t > 80) break;
    }
    const dt = (last.t - first.t) / 1000;
    const v = dt > 0 ? (last.x - first.x) / dt : 0;
    if (Math.abs(v) < 60) return;
    const top = wrapTop();
    scrollTo(clamp(window.scrollY - project(v, 0.996), top, top + dist), false);
  };

  return (
    <section
      ref={wrapRef}
      id="atlas"
      data-chapter="atlas"
      className="j-atlas j-atlas--pin"
      style={{ height: `calc(100svh + ${dist}px)` }}
      aria-label={c.atlas}
    >
      <div className="j-atlas-sticky">
        <div className="j-wrap j-atlas-bar">
          <span className="j-kicker-n">03</span>
          <span className="j-kicker-rule" aria-hidden />
          <span className="j-kicker-label">{c.atlas}</span>
          <span className="j-atlas-progress" aria-hidden>
            <span>{c.been}</span>
            <span className="j-atlas-progress-bar">
              <m.span style={{ scaleX: scrollYProgress }} />
            </span>
            <span>{c.want}</span>
          </span>
          <span className="j-atlas-counter" aria-hidden>
            <b>{String(card).padStart(2, "0")}</b> / {String(PLACES.length).padStart(2, "0")}
          </span>
        </div>
        <div
          className="j-atlas-stage"
          data-dragging={dragging || undefined}
          data-cursor={c.drag}
          onPointerDown={onDown}
          onPointerMove={onMove}
          onPointerUp={onUp}
          onPointerCancel={onUp}
        >
          <m.div ref={trackRef} className="j-atlas-track" style={{ x, skewX: lean }}>
            <AtlasTitle />
            <Cards lang={c.lang} j={j} />
            <span className="j-atlas-end" aria-hidden />
          </m.div>
        </div>
      </div>
    </section>
  );
}

function FlatAtlas({ mode }: { mode: Exclude<Mode, "pin"> }) {
  const { c, j } = useJ();
  return (
    <section id="atlas" data-chapter="atlas" className={`j-sec j-atlas j-atlas--${mode}`} aria-label={c.atlas}>
      <div className="j-wrap">
        <AtlasTitle compact />
      </div>
      {mode === "swipe" ? (
        <div className="j-atlas-swipe" data-lenis-prevent>
          <Cards lang={c.lang} j={j} />
        </div>
      ) : (
        <div className="j-wrap j-atlas-grid">
          <Cards lang={c.lang} j={j} />
        </div>
      )}
      {mode === "swipe" && (
        <p className="j-wrap j-atlas-swipe-hint" aria-hidden>
          {j.swipeHint} <span className="j-arrow">→</span>
        </p>
      )}
    </section>
  );
}

function Postcard({ place, i, lang, j, drag }: { place: Place; i: number; lang: Lang; j: JStrings; drag?: string }) {
  const status = place.home ? "home" : place.status;
  const line = place.home ? j.lineHome : place.status === "been" ? j.lineBeen : j.lineWant;
  const mark = place.home ? j.stampHome : place.status === "been" ? j.markBeen : j.markNext;
  return (
    <article
      className="j-card"
      data-status={status}
      data-cursor={drag}
      style={{ ["--tilt" as string]: `${(i % 3) - 1}deg` }}
    >
      <div className="j-card-face">
        <div className="j-card-left">
          <p className="j-card-k">
            {j.postcard} <span>№ {String(i + 1).padStart(2, "0")}</span>
          </p>
          <h3 className="j-card-name">{place.name[lang]}</h3>
          <p className="j-card-line">
            <em>{line}</em>
          </p>
          <p className="j-card-sign">— E.</p>
        </div>
        <span className="j-card-div" aria-hidden />
        <div className="j-card-right">
          <div className="j-card-top">
            <Postmark text={mark} status={status} />
            <span className="j-stamp" aria-hidden>
              <span className="j-stamp-inner">
                <PixelPlanet seed={place.id} className="j-stamp-art" />
              </span>
            </span>
          </div>
          <div className="j-card-addr">
            <span>
              {j.to} <em>{j.addressee}</em>
            </span>
            <span className="j-card-coords">{fmtCoords(place.lat, place.lon)}</span>
            <span className="j-card-region">{place.region[lang]}</span>
          </div>
        </div>
      </div>
    </article>
  );
}

/** Circular rubber stamp with wavy cancellation lines. */
function Postmark({ text }: { text: string; status: string }) {
  const id = useId();
  return (
    <svg className="j-postmark" viewBox="0 0 150 80" aria-hidden>
      <defs>
        <path id={id} d="M40 40 m-27 0 a27 27 0 1 1 54 0 a27 27 0 1 1 -54 0" />
      </defs>
      <g fill="none" stroke="currentColor" strokeWidth="1.4">
        <circle cx="40" cy="40" r="35" />
        <circle cx="40" cy="40" r="20" strokeWidth="1" />
        <path d="M78 26 q8 -5 16 0 t16 0 t16 0 t16 0" />
        <path d="M78 36 q8 -5 16 0 t16 0 t16 0 t16 0" />
        <path d="M78 46 q8 -5 16 0 t16 0 t16 0 t16 0" />
        <path d="M78 56 q8 -5 16 0 t16 0 t16 0 t16 0" />
      </g>
      <text fill="currentColor" fontSize="7.2" letterSpacing="1.6" className="j-postmark-ring">
        <textPath href={`#${id}`}>ELLIOT MOREAU · ATLAS · FRANCE ·</textPath>
      </text>
      <text x="40" y="43" textAnchor="middle" fill="currentColor" fontSize="10" className="j-postmark-word">
        {text.toUpperCase()}
      </text>
    </svg>
  );
}
