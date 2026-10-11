"use client";

import Link from "next/link";
import { useEffect, useImperativeHandle, useRef, useState } from "react";
import { animate, m, useMotionValue, useMotionValueEvent, type MotionStyle } from "motion/react";
import { useI18n } from "@/i18n/client";
import { useHydrated } from "@/hooks/env";
import { timeAgo } from "@/lib/format";
import { PLACES } from "@/lib/places";
import { spring, springFrom } from "@/lib/motion";
import { useSound } from "@/lib/sound";
import { PixelGlyph, type Cells } from "@/components/glyphs";
import { useSiteData } from "@/components/os/SiteData";
import { G_CLOSE, G_EXTERNAL, G_MIN } from "@/components/os/window/glyphs";
import { Glass } from "@/components/os/Glass";
import { FLING, INTERACTIVE, band, intersects, pushSample, releaseVelocity, type Rect, type Sample } from "./physics";
import { G_COMMIT, G_PEN, G_PLANE } from "./icons";
import { isPhone, menubarPx } from "./layout";

const fill = (s: string, v: Record<string, string | number>) => s.replace(/\{(\w+)\}/g, (_, k: string) => String(v[k] ?? ""));

/** places been (home included) and the first one on the list */
const BEEN = PLACES.filter((p) => p.status === "been").length;
const NEXT = PLACES.find((p) => p.status === "want");

/* 7×7 glyph for the file in the title bar */
const G_DOC: Cells = [
  [1, 0], [2, 0], [3, 0], [4, 0],
  [1, 1], [4, 1], [5, 1],
  [1, 2], [5, 2],
  [1, 3], [2, 3], [3, 3], [5, 3],
  [1, 4], [5, 4],
  [1, 5], [2, 5], [3, 5], [4, 5], [5, 5],
];

export type HelloHandle = {
  /** shrink into a point (the README icon), then hide */
  close: (to: { x: number; y: number }) => Promise<void>;
  /** grow back out of a point to home */
  open: (from: { x: number; y: number }) => void;
  /** a little nod when it is already open and someone asks for it */
  nudge: () => void;
  focus: () => void;
};

/** While it is held or flying home: where home is and where the live name is. */
type Lift = { token: number; home: Rect | null; field: Rect | null };

type Grab = {
  pid: number;
  sx: number;
  sy: number;
  x0: number;
  y0: number;
  moved: boolean;
  samples: Sample[];
  minX: number;
  maxX: number;
  minY: number;
  maxY: number;
};

/**
 * hello.txt: a small TextEdit-like glass window on the desktop with the
 * intro, the two ways in, and live status chips.
 *
 * Physical: grab the title bar and it lifts on pointer-down, then follows
 * 1:1 from the grab offset; past the edges of the desktop it rubber-bands.
 * Let go and it springs home carrying the release velocity (a flick
 * bounces a little, a placement settles). Interruptible: grab it mid-flight.
 * Close or minimize and it shrinks into the README icon; the README opens
 * it again. Phones get it as a Notes widget (no chrome, no drag).
 *
 * Depth: from pointer-down until the spring has brought it home it is
 * lifted (data-lifted), above the widgets and the icons. Over the living
 * wordmark (data-over) its glass deepens and stops refracting, so the text
 * keeps its contrast and no displacement filter re-renders over a canvas
 * that redraws every frame.
 */
