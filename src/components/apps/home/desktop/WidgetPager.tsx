"use client";

import { useEffect, useRef, useState } from "react";
import { animate, m, useMotionValue } from "motion/react";
import { useI18n } from "@/i18n/client";
import { project, spring } from "@/lib/motion";
import { FLING, band, pushSample, releaseVelocity, type Sample } from "./physics";
import { isPhone } from "./layout";

const fill = (s: string, v: Record<string, string | number>) => s.replace(/\{(\w+)\}/g, (_, k: string) => String(v[k] ?? ""));
/** event-time clock (only ever read from handlers) */
const clock = () => performance.now();

type Swipe = { pid: number; sx: number; sy: number; x0: number; horizontal: boolean; samples: Sample[] };

/**
 * The widgets. On a desk they simply sit in a row; on a phone they are
 * iOS widget pages you swipe between: the row follows the finger 1:1,
 * rubber-bands past the first and last page, and on release the throw is
 * projected (project()) to pick the page, one page per gesture, the spring
 * carrying the finger's velocity. Vertical swipes stay the page's scroll.
 * Focus on a widget on another page turns to it; the dots turn pages too.
 */
export function WidgetPager({
  pages,
  label,
  reduced,
  viewRef: outerRef,
}: {
  pages: React.ReactNode[];
  label: string;
  reduced: boolean;
  viewRef?: React.RefObject<HTMLDivElement | null>;
}) {
  const { t } = useI18n();
  const ownRef = useRef<HTMLDivElement>(null);
  const viewRef = outerRef ?? ownRef;
  const x = useMotionValue(0);
  const [page, setPage] = useState(0);
  const pageRef = useRef(0);
  const swipe = useRef<Swipe | null>(null);
  const quietUntil = useRef(0);
  const n = pages.length;

  /** one page's travel: the view's width plus the gap between pages */
  const pitch = () => {
    const v = viewRef.current;
    const track = v?.firstElementChild as HTMLElement | null;
    if (!v || !track) return 0;
    return v.clientWidth + (parseFloat(getComputedStyle(track).columnGap) || 0);
  };

  const go = (p: number, velocity = 0) => {
    const next = Math.max(0, Math.min(n - 1, p));
    pageRef.current = next;
    setPage(next);
    const to = -next * pitch();
    if (reduced) x.jump(to);
    else animate(x, to, { ...(Math.abs(velocity) > FLING ? spring.flick : spring.default), velocity });
  };

  // keep the current page seated through resizes; desks have no pages
  useEffect(() => {
    const v = viewRef.current;
    if (!v) return;
    const ro = new ResizeObserver(() => {
      x.stop();
      if (!isPhone()) {
        pageRef.current = 0;
        setPage(0);
        x.jump(0);
        return;
      }
      x.jump(-pageRef.current * pitch());
    });
    ro.observe(v);
    return () => ro.disconnect();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [x]);

  const onPointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    if (n < 2 || !isPhone()) return;
    if (e.pointerType === "mouse" && e.button !== 0) return;
    swipe.current = {
      pid: e.pointerId,
      sx: e.clientX,
      sy: e.clientY,
      x0: x.get(),
      horizontal: false,
      samples: [{ t: e.timeStamp, x: e.clientX, y: e.clientY }],
    };
  };

  const onPointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    const s = swipe.current;
    if (!s || s.pid !== e.pointerId) return;
    if (!s.horizontal) {
      const dx = e.clientX - s.sx;
      const dy = e.clientY - s.sy;
      if (Math.hypot(dx, dy) < 8) return;
      // mostly vertical: that's the page scrolling, let it
      if (Math.abs(dy) > Math.abs(dx)) {
        swipe.current = null;
        return;
      }
      // ours: grab the row where it is (mid-flight too) and track from here
      s.horizontal = true;
      x.stop();
      s.x0 = x.get();
      s.sx = e.clientX;
      try {
        e.currentTarget.setPointerCapture(e.pointerId);
      } catch {}
      e.currentTarget.dataset.swiping = "";
    }
    pushSample(s.samples, { t: e.timeStamp, x: e.clientX, y: e.clientY });
    const w = pitch();
    x.set(band(s.x0 + e.clientX - s.sx, -(n - 1) * w, 0, w));
  };

  const onPointerUp = (e: React.PointerEvent<HTMLDivElement>, cancelled: boolean) => {
    const s = swipe.current;
    if (!s || s.pid !== e.pointerId) return;
    swipe.current = null;
    if (!s.horizontal) return;
    delete e.currentTarget.dataset.swiping;
    // the swipe ended on a widget: that is not a tap on it
    quietUntil.current = clock() + 1000;
    window.setTimeout(() => (quietUntil.current = 0), 0);
    const { vx } = cancelled ? { vx: 0 } : releaseVelocity(s.samples, e.timeStamp);
    const w = pitch() || 1;
    const cur = pageRef.current;
    let p = Math.round(-(x.get() + project(vx, 0.995)) / w);
    // a flick always turns the page it points at; one page per gesture
    if (Math.abs(vx) > 320 && p === cur) p = cur + (vx < 0 ? 1 : -1);
    go(Math.max(cur - 1, Math.min(cur + 1, p)), vx);
  };

  return (
    <div
      ref={viewRef}
      className="app-home-widgets"
      role="group"
      aria-label={label}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={(e) => onPointerUp(e, false)}
      onPointerCancel={(e) => onPointerUp(e, true)}
      onClickCapture={(e) => {
        if (clock() < quietUntil.current) {
          e.preventDefault();
          e.stopPropagation();
        }
      }}
      onFocus={(e) => {
        if (!isPhone()) return;
        const el = (e.target as Element).closest(".app-home-widgets-page");
        const i = el ? Array.prototype.indexOf.call(el.parentElement?.children ?? [], el) : -1;
        if (i >= 0 && i !== pageRef.current) go(i);
      }}
      onDragStart={(e) => e.preventDefault()}
    >
      <m.div className="app-home-widgets-track" style={{ x }}>
        {pages.map((p, i) => (
          <div key={i} className="app-home-widgets-page">
            {p}
          </div>
        ))}
      </m.div>
      {n > 1 && (
        <div className="app-home-widgets-dots">
          {pages.map((_, i) => (
            <button
              key={i}
              type="button"
              className="app-home-widgets-dot"
              aria-label={fill(t.home.widgets.page, { n: i + 1, total: n })}
              aria-current={page === i || undefined}
              onClick={() => go(i)}
            />
          ))}
        </div>
      )}
    </div>
  );
}
