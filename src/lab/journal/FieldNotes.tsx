"use client";

import { useRef } from "react";
import { m, useScroll, useTransform } from "motion/react";
import { PixelPlanet } from "@/components/PixelPlanet";
import { PressAnchor } from "@/components/ui/Pressable";
import { timeAgo } from "@/lib/format";
import { spring } from "@/lib/motion";
import type { GhostPost } from "@/lib/ghost";
import { ChapterHead } from "./Chapter";
import { useMounted, useReduced } from "./hooks";
import { Rise, RiseItem } from "./Rise";
import { useJ } from "./strings";

const BLOG = "https://blog.elliotmoreau.fr";

const rowV = {
  rest: { x: 0 },
  hover: { x: 14 },
};
const arrowV = {
  rest: { x: 0, y: 0 },
  hover: { x: 4, y: -4 },
};

/**
 * Chapter two: the lead post as a magazine spread (display title, dek
 * with a drop cap, byline, a PixelPlanet plate), the rest as an index
 * with big numerals.
 */
export function FieldNotes({ posts }: { posts: GhostPost[] }) {
  const { c, j } = useJ();
  const mounted = useMounted();
  const [lead, ...others] = posts;
  // the plate's planet drifts a touch slower than the page: depth, quietly
  const plateRef = useRef<HTMLElement>(null);
  const reduced = useReduced();
  const { scrollYProgress } = useScroll({
    target: plateRef,
    offset: ["start end", "end start"],
  });
  const drift = useTransform(scrollYProgress, [0, 1], ["7%", "-7%"]);

  return (
    <section id="writing" data-chapter="writing" className="j-sec j-notes" aria-label={c.writing}>
      <div className="j-wrap">
        <ChapterHead n={2} title={j.fieldNotes} sub={c.writingSub} aside={j.storiesN(posts.length)} />

        {lead && (
          <article className="j-lead">
            <Rise className="j-lead-text">
              <p className="j-lead-k">
                <span>{j.leadStory}</span>
                {lead.tags[0] && (
                  <>
                    <span className="j-dot" aria-hidden />
                    <span>{lead.tags[0].name}</span>
                  </>
                )}
              </p>
              <h3 className="j-lead-title">
                <a href={lead.url} target="_blank" rel="noreferrer" data-cursor={c.read}>
                  {lead.title}
                </a>
              </h3>
              <p className="j-lead-dek">{lead.excerpt}</p>
              <p className="j-byline">
                <span>{j.by}</span>
                {mounted && (
                  <>
                    <span className="j-dot" aria-hidden />
                    <span>{timeAgo(lead.published_at, c.lang)}</span>
                  </>
                )}
                <span className="j-dot" aria-hidden />
                <span>
                  {lead.reading_time} {c.minRead}
                </span>
              </p>
              <PressAnchor
                href={lead.url}
                target="_blank"
                rel="noreferrer"
                className="j-btn j-btn-line j-lead-cta"
                data-cursor={c.read}
              >
                {j.readStory}
                <span className="j-arrow" aria-hidden>
                  →
                </span>
              </PressAnchor>
            </Rise>
            <m.figure
              ref={plateRef}
              className="j-plate"
              initial="rest"
              whileHover="hover"
              animate="rest"
              data-cursor={c.read}
            >
              <a href={lead.url} target="_blank" rel="noreferrer" tabIndex={-1} aria-hidden className="j-plate-mat">
                <m.span className="j-plate-drift" style={{ y: reduced ? 0 : drift }}>
                  <m.span
                    className="j-plate-art"
                    variants={{ rest: { scale: 1 }, hover: { scale: 1.04 } }}
                    transition={spring.gentle}
                  >
                    <PixelPlanet seed={lead.slug} className="j-plate-canvas" />
                  </m.span>
                </m.span>
                <span className="j-plate-tag">{j.plate} I</span>
              </a>
              <figcaption className="j-plate-cap">
                <em>{j.plate} I.</em> {j.plateCaption}
              </figcaption>
            </m.figure>
          </article>
        )}

        {others.length > 0 && (
          <div className="j-index">
            <p className="j-index-k">{j.alsoIn}</p>
            <ul>
              {others.map((p, i) => (
                <RiseItem key={p.slug} i={i}>
                  <m.a
                    href={p.url}
                    target="_blank"
                    rel="noreferrer"
                    className="j-idx-row"
                    data-cursor={c.read}
                    initial="rest"
                    animate="rest"
                    whileHover="hover"
                    whileTap={{ scale: 0.99 }}
                  >
                    <span className="j-idx-n" aria-hidden>
                      {String(i + 2).padStart(2, "0")}
                    </span>
                    <m.span className="j-idx-title" variants={rowV} transition={spring.default}>
                      {p.title}
                    </m.span>
                    <span className="j-idx-meta">
                      {p.tags[0]?.name && <span>{p.tags[0].name}</span>}
                      {mounted && <span>{timeAgo(p.published_at, c.lang)}</span>}
                      <span>
                        {p.reading_time} {c.minRead}
                      </span>
                    </span>
                    <m.span className="j-idx-arrow" aria-hidden variants={arrowV} transition={spring.snappy}>
                      ↗
                    </m.span>
                  </m.a>
                </RiseItem>
              ))}
            </ul>
            <a href={BLOG} target="_blank" rel="noreferrer" className="j-more" data-cursor={c.open}>
              {c.allPosts}
              <span className="j-arrow" aria-hidden>
                →
              </span>
            </a>
          </div>
        )}
      </div>
    </section>
  );
}
