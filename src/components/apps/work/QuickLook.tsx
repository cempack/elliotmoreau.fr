"use client";

import { useEffect, useId, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { animate, frame, m, useMotionValue, useTransform } from "motion/react";
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
import { Marked } from "./Parts";
import { compact, fmt, langColor } from "./model";

type Sample = { t: number; x: number; y: number };
type Velocity = { x: number; y: number };

/** the zoom out of (and back into) an icon: critically damped, a touch slower than default */
const ZOOM = { type: "spring", visualDuration: 0.42, bounce: 0 } as const;
const FADE = { duration: 0.15, ease: "linear" } as const;
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

/** offset of `el` inside `ancestor`, in layout px (transforms ignored) */
function offsetIn(el: HTMLElement, ancestor: HTMLElement) {
  let x = 0;
  let y = 0;
  for (let n: HTMLElement | null = el; n && n !== ancestor; n = n.offsetParent as HTMLElement | null) {
    x += n.offsetLeft;
    y += n.offsetTop;
  }
  return { x, y };
}

const NO_DRAG = "a,button,input,textarea,select,summary,[data-no-drag]";

/**
 * Quick Look, the signature gesture of Projects. The item's planet lifts
 * out of its icon and flies to the middle of the screen while a thick
 * glass panel grows behind it; Space, Esc, ✕ or a click outside send both
 * home along the same path. Grab the panel anywhere and it follows the
 * hand 1:1, shrinking as it is pulled down; let go and the release velocity
 * is projected: thrown far enough it flies home into its icon carrying that
 * velocity, otherwise it springs back (bouncing only after a real fling).
 * Catch it on the way home and it is yours again. Arrow keys browse to the
 * neighbouring projects without closing, like Finder.
 *
 * Desktop only (≥768px); phones get the same body in a Sheet. A native
 * modal <dialog> in the top layer: focus moves in, the page goes inert,
 * focus returns to the item on close. While it folds home the dialog lets
 * go of the page (non-modal), so the next double-click lands at once.
 */
export function QuickLook({
  repo,
  terms,
  hydrated,
  getOrigin,
  onStep,
  onTag,
  onClosed,
}: {
  repo: RepoInfo;
  terms: string[];
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
  const alive = useRef(false);
  /** a dismiss is under way… */
  const closing = useRef(false);
  /** …and it is the fold into the icon, which a hand can catch */
  const folding = useRef(false);
  /** bumped whenever a pending close must not finish (caught, unmounted) */
  const closeTok = useRef(0);
  /** the origin whose planet is out here (hidden in place) */
  const away = useRef<HTMLElement | null>(null);
  const grab = useRef<{ id: number; sx: number; sy: number; dx0: number; dy0: number; samples: Sample[] } | null>(
    null
  );
  const [firstName] = useState(repo.name);

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
  // the travelling planet. cx/cy: panel centre at rest; px/py/pw: the
  // planet's slot relative to that centre; ix/iy/iw: the origin's planet;
  // fly: 1 while the planet travels to/from the origin (else it rides
  // the glass)
  const cx = useMotionValue(0);
  const cy = useMotionValue(0);
  const px = useMotionValue(0);
  const py = useMotionValue(0);
  const pw = useMotionValue(192);
  const ix = useMotionValue(0);
  const iy = useMotionValue(0);
  const iw = useMotionValue(128);
  const fly = useMotionValue(0);

  const x = useTransform(() => lerp(ox.get(), 0, p.get()) + dx.get());
  const y = useTransform(() => lerp(oy.get(), 0, p.get()) + dy.get());
  const scale = useTransform(() => lerp(os.get(), 1, p.get()) * ds.get());
  const shell = useTransform(() => clamp01(p.get() / fadeIn.get()) * fade.get());
  // read straight from the sources (not through `content`): a derived value
  // only recomputes when one of the values it read last time changes
  const contentOf = () => (fadeIn.get() >= 1 ? p.get() : clamp01((p.get() - 0.5) / 0.38)) * fade.get();
  const content = useTransform(contentOf);
  const scrim = useTransform(() => p.get() * fade.get() * (1 - clamp01(Math.max(0, dy.get()) / 520)));
  const hints = useTransform(
    () => clamp01((p.get() - 0.7) / 0.3) * fade.get() * (1 - clamp01(Math.hypot(dx.get(), dy.get()) / 60))
  );

  /**
   * The planet's box on screen: a straight flight from the origin's planet
   * (I) to its slot in the panel (R), both carried by the hand. At p = 1 it
   * is exactly where the glass holds it, so it stays locked to the panel
   * through any drag; without an origin it simply rides the glass.
   */
  const planet = () => {
    const pv = p.get();
    const d = ds.get();
    const s = lerp(os.get(), 1, pv) * d;
    const e = 1 - fly.get() * (1 - pv);
    // R: where the glass carries the slot right now (= rest slot at p = 1)
    const rx = cx.get() + lerp(ox.get(), 0, pv) + dx.get() + s * px.get();
    const ry = cy.get() + lerp(oy.get(), 0, pv) + dy.get() + s * py.get();
    // in flight, aim for the slot's resting place instead of the moving glass
    const tx = cx.get() + dx.get() + d * px.get();
    const ty = cy.get() + dy.get() + d * py.get();
    const k = fly.get();
    return {
      x: lerp(ix.get() + dx.get(), lerp(rx, tx, k), e),
      y: lerp(iy.get() + dy.get(), lerp(ry, ty, k), e),
      w: k ? lerp(iw.get(), pw.get(), e) * d : s * pw.get(),
    };
  };
  const fx = useTransform(() => planet().x - pw.get() / 2);
  const fy = useTransform(() => planet().y - pw.get() / 2);
  const fs = useTransform(() => planet().w / pw.get());
  const fo = useTransform(() => fly.get() * fade.get() + (1 - fly.get()) * contentOf());

  const setAway = (el: HTMLElement | null) => {
    if (away.current === el) return;
    away.current?.removeAttribute("data-ql-away");
    el?.setAttribute("data-ql-away", "");
    away.current = el;
  };

  /** origin centre and scale relative to the panel's resting box, or null if off screen */
  const measure = () => {
    const el = getOrigin();
    const panel = panelRef.current;
    if (!el || !panel) return null;
    const r = el.getBoundingClientRect();
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    if (r.width < 2 || r.bottom < 24 || r.top > vh - 24 || r.right < 0 || r.left > vw) return null;
    const w = panel.offsetWidth;
    const h = panel.offsetHeight;
    const s = Math.sqrt((r.width * r.height) / (w * h));
    const ocx = r.left + r.width / 2;
    const ocy = r.top + r.height / 2;
    return {
      el,
      x: ocx - (panel.offsetLeft + w / 2),
      y: ocy - (panel.offsetTop + h / 2),
      s: Math.min(1, Math.max(0.05, s)),
      cx: ocx,
      cy: ocy,
      w: Math.min(r.width, r.height),
    };
  };

  /** the panel's resting centre and the planet slot inside it */
  const measureRest = () => {
    const panel = panelRef.current;
    if (!panel) return;
    const w = panel.offsetWidth;
    const h = panel.offsetHeight;
    cx.set(panel.offsetLeft + w / 2);
    cy.set(panel.offsetTop + h / 2);
    const slot = panel.querySelector<HTMLElement>("[data-ql-slot]");
    if (!slot) return;
    const o = offsetIn(slot, panel);
    px.set(o.x + slot.offsetWidth / 2 - w / 2);
    py.set(o.y + slot.offsetHeight / 2 - h / 2);
    pw.set(slot.offsetWidth || 192);
  };

  /** the planet travels between `o` and the panel; `o`'s own planet hides */
  const travel = (o: NonNullable<ReturnType<typeof measure>>, defer = false) => {
    ix.set(o.cx);
    iy.set(o.cy);
    iw.set(o.w);
    fly.set(1);
    // on open, empty the icon only once the flying copy has been drawn over it
    if (!defer) setAway(o.el);
    else
      frame.postRender(() => {
        if (alive.current && !closing.current) setAway(o.el);
      });
  };

  /** modal ↔ non-modal: let the page take clicks while the panel folds home */
  const release = () => {
    const d = dialogRef.current;
    if (!d?.open || !d.matches(":modal")) return;
    d.close();
    d.show();
    d.dataset.folding = "";
  };
  const recapture = () => {
    const d = dialogRef.current;
    if (!d) return;
    delete d.dataset.folding;
    if (!d.open || !d.matches(":modal")) {
      if (d.open) d.close();
      d.showModal();
    }
    panelRef.current?.focus({ preventScroll: true });
  };

  // open: into the top layer, the planet lifts out of its icon
  useLayoutEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    alive.current = true;
    if (!dialog.open) dialog.showModal();
    measureRest();
    const o = reduced ? null : measure();
    if (reduced) {
      os.set(1);
      fadeIn.set(1);
    } else if (o) {
      ox.set(o.x);
      oy.set(o.y);
      os.set(o.s);
      if (!repo.preview) travel(o, true);
    }
    // start the clock once the (invisible, p = 0) panel has painted: the
    // first top-layer paint can be slow, and the zoom shouldn't skip ahead
    let anim: ReturnType<typeof animate> | null = null;
    let raf = requestAnimationFrame(() => {
      raf = requestAnimationFrame(() => {
        if (!closing.current) anim = animate(p, 1, reduced ? FADE : ZOOM);
      });
    });
    panelRef.current?.focus({ preventScroll: true });
    lenisRef.current?.stop();
    const root = document.documentElement;
    const prevOverflow = root.style.overflow;
    root.style.overflow = "hidden";
    blip("open");
    window.addEventListener("resize", measureRest);
    return () => {
      alive.current = false;
      closeTok.current += 1;
      cancelAnimationFrame(raf);
      anim?.stop();
      window.removeEventListener("resize", measureRest);
      setAway(null);
      // a remount (StrictMode) sets these again: make that a change, so
      // everything derived from them is recomputed before the first frame
      fly.set(0);
      lenisRef.current?.start();
      root.style.overflow = prevOverflow;
      if (dialog.open) dialog.close();
    };
    // mount-only: the zoom runs once; later origins are measured at close
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // browsing: the next project's planet leaves its icon, the last one's returns
  const shownName = useRef(repo.name);
  useEffect(() => {
    if (shownName.current === repo.name) return;
    shownName.current = repo.name;
    if (closing.current) return;
    measureRest();
    const el = reduced || repo.preview ? null : getOrigin();
    setAway(el);
    if (!el) fly.set(0);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [repo.name]);

  const close = (after?: () => void, v: Velocity = { x: 0, y: 0 }) => {
    if (closing.current) return;
    closing.current = true;
    grab.current = null;
    blip("close");
    const tok = ++closeTok.current;
    const done = () => {
      if (!alive.current || tok !== closeTok.current) return;
      setAway(null);
      dialogRef.current?.close();
      onClosed(after);
    };
    if (reduced) {
      animate(p, 0, FADE).then(done);
      return;
    }
    // caught and thrown again: keep the origin it was already folding into
    const o = p.get() >= 0.999 ? measure() : null;
    if (o) {
      ox.set(o.x);
      oy.set(o.y);
      os.set(o.s);
      if (!repo.preview) travel(o);
    }
    if (o || p.get() < 0.999) {
      // home into the icon, carrying the hand's velocity
      folding.current = true;
      release();
      animate(dx, 0, { ...ZOOM, velocity: v.x });
      animate(dy, 0, { ...ZOOM, velocity: v.y });
      animate(ds, 1, ZOOM);
      animate(p, 0, ZOOM).then(done);
    } else {
      // nowhere to go home to (scrolled away / filtered out): fall off screen
      fly.set(0);
      setAway(null);
      animate(dy, dy.get() + window.innerHeight * 0.6, { ...spring.default, velocity: Math.max(v.y, 600) });
      animate(fade, 0, { duration: 0.24, ease: [0.4, 0, 1, 1] }).then(done);
    }
  };

  const onPointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    if (e.button !== 0) return;
    if (closing.current) {
      // caught on the way home: stop where it is and hand it back
      if (!folding.current || reduced) return;
      closeTok.current += 1;
      p.stop();
      dx.stop();
      dy.stop();
      ds.stop();
      closing.current = false;
      folding.current = false;
      recapture();
    } else {
      const target = e.target as HTMLElement;
      if (target.closest(NO_DRAG)) return;
      const scroller = target.closest<HTMLElement>("[data-ql-scroll]");
      if (e.pointerType !== "mouse" && scroller && scroller.scrollHeight > scroller.clientHeight + 2) return;
      dx.stop();
      dy.stop();
    }
    e.currentTarget.setPointerCapture(e.pointerId);
    grab.current = {
      id: e.pointerId,
      sx: e.clientX,
      sy: e.clientY,
      dx0: dx.get(),
      dy0: dy.get(),
      samples: [{ t: e.timeStamp, x: e.clientX, y: e.clientY }],
    };
    e.currentTarget.dataset.grabbed = "";
    // respond on pointer-down: the panel settles a hair under the hand
    if (!reduced) animate(ds, ds.get() * 0.985, spring.snappy);
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
    if (!reduced) ds.set(0.985 - 0.22 * clamp01(Math.max(0, ry) / (window.innerHeight * 0.55)));
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
    if (reduced) {
      // drags snap; nothing glides
      dx.set(0);
      dy.set(0);
      ds.set(1);
      p.set(1);
      return;
    }
    const sp = Math.hypot(v.x, v.y) > 420 ? spring.flick : spring.default;
    if (p.get() < 1) animate(p, 1, ZOOM);
    animate(dx, 0, { ...sp, velocity: v.x });
    animate(dy, 0, { ...sp, velocity: v.y });
    animate(ds, 1, sp);
  };

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (closing.current) return;
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
        // the browser may force-close a modal (e.g. a repeated Esc): stay in
        // sync. The event is async, so a close() followed by a re-open
        // (StrictMode's effect replay, the modal ↔ non-modal hand-off)
        // lands here while open again: ignore.
        if (closing.current || dialogRef.current?.open) return;
        closing.current = true;
        setAway(null);
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
            terms={terms}
            variant="panel"
            titleId={titleId}
            hydrated={hydrated}
            onTag={(tag) => close(() => onTag(tag))}
          />
        </m.div>
      </m.div>

      {!repo.preview && (
        <m.div
          className="app-work-ql-fly"
          style={{ x: fx, y: fy, scale: fs, opacity: fo, width: pw, height: pw }}
          aria-hidden
        >
          <m.div
            key={repo.name}
            className="app-work-ql-fly-in"
            initial={repo.name === firstName ? false : reduced ? { opacity: 0 } : { opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={spring.snappy}
          >
            <PixelPlanet seed={repo.name} className="app-work-planet" />
          </m.div>
        </m.div>
      )}

      <m.p className="app-work-ql-hints" style={{ opacity: hints }} aria-hidden>
        <span>
          <kbd className="app-work-kbd">␣</kbd> {q.hintClose}
        </span>
        <span>
          <kbd className="app-work-kbd">←</kbd>
          <kbd className="app-work-kbd">→</kbd> {q.hintBrowse}
        </span>
        <span>
          <kbd className="app-work-kbd">↓</kbd> {q.drag}
        </span>
      </m.p>
    </dialog>,
    document.body
  );
}

/** Quick Look as a phone Sheet (fling it down; the Sheet owns the physics). */
export function QuickLookSheetBody({
  repo,
  terms,
  hydrated,
  onTag,
}: {
  repo: RepoInfo;
  terms: string[];
  hydrated: boolean;
  onTag: (tag: string, dismiss: () => void) => void;
}) {
  const { t } = useI18n();
  const dismiss = useSheetDismiss();
  const titleId = useId();
  return (
    <div className="app-work-qls">
      <button type="button" className="app-work-ql-x app-work-ql-x--sheet" aria-label={t.work.ql.close} onClick={() => dismiss()}>
        <PixelGlyph cells={G_CLOSE} size={9} />
      </button>
      <QuickLookBody
        repo={repo}
        terms={terms}
        variant="sheet"
        titleId={titleId}
        hydrated={hydrated}
        onTag={(tag) => onTag(tag, dismiss)}
      />
    </div>
  );
}

function cloneUrl(repo: RepoInfo) {
  const own = repo.url.replace(/\/+$/, "");
  return own.toLowerCase().endsWith(`/${repo.name.toLowerCase()}`) ? `${own}.git` : `${SOCIALS.github}/${repo.name}.git`;
}

function QuickLookBody({
  repo,
  terms,
  variant,
  titleId,
  hydrated,
  onTag,
}: {
  repo: RepoInfo;
  terms: string[];
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
  const scrollRef = useRef<HTMLDivElement>(null);
  useEffect(() => () => window.clearTimeout(timer.current), []);

  // soft edges on the scroller only where there is more to see
  const edges = () => {
    const el = scrollRef.current;
    if (!el) return;
    const more = el.scrollHeight - el.clientHeight;
    el.toggleAttribute("data-more-above", el.scrollTop > 2);
    el.toggleAttribute("data-more-below", more > 2 && el.scrollTop < more - 2);
  };
  useLayoutEffect(() => {
    if (variant !== "panel") return;
    const el = scrollRef.current;
    if (!el) return;
    edges();
    const ro = new ResizeObserver(edges);
    ro.observe(el);
    return () => ro.disconnect();
  }, [variant]);

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
  const dataLang = lang === "en" ? undefined : "en";

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
            {variant === "panel" ? (
              // the planet itself flies in over this slot (see QuickLook)
              <span className="app-work-qlb-planet" data-ql-slot aria-hidden />
            ) : (
              <PixelPlanet seed={repo.name} className="app-work-qlb-planet" />
            )}
          </>
        )}
      </div>

      <div className="app-work-qlb-body" data-ql-scroll data-lenis-prevent ref={scrollRef} onScroll={edges}>
        <h2 id={titleId} className="app-work-qlb-title">
          <Marked text={repo.name} terms={terms} />
        </h2>
        <p className="app-work-qlb-desc" lang={dataLang} data-no-drag>
          <Marked text={repo.description} terms={terms} />
        </p>

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
              <span>{hydrated && repo.pushedAt ? timeAgo(repo.pushedAt, lang) : " "}</span>
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
                #<Marked text={tp} terms={terms} />
              </button>
            ))}
          </div>
        )}
      </div>

      <div className="app-work-qlb-bar">
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
    </m.div>
  );
}
