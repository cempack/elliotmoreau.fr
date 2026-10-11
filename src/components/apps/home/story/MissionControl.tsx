"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { m, useScroll, useTransform, type MotionStyle, type MotionValue } from "motion/react";
import { useI18n } from "@/i18n/client";
import { useSound } from "@/lib/sound";
import { spring } from "@/lib/motion";
import { clamp01, useMedia, useReduced } from "@/hooks/env";
import { Glass } from "@/components/os/Glass";
import { AppIcon } from "@/components/os/icons";
import { APPS, type AppId } from "@/components/os/apps";
import { bounce, isPlainClick, visibleIcon } from "@/components/os/dock/launch";
import { SplitText } from "@/components/ui/SplitText";
import { ChapterHead } from "./ChapterHead";
import { AtlasPreview, MailPreview, NowPreview, ProjectsPreview, WritingPreview, type Music } from "./previews";
import { fill } from "./util";

type WinId = Exclude<AppId, "home">;
type Offset = { x: number; y: number };

/** Grid order (reading order) and the order they fly out of the pile. */
const WINDOWS: { id: WinId; flight: number }[] = [
  { id: "work", flight: 0 },
  { id: "writing", flight: 1 },
  { id: "now", flight: 2 },
  { id: "contact", flight: 3 },
  { id: "atlas", flight: 4 },
];

/** Where the pile sits in depth, and when the flight runs (scroll progress). */
const PILE_SCALE = 0.3;
const FLY_FROM = 0.33;
const FLY_STAGGER = 0.05;
const FLY_SPAN = 0.32;

const easeOut = (t: number) => 1 - Math.pow(1 - t, 3);
const easeInOut = (t: number) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);

/**
 * Chapter 1, Mission Control. A pinned scene: as the desktop recedes
 * under the veil, five live app windows wait in a small pile far off in
 * depth, then fly out one after another into a Mission Control grid while
 * the header assembles word by word. Hover lifts a window with an accent
 * ring; a click opens the app (app-open grows it from its Dock icon,
 * which nods). Phones, short screens and reduced motion get the grid in
 * normal flow, each window rising into place as it scrolls in.
 */
export function MissionControl({ music }: { music: Music }) {
  const { t } = useI18n();
  const s = t.story.mc;
  const reduced = useReduced();
  const roomy = useMedia("(min-width: 1024px) and (min-height: 740px)");
  const pinned = roomy && !reduced;

  const wrapRef = useRef<HTMLElement>(null);
  const gridRef = useRef<HTMLDivElement>(null);
  const [offsets, setOffsets] = useState<Offset[]>([]);

  const { scrollYProgress: p } = useScroll({ target: wrapRef, offset: ["start end", "end end"] });
  // function transforms throughout: range transforms of a scroll progress
  // get hardware-accelerated onto a native ScrollTimeline whose range
  // ignores these offsets
  const headOpacity = useTransform(p, (v) => clamp01((v - 0.08) / 0.2));

  // each window's way back to the pile: grid centre minus its own centre,
  // from offset* (layout boxes, untouched by the transforms they drive)
  useEffect(() => {
    if (!pinned) return;
    const grid = gridRef.current;
    if (!grid) return;
    const measure = () => {
      const gw = grid.clientWidth / 2;
      const gh = grid.clientHeight / 2;
      const next = Array.from(grid.children as HTMLCollectionOf<HTMLElement>).map((el) => ({
        x: gw - (el.offsetLeft + el.offsetWidth / 2),
        y: gh - (el.offsetTop + el.offsetHeight / 2),
      }));
      setOffsets(next);
    };
    const ro = new ResizeObserver(measure);
    ro.observe(grid);
    return () => ro.disconnect();
  }, [pinned]);

  return (
    <section
      ref={wrapRef}
      className="app-story-mc"
      data-mode={pinned ? "pin" : "flow"}
      data-veil="0.5"
      aria-labelledby="story-mc-title"
    >
      <div className="app-story-mc-stage">
        <m.div style={pinned ? { opacity: headOpacity } : undefined} className="app-story-mc-head">
          <ChapterHead
            n={1}
            kicker={s.kicker}
            titleId="story-mc-title"
            title={pinned ? <KineticTitle text={s.title} p={p} from={0.1} to={0.4} /> : <SplitText text={s.title} by="word" stagger={0.05} />}
            lede={s.lede}
          />
        </m.div>
        <div ref={gridRef} className="app-story-mc-grid">
          {WINDOWS.map((w) =>
            pinned ? (
              <FlyingWindow key={w.id} id={w.id} flight={w.flight} p={p} offset={offsets[WINDOWS.indexOf(w)]} music={music} />
            ) : (
              <m.div
                key={w.id}
                className="app-story-mc-cell"
                data-app={w.id}
                initial={{ y: 56, scale: 0.94 }}
                whileInView={{ y: 0, scale: 1 }}
                viewport={{ once: true, amount: 0.25 }}
                transition={spring.gentle}
              >
                <McWindow id={w.id} music={music} />
              </m.div>
            )
          )}
        </div>
      </div>
    </section>
  );
}

