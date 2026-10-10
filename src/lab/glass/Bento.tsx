"use client";

import { useState } from "react";
import { m, useSpring } from "motion/react";
import { PixelGlyph } from "@/components/glyphs";
import { SplitText } from "@/components/ui/SplitText";
import { press, spring } from "@/lib/motion";
import type { HomeData } from "@/lib/data";
import { GlassPane, useLiquidGlass, sheenLeave, sheenMove } from "./LiquidGlass";
import { Blob } from "./Backdrop";
import { Expand, panelTarget, rectOf, type Rect } from "./Expand";
import {
  AtlasDetail,
  AtlasFace,
  ListeningDetail,
  ListeningFace,
  NewsletterCard,
  TimeDetail,
  TimeFace,
  WorkDetail,
  WorkFace,
  WritingDetail,
  WritingFace,
  useWidgetMeta,
  type WidgetId,
} from "./Widgets";
import { useGlassCopy } from "./strings";
import { useSpotify } from "./live";
import { useReduced } from "./env";

const TILT = { stiffness: 260, damping: 26, mass: 0.6 };

type Open = { id: WidgetId; el: HTMLElement; from: Rect; target: Rect; snapshot: string | null };

/**
 * The story in panels: what he writes, what he hears, where he is, what he
 * builds, where he's been, how to keep up. Each panel is a slab of glass
 * that leans toward your pointer, gives on press, and lifts out into a
 * full panel on tap.
 */
export function Bento({ data }: { data: HomeData }) {
  const c = useGlassCopy();
  const meta = useWidgetMeta();
  const { track } = useSpotify();
  const [open, setOpen] = useState<Open | null>(null);

  const openWidget = (id: WidgetId, el: HTMLElement | null) => {
    if (!el || open) return;
    let snapshot: string | null = null;
    if (id === "atlas") {
      try {
        snapshot = el.querySelector("canvas")?.toDataURL() ?? null;
      } catch {
        snapshot = null;
      }
    }
    setOpen({ id, el, from: rectOf(el), target: panelTarget(id === "time" ? 600 : undefined), snapshot });
  };

  const face = (id: WidgetId, ghost = false) => {
    switch (id) {
      case "writing":
        return <WritingFace data={data} />;
      case "listening":
        return <ListeningFace />;
      case "time":
        return <TimeFace />;
      case "work":
        return <WorkFace data={data} />;
      case "atlas":
        return <AtlasFace globe={!ghost && open?.id !== "atlas"} snapshot={open?.snapshot} />;
    }
  };
  const detail = (id: WidgetId) => {
    switch (id) {
      case "writing":
        return <WritingDetail data={data} />;
      case "listening":
        return <ListeningDetail />;
      case "time":
        return <TimeDetail />;
      case "work":
        return <WorkDetail data={data} />;
      case "atlas":
        return <AtlasDetail />;
    }
  };

  const summary: Record<WidgetId, string> = {
    writing: data.posts[0]?.title ?? c.writingSub,
    listening: track ? `${track.title} · ${track.artist}` : c.t("nothingPlaying"),
    time: c.inFrance,
    work: c.workSub,
    atlas: c.atlasSub,
  };

  const order: { id: WidgetId; refract?: boolean }[] = [
    { id: "writing", refract: true },
    { id: "listening" },
    { id: "time" },
    { id: "work" },
    { id: "atlas" },
  ];

  return (
    <section id="g-now" className="g-bento-sec" aria-labelledby="g-bento-title">
      <Blob tone="teal" className="g-blob--bento-a" speed={120} />
      <Blob tone="moon" className="g-blob--bento-b" speed={80} />
      <Blob tone="ember" className="g-blob--bento-c" speed={140} />
      <Blob tone="rose" className="g-blob--bento-d" speed={70} />

      <header className="g-sec-head">
        <span className="g-eyebrow">
          <PixelGlyph cells={[[1, 1], [2, 1], [1, 2], [2, 2]]} size={10} />
          {c.t("eyebrow")}
        </span>
        <h2 id="g-bento-title" className="g-sec-title">
          <SplitText key={`a-${c.lang}`} text={c.t("bentoTitleA")} by="word" stagger={0.05} className="g-sec-title-a" />
          <SplitText
            key={`b-${c.lang}`}
            text={c.t("bentoTitleB")}
            by="word"
            stagger={0.05}
            delay={0.15}
            className="g-sec-title-b"
          />
        </h2>
        <p className="g-sec-sub">{c.t("bentoSub")}</p>
      </header>

      <div className="g-bento">
        {order.map(({ id, refract }) => (
          <Widget
            key={id}
            id={id}
            refract={refract}
            label={meta[id].label}
            summary={summary[id]}
            hidden={open?.id === id}
            onOpen={openWidget}
            openLabel={c.t("expand")}
          >
            {face(id)}
          </Widget>
        ))}
        <StaticCard area="news">
          <NewsletterCard />
        </StaticCard>
      </div>

      {open && (
        <Expand
          key={open.id}
          origin={open.el}
          from={open.from}
          target={open.target}
          label={meta[open.id].label}
          closeLabel={c.t("close")}
          head={
            <>
              <span className="g-head-glyph">
                <PixelGlyph cells={meta[open.id].glyph} size={14} />
              </span>
              <span className="g-head-label">{meta[open.id].label}</span>
            </>
          }
          face={<div className="g-card-inner">{face(open.id, true)}</div>}
          onClosed={() => {
            const el = open.el;
            setOpen(null);
            requestAnimationFrame(() => el.focus({ preventScroll: true }));
          }}
        >
          {detail(open.id)}
        </Expand>
      )}
    </section>
  );
}