export function HelloWindow({
  ref,
  closed,
  onClose,
  reduced,
}: {
  ref?: React.Ref<HelloHandle>;
  closed: boolean;
  onClose: () => void;
  reduced: boolean;
}) {
  const { t, lang, path } = useI18n();
  const h = t.home.hello;
  const { blip } = useSound();
  const rootRef = useRef<HTMLElement>(null);
  const x = useMotionValue(0);
  const y = useMotionValue(0);
  const scale = useMotionValue(1);
  const grab = useRef<Grab | null>(null);
  const flying = useRef(false);
  const lift = useRef<Lift>({ token: 0, home: null, field: null });
  const overRef = useRef(false);
  const [over, setOver] = useState(false);

  const setOverField = (v: boolean) => {
    if (v === overRef.current) return;
    overRef.current = v;
    const el = rootRef.current;
    if (el) {
      if (v) el.dataset.over = "";
      else delete el.dataset.over;
    }
    setOver(v);
  };

  /* while lifted, follow the window against the name's field */
  const track = () => {
    const { home, field } = lift.current;
    if (!home || !field) return;
    const dx = x.get();
    const dy = y.get();
    setOverField(intersects({ left: home.left + dx, top: home.top + dy, right: home.right + dx, bottom: home.bottom + dy }, field));
  };
  useMotionValueEvent(x, "change", track);
  useMotionValueEvent(y, "change", track);

  const land = () => {
    const el = rootRef.current;
    lift.current = { token: lift.current.token, home: null, field: null };
    setOverField(false);
    if (el) delete el.dataset.lifted;
  };

  const stopAll = () => {
    x.stop();
    y.stop();
    scale.stop();
  };

  useImperativeHandle(
    ref,
    () => ({
      close: (to) =>
        new Promise<void>((resolve) => {
          const el = rootRef.current;
          if (!el || reduced) {
            resolve();
            return;
          }
          stopAll();
          flying.current = true;
          const r = el.getBoundingClientRect();
          // the window's centre (minus its live offset) is where scale acts
          const cx = r.left + r.width / 2 - x.get();
          const cy = r.top + r.height / 2 - y.get();
          const t = springFrom(0.42);
          animate(x, to.x - cx, t);
          animate(y, to.y - cy, t);
          animate(scale, 0.06, t).then(() => {
            flying.current = false;
            resolve();
          });
        }),
      open: (from) => {
        const el = rootRef.current;
        if (!el) return;
        stopAll();
        if (reduced) {
          x.jump(0);
          y.jump(0);
          scale.jump(1);
          return;
        }
        // measured at home (offsets are transforms, the box hasn't moved)
        const r = el.getBoundingClientRect();
        const cx = r.left + r.width / 2 - x.get();
        const cy = r.top + r.height / 2 - y.get();
        x.jump(from.x - cx);
        y.jump(from.y - cy);
        scale.jump(0.06);
        // motion paints on its next frame; React may unhide the window
        // before that, so seat it at the icon right now
        el.style.transform = `translateX(${from.x - cx}px) translateY(${from.y - cy}px) scale(0.06)`;
        animate(x, 0, spring.gentle);
        animate(y, 0, spring.gentle);
        animate(scale, 1, spring.gentle);
      },
      nudge: () => {
        if (reduced || grab.current) return;
        scale.stop();
        animate(scale, [1, 1.025, 1], { duration: 0.42, ease: [0.22, 1, 0.36, 1] });
      },
      focus: () => rootRef.current?.focus({ preventScroll: true }),
    }),
    // motion values are stable; reduced is the only input
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [reduced]
  );

  // a closed window rests tucked away at full size, ready to grow out again
  useEffect(() => {
    if (!closed) return;
    const id = window.setTimeout(() => {
      if (flying.current) return;
      x.jump(0);
      y.jump(0);
      scale.jump(1);
    }, 0);
    return () => window.clearTimeout(id);
  }, [closed, x, y, scale]);

  const settle = (vx: number, vy: number) => {
    if (reduced) {
      x.jump(0);
      y.jump(0);
      scale.jump(1);
      land();
      return;
    }
    const tr = Math.hypot(vx, vy) > FLING ? spring.flick : spring.default;
    const token = lift.current.token;
    // it stays lifted until it is home, not when the hand lets go, so it
    // never drops back under the icons mid-flight
    Promise.all([animate(x, 0, { ...tr, velocity: vx }).finished, animate(y, 0, { ...tr, velocity: vy }).finished]).then(() => {
      if (lift.current.token === token && !grab.current) land();
    });
    animate(scale, 1, spring.default);
  };

  const end = (e: React.PointerEvent<HTMLElement>, cancelled: boolean) => {
    const g = grab.current;
    if (!g || g.pid !== e.pointerId) return;
    grab.current = null;
    const el = rootRef.current;
    if (el) {
      delete el.dataset.grabbed;
      delete el.dataset.dragging;
    }
    const v = cancelled || !g.moved ? { vx: 0, vy: 0 } : releaseVelocity(g.samples, e.timeStamp);
    settle(v.vx, v.vy);
  };

  const onPointerDown = (e: React.PointerEvent<HTMLElement>) => {
    if (closed || flying.current || grab.current) return;
    if (e.pointerType === "mouse" && e.button !== 0) return;
    if ((e.target as Element).closest(INTERACTIVE)) return;
    // phones: hello.txt is a widget, it doesn't move
    if (isPhone()) return;
    const el = rootRef.current;
    if (!el) return;
    e.currentTarget.setPointerCapture(e.pointerId);
    if (e.pointerType === "mouse") e.preventDefault();
    stopAll();
    // free travel inside the desktop (below the menu bar, above the dock)
    const r = el.getBoundingClientRect();
    const root = getComputedStyle(document.documentElement);
    const rem = parseFloat(root.fontSize) || 16;
    const top = menubarPx();
    const dockRaw = root.getPropertyValue("--dock-h").trim();
    const dock = dockRaw.endsWith("rem") ? parseFloat(dockRaw) * rem : parseFloat(dockRaw) || 76;
    const homeL = r.left - x.get();
    const homeT = r.top - y.get();
    // the live name's field: the part of its box inside its band
    const hero = document.querySelector(".app-home-hero")?.getBoundingClientRect();
    const wrap = document.querySelector(".app-home-hero-wrap")?.getBoundingClientRect();
    const field =
      hero && wrap && hero.width && wrap.height
        ? { left: Math.max(hero.left, wrap.left), top: Math.max(hero.top, wrap.top) + 8, right: Math.min(hero.right, wrap.right), bottom: Math.min(hero.bottom, wrap.bottom) - 8 }
        : null;
    lift.current = { token: lift.current.token + 1, home: { left: homeL, top: homeT, right: homeL + r.width, bottom: homeT + r.height }, field };
    el.dataset.lifted = "";
    const m8 = 8;
    grab.current = {
      pid: e.pointerId,
      sx: e.clientX,
      sy: e.clientY,
      x0: x.get(),
      y0: y.get(),
      moved: false,
      samples: [{ t: e.timeStamp, x: e.clientX, y: e.clientY }],
      minX: m8 - homeL,
      maxX: window.innerWidth - m8 - (homeL + r.width),
      minY: top + m8 - homeT,
      maxY: Math.max(top + m8 - homeT, window.innerHeight - dock - m8 - (homeT + r.height)),
    };
    el.dataset.grabbed = "";
    if (!reduced) animate(scale, 1.012, spring.snappy);
  };

  const onPointerMove = (e: React.PointerEvent<HTMLElement>) => {
    const g = grab.current;
    if (!g || g.pid !== e.pointerId) return;
    const dx = e.clientX - g.sx;
    const dy = e.clientY - g.sy;
    if (!g.moved) {
      if (Math.hypot(dx, dy) < 3) return;
      g.moved = true;
      if (rootRef.current) rootRef.current.dataset.dragging = "";
    }
    pushSample(g.samples, { t: e.timeStamp, x: e.clientX, y: e.clientY });
    x.set(band(g.x0 + dx, g.minX, g.maxX, window.innerWidth));
    y.set(band(g.y0 + dy, g.minY, g.maxY, window.innerHeight));
  };

  return (
    <m.section
      ref={rootRef}
      tabIndex={-1}
      aria-labelledby="app-home-hello-title"
      aria-hidden={closed || undefined}
      inert={closed}
      data-closed={closed || undefined}
      className="app-home-hello"
      style={{ x, y, scale } as MotionStyle}
    >
      <Glass thickness="regular" refract={!over} className="app-home-hello-glass" aria-hidden />
      <div
        className="app-home-hello-bar"
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={(e) => end(e, false)}
        onPointerCancel={(e) => end(e, true)}
        onLostPointerCapture={(e) => end(e, true)}
      >
        <div className="app-home-hello-lights">
          <button
            type="button"
            aria-label={h.close}
            className="app-home-hello-light app-home-hello-light--close"
            onClick={() => {
              blip("close");
              onClose();
            }}
          >
            <PixelGlyph cells={G_CLOSE} size={7} />
          </button>
          <button
            type="button"
            aria-label={h.minimize}
            className="app-home-hello-light app-home-hello-light--min"
            onClick={() => {
              blip("close");
              onClose();
            }}
          >
            <PixelGlyph cells={G_MIN} size={7} />
          </button>
          <span className="app-home-hello-light app-home-hello-light--zoom" aria-hidden />
        </div>
        <p className="app-home-hello-file">
          <PixelGlyph cells={G_DOC} size={12} className="app-home-hello-file-glyph" />
          {h.file}
        </p>
        <span className="app-home-hello-path" aria-hidden>
          {h.path}
        </span>
      </div>

      <div className="app-home-hello-body">
        <h2 id="app-home-hello-title" className="app-home-hello-greeting">
          {h.greeting}
        </h2>
        <p className="app-home-hello-lead">{h.lead}</p>
        <div className="app-home-hello-ctas">
          <Link
            href={path("/work")}
            transitionTypes={["app-open"]}
            onClick={() => blip("open")}
            className="app-home-btn app-home-btn--primary"
          >
            {h.work}
            <svg width="14" height="14" viewBox="0 0 14 14" aria-hidden className="app-home-btn-arrow">
              <path d="M2.5 7h8M7 3l4 4-4 4" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </Link>
          <Link
            href={path("/contact")}
            transitionTypes={["app-open"]}
            onClick={() => blip("open")}
            className="app-home-btn app-home-btn--ghost"
          >
            {h.contact}
          </Link>
        </div>
        <StatusChips label={h.status} lang={lang} />
      </div>
    </m.section>
  );
}