function FlyingWindow({
  id,
  flight,
  p,
  offset,
  music,
}: {
  id: WinId;
  flight: number;
  p: MotionValue<number>;
  offset: Offset | undefined;
  music: Music;
}) {
  const a = FLY_FROM + flight * FLY_STAGGER;
  const ox = offset?.x ?? 0;
  const oy = offset?.y ?? 0;
  // a loose cascade in the pile, like windows left on a desk
  const cx = (flight - 2) * 34;
  const cy = (flight - 2) * 20;
  const k = useTransform(p, (v) => easeInOut(clamp01((v - a) / FLY_SPAN)));
  const x = useTransform(k, (v) => (1 - v) * (ox + cx));
  // a shallow arc on the way out reads as a throw, not a slide
  const y = useTransform(k, (v) => (1 - v) * (oy + cy) - Math.sin(Math.PI * v) * 26);
  const scale = useTransform(k, (v) => PILE_SCALE + (1 - PILE_SCALE) * easeOut(v));
  return (
    <m.div className="app-story-mc-cell" data-app={id} style={{ x, y, scale, zIndex: 10 + flight }}>
      <McWindow id={id} music={music} />
    </m.div>
  );
}

function McWindow({ id, music }: { id: WinId; music: Music }) {
  const { t, path } = useI18n();
  const { blip } = useSound();
  const def = APPS.find((a) => a.id === id) ?? APPS[1];
  const name = t.shell.apps[id];
  return (
    <Link
      href={path(def.path)}
      transitionTypes={["app-open"]}
      className="app-story-mc-win"
      style={{ "--app-story-accent": def.accent } as React.CSSProperties}
      aria-label={fill(t.story.mc.openApp, { app: name })}
      data-cursor={t.story.open}
      onClick={(e) => {
        if (!isPlainClick(e)) return;
        blip("open");
        bounce(visibleIcon(id)?.querySelector("[data-dock-bounce]"));
      }}
    >
      <Glass thickness="regular" refract={false} interactive aria-hidden className="app-story-mc-glass" />
      <span className="app-story-mc-bar" aria-hidden>
        <span className="app-story-mc-lights">
          <i />
          <i />
          <i />
        </span>
        <AppIcon app={id} size={20} />
        <span className="app-story-mc-name">{name}</span>
        <span className="app-story-mc-path">~{def.path}</span>
        <span className="app-story-mc-open">
          {t.story.open}
          <svg width="10" height="10" viewBox="0 0 7 7" shapeRendering="crispEdges" fill="currentColor" aria-hidden>
            <rect x="2" y="1" width="4" height="1" />
            <rect x="5" y="1" width="1" height="4" />
            <rect x="4" y="2" width="1" height="1" />
            <rect x="3" y="3" width="1" height="1" />
            <rect x="2" y="4" width="1" height="1" />
            <rect x="1" y="5" width="1" height="1" />
          </svg>
        </span>
      </span>
      <span className="app-story-mc-body" aria-hidden>
        {id === "work" && <ProjectsPreview />}
        {id === "writing" && <WritingPreview />}
        {id === "now" && <NowPreview music={music} />}
        {id === "atlas" && <AtlasPreview />}
        {id === "contact" && <MailPreview />}
      </span>
      <span className="app-story-mc-ring" aria-hidden />
    </Link>
  );
}

/**
 * A display line that assembles with scroll: each word rises out of its
 * mask while Inter's weight axis swells from hairline to semibold, in a
 * ripple. Every word reserves its boldest width, so the line never reflows.
 */
export function KineticTitle({ text, p, from, to }: { text: string; p: MotionValue<number>; from: number; to: number }) {
  const list = text.split(" ");
  return (
    <>
      <span className="sr-only">{text}</span>
      <span aria-hidden className="app-story-kt">
        {list.map((w, i) => (
          <KineticWord key={`${i}-${w}`} p={p} i={i} n={list.length} from={from} to={to}>
            {w}
          </KineticWord>
        ))}
      </span>
    </>
  );
}

function KineticWord({
  p,
  i,
  n,
  from,
  to,
  children,
}: {
  p: MotionValue<number>;
  i: number;
  n: number;
  from: number;
  to: number;
  children: string;
}) {
  const span = to - from;
  const a = from + (i / Math.max(1, n)) * span * 0.55;
  const b = a + span * 0.45;
  const k = useTransform(p, (v) => easeOut(clamp01((v - a) / (b - a))));
  const y = useTransform(k, (v) => `${(1 - v) * 108}%`);
  const w = useTransform(k, (v) => Math.round(250 + 400 * v));
  return (
    <>
      {i > 0 && " "}
      <span className="app-story-kt-mask">
        <span className="app-story-kt-ghost">{children}</span>
        <m.span className="app-story-kt-word" style={{ y, "--app-story-w": w } as MotionStyle}>
          {children}
        </m.span>
      </span>
    </>
  );
}
