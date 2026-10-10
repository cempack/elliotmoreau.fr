"use client";

import { useEffect, useId, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { animate, m, useMotionValue, useTransform } from "motion/react";
import type { RepoInfo } from "@/lib/github";
import { useI18n } from "@/i18n/client";
import { project, rubberband, spring } from "@/lib/motion";
import { useSound } from "@/lib/sound";
import { lenisRef } from "@/lib/lenisRef";
import { timeAgo } from "@/lib/format";
import { SOCIALS } from "@/lib/places";
import { useReduced } from "@/hooks/env";
import { PixelPlanet } from "@/components/PixelPlanet";
import { GLYPH_STAR, PixelGlyph } from "@/components/glyphs";
import { useSheetDismiss } from "@/components/ui/Sheet";
import { DitherStage } from "./DitherStage";
import { G_ARROW, G_CHECK, G_CLOSE, G_COPY, G_FORK } from "./glyphs";
import { compact, fmt, langColor } from "./model";

type Sample = { t: number; x: number; y: number };
type Velocity = { x: number; y: number };

/** the zoom out of (and back into) an icon: critically damped, a touch slower than default */
const ZOOM = { type: "spring", visualDuration: 0.42, bounce: 0 } as const;
const clamp01 = (v: number) => (v < 0 ? 0 : v > 1 ? 1 : v);
const lerp = (a: number, b: number, t: number) => a + (b - a) * t;

/** px/s over the last ~80ms of pointer history; 0 when the hand had stopped */
function velocity(samples: Sample[], now: number): Velocity {
  const last = samples[samples.length - 1];
  if (!last || now - last.t > 70) return { x: 0, y: 0 };
  let first = last;
  for (let i = samples.length - 1; i >= 0; i--) {
    if (last.t - samples[i].t > 80) break;
    first = samples[i];
  }
  const dt = Math.max(8, last.t - first.t);
  return { x: ((last.x - first.x) / dt) * 1000, y: ((last.y - first.y) / dt) * 1000 };
}

const NO_DRAG = "a,button,input,textarea,select,summary,[data-no-drag]";

/**
 * Quick Look, the signature gesture of Projects. A thick glass panel that
 * zooms out of the item it describes (from that item's exact rect) and
 * back into it on Space, Esc, the close button or a click outside. Grab
 * it anywhere and it follows the hand 1:1, shrinking as it is pulled
 * down; let go and the release velocity is projected: thrown far enough
 * it flies home into its icon carrying that velocity, otherwise it springs
 * back to centre (with a little bounce only after a real fling). Arrow
 * keys browse to the neighbouring projects without closing, like Finder.
 *
 * Desktop only (≥768px); phones get the same body in a Sheet. A native
 * modal <dialog> in the top layer: focus moves in, the page goes inert,
 * focus returns to the item on close.
 */
export function QuickLook({
  repo,
  hydrated,
  getOrigin,
  onStep,
  onTag,
  onClosed,
}: {
  repo: RepoInfo;
  hydrated: boolean;
  /** the element to zoom out of / back into (looked up at open and close) */
  getOrigin: () => HTMLElement | null;
  onStep: (dir: 1 | -1) => void;
  onTag: (tag: string) => void;
  onClosed: (after?: () => void) => void;
}) {
  const { t } = useI18n();
  const q = t.work.ql;
  const { blip } = useSound();
  const reduced = useReduced();
  const titleId = useId();
  const dialogRef = useRef<HTMLDialogElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const closing = useRef(false);
  const grab = useRef<{ id: number; sx: number; sy: number; dx0: number; dy0: number; samples: Sample[] } | null>(
    null
  );

  // p: 0 = folded into the origin, 1 = open. dx/dy/ds: the hand's offset
  // and the shrink it causes. ox/oy/os: the origin, relative to centre.
  const p = useMotionValue(0);
  const dx = useMotionValue(0);
  const dy = useMotionValue(0);
  const ds = useMotionValue(1);
  const fade = useMotionValue(1);
  const ox = useMotionValue(0);
  const oy = useMotionValue(0);
  const os = useMotionValue(0.92);
  const fadeIn = useMotionValue(0.2);

  const x = useTransform(() => lerp(ox.get(), 0, p.get()) + dx.get());
  const y = useTransform(() => lerp(oy.get(), 0, p.get()) + dy.get());
  const scale = useTransform(() => lerp(os.get(), 1, p.get()) * ds.get());
  const shell = useTransform(() => clamp01(p.get() / fadeIn.get()) * fade.get());
  const content = useTransform(() => (fadeIn.get() >= 1 ? p.get() : clamp01((p.get() - 0.5) / 0.38)) * fade.get());
  const scrim = useTransform(() => p.get() * fade.get() * (1 - clamp01(Math.max(0, dy.get()) / 520)));

  /** origin centre and scale relative to the panel's resting box, or null if off screen */
  const measure = () => {
    const el = getOrigin();
    const panel = panelRef.current;
    if (!el || !panel) return null;
    const r = el.getBoundingClientRect();
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    if (r.width < 2 || r.bottom < 24 || r.top > vh - 24 || r.right < 0 || r.left > vw) return null;
    const pw = panel.offsetWidth;
    const ph = panel.offsetHeight;
    const cx = panel.offsetLeft + pw / 2;
    const cy = panel.offsetTop + ph / 2;
    const s = Math.sqrt((r.width * r.height) / (pw * ph));
    return { x: r.left + r.width / 2 - cx, y: r.top + r.height / 2 - cy, s: Math.min(1, Math.max(0.05, s)) };
  };

  // open: into the top layer, zoom out of the origin
  useLayoutEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    if (!dialog.open) dialog.showModal();
    const o = reduced ? null : measure();
    if (reduced) {
      os.set(1);
      fadeIn.set(1);
    } else if (o) {
      ox.set(o.x);
      oy.set(o.y);
      os.set(o.s);
    }
    const anim = animate(p, 1, reduced ? { duration: 0.15, ease: "linear" } : ZOOM);
    panelRef.current?.focus({ preventScroll: true });
    lenisRef.current?.stop();
    const root = document.documentElement;
    const prevOverflow = root.style.overflow;
    root.style.overflow = "hidden";
    blip("open");
    return () => {
      anim.stop();
      lenisRef.current?.start();
      root.style.overflow = prevOverflow;
      if (dialog.open) dialog.close();
    };
    // mount-only: the zoom runs once; later origins are measured at close
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const close = (after?: () => void, v: Velocity = { x: 0, y: 0 }) => {
    if (closing.current) return;
    closing.current = true;
    grab.current = null;
    blip("close");
    const done = () => {
      dialogRef.current?.close();
      onClosed(after);
    };
    if (reduced) {
      animate(p, 0, { duration: 0.15, ease: "linear" }).then(done);
      return;
    }
    const o = measure();
    if (o) {
      // home into the icon, carrying the hand's velocity
      ox.set(o.x);
      oy.set(o.y);
      os.set(o.s);
      animate(dx, 0, { ...ZOOM, velocity: v.x });
      animate(dy, 0, { ...ZOOM, velocity: v.y });
      animate(ds, 1, ZOOM);
      animate(p, 0, ZOOM).then(done);
    } else {
      // nowhere to go home to (scrolled away / filtered out): fall off screen
      animate(dy, dy.get() + window.innerHeight * 0.6, { ...spring.default, velocity: Math.max(v.y, 600) });
      animate(fade, 0, { duration: 0.24, ease: [0.4, 0, 1, 1] }).then(done);
    }
  };

  const onPointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    if (closing.current || e.button !== 0) return;
    const target = e.target as HTMLElement;
    if (target.closest(NO_DRAG)) return;
    const scroller = target.closest<HTMLElement>("[data-ql-scroll]");
    if (e.pointerType !== "mouse" && scroller && scroller.scrollHeight > scroller.clientHeight + 2) return;
    e.currentTarget.setPointerCapture(e.pointerId);
    dx.stop();
    dy.stop();
    grab.current = {
      id: e.pointerId,
      sx: e.clientX,
      sy: e.clientY,
      dx0: dx.get(),
      dy0: dy.get(),
      samples: [{ t: e.timeStamp, x: e.clientX, y: e.clientY }],
    };
    e.currentTarget.dataset.grabbed = "";
    // respond on pointer-down: the panel lifts a hair under the hand
    animate(ds, 0.985, spring.snappy);
  };

  const onPointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    const g = grab.current;
    const panel = panelRef.current;
    if (!g || !panel || e.pointerId !== g.id) return;
    const rx = g.dx0 + e.clientX - g.sx;
    const ry = g.dy0 + e.clientY - g.sy;
    // down is the dismiss direction: 1:1, carried sideways with the hand;
    // anything else rubber-bands
    dy.set(ry >= 0 ? ry : -rubberband(-ry, panel.offsetHeight));
    dx.set(ry >= 0 ? rx : Math.sign(rx) * rubberband(Math.abs(rx), panel.offsetWidth));
    ds.set(0.985 - 0.22 * clamp01(Math.max(0, ry) / (window.innerHeight * 0.55)));
    g.samples.push({ t: e.timeStamp, x: e.clientX, y: e.clientY });
    if (g.samples.length > 12) g.samples.shift();
  };

  const onPointerUp = (e: React.PointerEvent<HTMLDivElement>) => {
    const g = grab.current;
    const panel = panelRef.current;
    if (!g || !panel || e.pointerId !== g.id) return;
    grab.current = null;
    delete e.currentTarget.dataset.grabbed;
    const v = velocity(g.samples, e.timeStamp);
    const projected = dy.get() + project(v.y);
    if (projected > Math.max(150, panel.offsetHeight * 0.3) && v.y > -150) {
      close(undefined, v);
      return;
    }
    const sp = Math.hypot(v.x, v.y) > 420 ? spring.flick : spring.default;
    animate(dx, 0, { ...sp, velocity: v.x });
    animate(dy, 0, { ...sp, velocity: v.y });
    animate(ds, 1, sp);
  };

  const onKeyDown = (e: React.KeyboardEvent) => {
    const onControl = !!(e.target as HTMLElement).closest("a,button,input,textarea");
    if (e.key === " " && !onControl) {
      e.preventDefault();
      close();
    } else if (e.key === "ArrowRight" || e.key === "ArrowDown") {
      e.preventDefault();
      onStep(1);
    } else if (e.key === "ArrowLeft" || e.key === "ArrowUp") {
      e.preventDefault();
      onStep(-1);
    }
  };

  return createPortal(
    <dialog
      ref={dialogRef}
      className="app-work-ql"
      aria-labelledby={titleId}
      onCancel={(e) => {
        e.preventDefault();
        close();
      }}
      onClose={() => {
        // the browser may force-close a modal (e.g. a repeated Esc): stay in sync
        if (closing.current) return;
        closing.current = true;
        onClosed();
      }}
      onKeyDown={onKeyDown}
    >
      <m.div className="app-work-ql-scrim" style={{ opacity: scrim }} onClick={() => close()} aria-hidden />
      <m.div
        ref={panelRef}
        className="app-work-ql-panel glass-thick"
        tabIndex={-1}
        style={{ x, y, scale, opacity: shell }}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
      >
        <m.div className="app-work-ql-content" style={{ opacity: content }}>
          <button type="button" className="app-work-ql-x" aria-label={q.close} onClick={() => close()}>
            <PixelGlyph cells={G_CLOSE} size={8} />
          </button>
          <QuickLookBody
            key={repo.name}
            repo={repo}
            variant="panel"
            titleId={titleId}
            hydrated={hydrated}
            onTag={(tag) => close(() => onTag(tag))}
          />
        </m.div>
      </m.div>
    </dialog>,
    document.body
  );
}

