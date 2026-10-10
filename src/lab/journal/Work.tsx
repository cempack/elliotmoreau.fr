"use client";

import { useState } from "react";
import { m, useSpring, useTransform, useVelocity } from "motion/react";
import { PixelPlanet } from "@/components/PixelPlanet";
import { SOCIALS } from "@/lib/places";
import { timeAgo } from "@/lib/format";
import { LANG_COLORS, LANG_FALLBACK } from "@/lib/langColors";
import { spring } from "@/lib/motion";
import type { ActivityInfo, RepoInfo } from "@/lib/github";
import { ChapterHead } from "./Chapter";
import { Rise, RiseItem } from "./Rise";
import { useFinePointer, useMounted, useReduced } from "./hooks";
import { useJ } from "./strings";

const FOLLOW = { stiffness: 380, damping: 38, mass: 0.7 };

/**
 * Chapter four, on paper: a pull quote from the last commit, then the
 * repos as an index table. On a mouse, a floating plate follows the
 * pointer on a spring and slides like a film strip between rows; on
 * touch, each row carries its own thumbnail.
 */
export function Work({ repos, activity }: { repos: RepoInfo[]; activity: ActivityInfo | null }) {
  const { c, j } = useJ();
  const mounted = useMounted();
  const fine = useFinePointer();
  const reduced = useReduced();
  const list = repos.slice(0, 6);
  const [hover, setHover] = useState<number | null>(null);
  const [last, setLast] = useState(0);
  const px = useSpring(0, FOLLOW);
  const py = useSpring(0, FOLLOW);
  // the plate sits right of the pointer, and glides to its left near the edge
  const side = useSpring(28, { stiffness: 300, damping: 34 });
  const px2 = useTransform(() => px.get() + side.get());
  // the plate swings a little with the pointer's speed, like a hung card
  const swing = useSpring(
    useTransform(useVelocity(px), [-2400, 0, 2400], [-7, 0, 7], {
      clamp: true,
    }),
    {
      stiffness: 200,
      damping: 26,
    },
  );

  const track = (e: React.PointerEvent) => {
    if (e.pointerType !== "mouse") return;
    side.set(e.clientX > window.innerWidth - 340 ? -308 : 28);
    // first contact: appear where the pointer is, don't fly in from 0,0
    if (hover === null) {
      px.jump(e.clientX);
      py.jump(e.clientY);
    } else {
      px.set(e.clientX);
      py.set(e.clientY);
    }
  };

  return (
    <section id="work" data-chapter="work" className="j-sec j-work" aria-label={c.work}>
      <div className="j-wrap">
        <ChapterHead n={4} title={c.work} sub={c.workSub} mode="inView" aside={j.reposN(list.length)} />

        {activity && (
          <Rise>
            <figure className="j-pull">
              <blockquote>
                <span className="j-pull-q" aria-hidden>
                  “
                </span>
                {activity.message}
                <span aria-hidden>”</span>
              </blockquote>
              <figcaption>
                <span>{j.pullQuoteBy}</span>
                <span className="j-dot" aria-hidden />
                <a href={activity.repoUrl} target="_blank" rel="noreferrer" data-cursor={c.open}>
                  {activity.repo}
                </a>
                {mounted && (
                  <>
                    <span className="j-dot" aria-hidden />
                    <span>{timeAgo(activity.createdAt, c.lang)}</span>
                  </>
                )}
              </figcaption>
            </figure>
          </Rise>
        )}

        <div className="j-table" onPointerMove={fine ? track : undefined} onPointerLeave={() => setHover(null)}>
          <div className="j-tr j-th" aria-hidden>
            <span>№</span>
            <span>{j.project}</span>
            <span>{j.language}</span>
            <span className="j-num">{c.stars}</span>
            <span className="j-num">{c.updated}</span>
            <span />
          </div>
          <ol>
            {list.map((r, i) => (
              <RiseItem key={r.name} i={i}>
                <m.a
                  href={r.url}
                  target="_blank"
                  rel="noreferrer"
                  className="j-tr j-row"
                  data-cursor={c.open}
                  data-on={hover === i || undefined}
                  onPointerEnter={(e) => {
                    if (e.pointerType !== "mouse") return;
                    setHover(i);
                    setLast(i);
                  }}
                  whileTap={{ scale: 0.99 }}
                  transition={spring.snappy}
                >
                  <span className="j-row-n">{String(i + 1).padStart(2, "0")}</span>
                  <span className="j-row-name">
                    <span className="j-row-thumb" aria-hidden>
                      <PixelPlanet seed={r.name} className="j-row-thumb-c" />
                    </span>
                    <span className="j-row-title">
                      <span className="j-row-t">{r.name}</span>
                      <span className="j-row-desc">{r.description}</span>
                    </span>
                  </span>
                  <span className="j-row-lang">
                    <i
                      style={{
                        background: LANG_COLORS[r.language] ?? LANG_FALLBACK,
                      }}
                      aria-hidden
                    />
                    {r.language || "—"}
                  </span>
                  <span className="j-num j-row-stars">
                    <span className="j-row-star" aria-hidden>
                      ★
                    </span>{" "}
                    {r.stars}
                  </span>
                  <span className="j-num j-row-upd">{mounted ? timeAgo(r.pushedAt, c.lang) : ""}</span>
                  <span className="j-row-arrow" aria-hidden>
                    ↗
                  </span>
                </m.a>
              </RiseItem>
            ))}
          </ol>
        </div>

        <a href={SOCIALS.github} target="_blank" rel="noreferrer" className="j-more" data-cursor={c.open}>
          {c.allWork}
          <span className="j-arrow" aria-hidden>
            →
          </span>
        </a>
      </div>

      {fine && (
        <m.div
          className="j-preview"
          aria-hidden
          style={{ x: px2, y: py, rotate: reduced ? 0 : swing }}
          initial={false}
          animate={hover !== null ? { opacity: 1, scale: 1 } : { opacity: 0, scale: 0.8 }}
          transition={spring.default}
        >
          <div className="j-preview-win">
            <m.div
              className="j-preview-strip"
              initial={false}
              animate={{
                y: `${(-(hover ?? last) * 100) / Math.max(1, list.length)}%`,
              }}
              transition={reduced ? { duration: 0 } : spring.default}
            >
              {list.map((r) => (
                <div key={r.name} className="j-preview-cell">
                  <PixelPlanet seed={r.name} className="j-preview-planet" />
                </div>
              ))}
            </m.div>
          </div>
          <div className="j-preview-cap">
            <span className="j-preview-name">{list[hover ?? last]?.name}</span>
            <span className="j-preview-topics">{list[hover ?? last]?.topics.slice(0, 3).join(" · ")}</span>
          </div>
        </m.div>
      )}
    </section>
  );
}
