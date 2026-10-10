"use client";

import { PixelLabel } from "@/components/PixelLabel";

/**
 * A chapter's masthead: a pixel chapter number and a mono kicker, then
 * the title (display type) and an optional lede. `title` can be any node
 * so a chapter can make it kinetic; `aside` sits at the far end of the
 * title row (controls, links).
 */
export function ChapterHead({
  n,
  kicker,
  title,
  titleId,
  lede,
  aside,
  className = "",
}: {
  n: number;
  kicker: string;
  title: React.ReactNode;
  titleId: string;
  lede?: string;
  aside?: React.ReactNode;
  className?: string;
}) {
  return (
    <header className={`app-story-head ${className}`}>
      <p className="app-story-kicker">
        <span aria-hidden className="app-story-kicker-n">
          <PixelLabel text={String(n).padStart(2, "0")} cell={2} />
        </span>
        <span>{kicker}</span>
      </p>
      <div className="app-story-head-row">
        <div className="app-story-head-main">
          <h2 id={titleId} className="app-story-title">
            {title}
          </h2>
          {lede && <p className="app-story-lede">{lede}</p>}
        </div>
        {aside && <div className="app-story-head-aside">{aside}</div>}
      </div>
    </header>
  );
}