function Widget({
  id,
  refract = false,
  label,
  summary,
  hidden,
  onOpen,
  openLabel,
  children,
}: {
  id: WidgetId;
  refract?: boolean;
  label: string;
  summary: string;
  hidden: boolean;
  onOpen: (id: WidgetId, el: HTMLElement | null) => void;
  openLabel: string;
  children: React.ReactNode;
}) {
  const reduced = useReduced();
  const rx = useSpring(0, TILT);
  const ry = useSpring(0, TILT);
  const { ref, layer } = useLiquidGlass<HTMLDivElement>({
    enabled: refract,
    radius: 32,
    bevel: 34,
    strength: 50,
    chroma: 0.05,
  });

  const onMove = (e: React.PointerEvent<HTMLDivElement>) => {
    sheenMove(e);
    if (e.pointerType !== "mouse" || reduced) return;
    const r = e.currentTarget.getBoundingClientRect();
    const px = (e.clientX - r.left) / r.width - 0.5;
    const py = (e.clientY - r.top) / r.height - 0.5;
    // the side under the pointer gives a little, like pressing a pane
    const k = 5.5 * Math.min(1, 380 / Math.max(r.width, r.height));
    ry.set(px * k);
    rx.set(-py * k);
  };
  const onLeave = (e: React.PointerEvent<HTMLDivElement>) => {
    sheenLeave(e);
    rx.set(0);
    ry.set(0);
  };

  return (
    <m.div
      ref={ref}
      id={`g-${id}`}
      role="button"
      tabIndex={0}
      aria-haspopup="dialog"
      aria-label={`${label}: ${summary}. ${openLabel}`}
      className={`lg lg--regular g-card g-card--${id}`}
      data-cursor={openLabel}
      style={{
        gridArea: id,
        rotateX: rx,
        rotateY: ry,
        transformPerspective: 1200,
        visibility: hidden ? "hidden" : undefined,
      }}
      whileTap={press}
      transition={spring.snappy}
      onPointerMove={onMove}
      onPointerLeave={onLeave}
      onClick={() => onOpen(id, ref.current)}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          onOpen(id, ref.current);
        }
      }}
    >
      {layer}
      <div className="g-card-inner">{children}</div>
    </m.div>
  );
}

function StaticCard({ area, children }: { area: string; children: React.ReactNode }) {
  return (
    <div
      className={`lg lg--regular g-card g-card--${area} g-card--static`}
      style={{ gridArea: area }}
      onPointerMove={sheenMove}
      onPointerLeave={sheenLeave}
    >
      <GlassPane />
      <div className="g-card-inner">{children}</div>
    </div>
  );
}