function StatusChips({ label, lang }: { label: string; lang: "en" | "fr" }) {
  const { t, path } = useI18n();
  const h = t.home.hello;
  const { activity, posts } = useSiteData();
  const hydrated = useHydrated();
  const post = posts[0];

  // the menu bar already carries the clock and the song, and the mini
  // player the song again: hello.txt keeps only what is nowhere else on
  // this screen (the last push, the travels). The latest post rides along
  // on desks too narrow for its widget, the places on desks wide enough.
  // A row left with nothing to show hides itself (CSS).
  return (
    <ul className="app-home-chips" aria-label={label}>
      {activity && (
        <li>
          <a
            href={activity.repoUrl}
            target="_blank"
            rel="noreferrer"
            className="app-home-chip app-home-chip--link"
            aria-label={`${fill(h.openRepo, { repo: activity.repo })}, ${fill(h.pushed, {
              ago: hydrated ? timeAgo(activity.createdAt, lang) : "",
            })}`}
          >
            <PixelGlyph cells={G_COMMIT} size={11} className="app-home-chip-commit" />
            <span className="app-home-chip-v">{activity.repo}</span>
            <span className="app-home-chip-k" suppressHydrationWarning>
              {hydrated ? fill(h.pushed, { ago: timeAgo(activity.createdAt, lang) }) : " "}
            </span>
            <PixelGlyph cells={G_EXTERNAL} size={8} className="app-home-chip-ext" />
          </a>
        </li>
      )}
      {post && (
        <li className="app-home-chip-slot--post">
          <Link
            href={`${path("/writing")}?p=${encodeURIComponent(post.slug)}`}
            transitionTypes={["app-open"]}
            className="app-home-chip app-home-chip--link"
            aria-label={fill(h.openPost, { title: post.title, ago: hydrated ? timeAgo(post.published_at, lang) : "" })}
          >
            <PixelGlyph cells={G_PEN} size={11} className="app-home-chip-note" />
            <span className="app-home-chip-k">{h.post}</span>
            <span className="app-home-chip-v">{post.title}</span>
          </Link>
        </li>
      )}
      {BEEN > 0 && (
        <li className="app-home-chip-slot--places">
          <Link
            href={path("/atlas")}
            transitionTypes={["app-open"]}
            className="app-home-chip app-home-chip--link"
            aria-label={fill(NEXT ? h.openAtlasNext : h.openAtlas, { n: BEEN, next: NEXT?.name[lang] ?? "" })}
          >
            <PixelGlyph cells={G_PLANE} size={11} className="app-home-chip-plane" />
            <span className="app-home-chip-v">{fill(h.places, { n: BEEN })}</span>
            {NEXT && (
              <span className="app-home-chip-k">
                <span className="app-home-chip-arrow" aria-hidden>
                  →
                </span>{" "}
                {NEXT.name[lang]}
              </span>
            )}
          </Link>
        </li>
      )}
    </ul>
  );
}