/** Quick Look as a phone Sheet (fling it down; the Sheet owns the physics). */
export function QuickLookSheetBody({
  repo,
  hydrated,
  onTag,
}: {
  repo: RepoInfo;
  hydrated: boolean;
  onTag: (tag: string, dismiss: () => void) => void;
}) {
  const dismiss = useSheetDismiss();
  const titleId = useId();
  return (
    <QuickLookBody
      repo={repo}
      variant="sheet"
      titleId={titleId}
      hydrated={hydrated}
      onTag={(tag) => onTag(tag, dismiss)}
    />
  );
}

function cloneUrl(repo: RepoInfo) {
  const own = repo.url.replace(/\/+$/, "");
  return own.toLowerCase().endsWith(`/${repo.name.toLowerCase()}`) ? `${own}.git` : `${SOCIALS.github}/${repo.name}.git`;
}

function QuickLookBody({
  repo,
  variant,
  titleId,
  hydrated,
  onTag,
}: {
  repo: RepoInfo;
  variant: "panel" | "sheet";
  titleId: string;
  hydrated: boolean;
  onTag: (tag: string) => void;
}) {
  const { t, lang } = useI18n();
  const q = t.work.ql;
  const { blip } = useSound();
  const [copied, setCopied] = useState<"ok" | "fail" | null>(null);
  const timer = useRef(0);
  useEffect(() => () => window.clearTimeout(timer.current), []);

  const copy = async () => {
    const cmd = `git clone ${cloneUrl(repo)}`;
    try {
      await navigator.clipboard.writeText(cmd);
      setCopied("ok");
      blip("success");
    } catch {
      setCopied("fail");
    }
    window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => setCopied(null), 1800);
  };

  const pushed = repo.pushedAt ? new Date(repo.pushedAt) : null;
  const date =
    hydrated && pushed && !Number.isNaN(+pushed)
      ? pushed.toLocaleDateString(lang === "fr" ? "fr-FR" : "en-GB", { day: "numeric", month: "short", year: "numeric" })
      : "";

  return (
    <m.div
      className={`app-work-qlb app-work-qlb--${variant}`}
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 0.18 }}
    >
      <div className="app-work-qlb-media">
        {repo.preview ? (
          // README screenshots live on arbitrary hosts: a plain lazy <img>
          // eslint-disable-next-line @next/next/no-img-element
          <img src={repo.preview} alt={fmt(q.preview, { name: repo.name })} loading="lazy" className="app-work-qlb-shot" />
        ) : (
          <>
            <DitherStage tone="lilac" />
            <PixelPlanet seed={repo.name} className="app-work-qlb-planet" />
          </>
        )}
      </div>

      <div className="app-work-qlb-body" data-ql-scroll data-lenis-prevent>
        <h2 id={titleId} className="app-work-qlb-title">
          {repo.name}
        </h2>
        <p className="app-work-qlb-desc">{repo.description}</p>

        <dl className="app-work-qlb-stats">
          <div>
            <dt>{q.stars}</dt>
            <dd>
              <PixelGlyph cells={GLYPH_STAR} size={10} />
              <span className="tabular">{compact(repo.stars, lang)}</span>
            </dd>
          </div>
          <div>
            <dt>{q.forks}</dt>
            <dd>
              <PixelGlyph cells={G_FORK} size={10} />
              <span className="tabular">{compact(repo.forks, lang)}</span>
            </dd>
          </div>
          <div>
            <dt>{q.language}</dt>
            <dd>
              {repo.language && <span className="app-work-dot" style={{ background: langColor(repo.language) }} aria-hidden />}
              {repo.language || t.work.item.noLanguage}
            </dd>
          </div>
          <div>
            <dt>{q.pushed}</dt>
            <dd className="app-work-qlb-when">
              <span>{hydrated && repo.pushedAt ? timeAgo(repo.pushedAt, lang) : " "}</span>
              {date && <small className="tabular">{date}</small>}
            </dd>
          </div>
        </dl>

        {repo.topics.length > 0 && (
          <div className="app-work-qlb-topics" role="group" aria-label={q.topics}>
            {repo.topics.map((tp) => (
              <button
                key={tp}
                type="button"
                className="app-work-topic"
                aria-label={fmt(q.tagLabel, { tag: tp })}
                onClick={() => onTag(tp)}
              >
                #{tp}
              </button>
            ))}
          </div>
        )}

        <div className="app-work-qlb-actions">
          <a href={repo.url} target="_blank" rel="noopener noreferrer" className="app-work-btn app-work-btn--primary">
            {q.github}
            <PixelGlyph cells={G_ARROW} size={9} />
          </a>
          {repo.homepage && (
            <a href={repo.homepage} target="_blank" rel="noopener noreferrer" className="app-work-btn">
              {q.site}
              <PixelGlyph cells={G_ARROW} size={9} />
            </a>
          )}
          <button type="button" className="app-work-btn app-work-btn--ghost" onClick={copy} data-copied={copied || undefined}>
            <PixelGlyph cells={copied === "ok" ? G_CHECK : G_COPY} size={10} />
            <span aria-live="polite">{copied === "ok" ? q.copied : copied === "fail" ? q.copyFailed : q.clone}</span>
          </button>
        </div>
      </div>

      {variant === "panel" && (
        <p className="app-work-qlb-foot" aria-hidden>
          <span>
            <kbd className="app-work-kbd">␣</kbd> {q.hintClose}
          </span>
          <span>
            <kbd className="app-work-kbd">←</kbd>
            <kbd className="app-work-kbd">→</kbd> {q.hintBrowse}
          </span>
          <span className="app-work-qlb-drag">{q.drag}</span>
        </p>
      )}
    </m.div>
  );
}
