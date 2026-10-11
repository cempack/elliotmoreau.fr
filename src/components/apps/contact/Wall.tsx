"use client";

import { animate, m, useMotionValue, type AnimationPlaybackControls } from "motion/react";
import { useEffect, useId, useRef, useState, useSyncExternalStore } from "react";
import { PixelGlyph, type Cells } from "@/components/glyphs";
import { PixelLabel } from "@/components/PixelLabel";
import { project, rubberband, spring } from "@/lib/motion";
import { G_ARROW, G_OPEN } from "./glyphs";

/**
 * Elsewhere as a bank of metal letterboxes set into a dark wall of
 * Toulouse brick (brique foraine: long, thin, terracotta gone mostly to
 * ink), one per profile, the way a building's hallway has one per
 * tenant. Each door is the profile link, with the network's mark
 * engraved, a cream tenant label and Elliot's one-line note.
 *
 * Boxes with a live source have mail sticking out of the slot: the last
 * push for GitHub, the song on (or last played) for Spotify, named on the
 * letter's edge. The others stay empty, which is what makes the two read
 * as news. Pull a letter up (it follows 1:1, resists past its travel, and
 * the release is projected) or tap it, and it comes out and opens on the
 * ledge under the boxes; Escape, or pulling another, puts it back. A
 * letter means "latest", never "unread".
 */

export type Box = {
  id: string;
  name: string;
  handle: string;
  href: string;
  note: string;
  glyph: Cells;
  rel?: string;
  /** mail in the slot: its edge label and what it says once opened */
  letter?: { edge: string; label: string; body: React.ReactNode };
};

/** how far a pull travels before it resists, and where the letter is out (it shows 22 px above the slot) */
const TRAVEL = 44;
const OUT = 90;

/* the brick, painted once per session in the browser: a 32 × 8 tile at 2 px a pixel */
let brickUrl: string | null = null;
function brickTile() {
  if (brickUrl) return brickUrl;
  const w = 32;
  const h = 8;
  const cv = document.createElement("canvas");
  cv.width = w;
  cv.height = h;
  const ctx = cv.getContext("2d");
  if (!ctx) return null;
  const BAYER = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5];
  const mortar = "#101311";
  const inks = ["#191c1a", "#221d1a", "#2e221d", "#3a2820"];
  ctx.fillStyle = mortar;
  ctx.fillRect(0, 0, w, h);
  // two courses, half a brick apart; each brick 16 × 4 with a 1 px joint
  for (let row = 0; row < 2; row++) {
    for (let b = -1; b < 2; b++) {
      const x0 = b * 16 + (row ? 8 : 0);
      const y0 = row * 4;
      const tone = [0.28, 0.4, 0.22, 0.34][(b + 1 + row * 2) & 3];
      for (let y = y0; y < y0 + 3; y++)
        for (let x = x0; x < x0 + 15; x++) {
          if (x < 0 || x >= w) continue;
          const t = BAYER[((y & 3) << 2) | (x & 3)] / 16;
          // mostly ink, terracotta showing through the dither; a lit top edge
          const k = y === y0 ? (t < tone + 0.2 ? 3 : 2) : t < tone ? 2 : t < tone + 0.25 ? 1 : 0;
          ctx.fillStyle = inks[k];
          ctx.fillRect(x, y, 1, 1);
        }
    }
  }
  brickUrl = cv.toDataURL();
  return brickUrl;
}
const noop = () => () => {};

function LetterBox({
  box,
  index,
  out,
  onPull,
  ledgeId,
  reduced,
  opens,
}: {
  box: Box;
  index: number;
  out: boolean;
  onPull: (id: string | null, viaKey?: boolean) => void;
  ledgeId: string;
  reduced: boolean;
  opens: string;
}) {
  const ly = useMotionValue(0);
  const lo = useMotionValue(1);
  const anims = useRef<AnimationPlaybackControls[]>([]);
  /** the press was handled as a pointer; the click that follows isn't a second pull */
  const handled = useRef(false);
  const g = useRef<{ pid: number; y0: number; start: number; s: { t: number; y: number }[]; moved: boolean } | null>(null);
  const stop = () => {
    anims.current.forEach((a) => a.stop());
    anims.current = [];
  };
  useEffect(() => () => stop(), []);

  // out: lifted clear of the slot and gone to the ledge; back: it drops into the slot again
  useEffect(() => {
    stop();
    if (reduced) {
      ly.set(0);
      anims.current.push(animate(lo, out ? 0 : 1, { duration: 0.15 }));
      return;
    }
    if (out) anims.current.push(animate(ly, -OUT, spring.default), animate(lo, 0, { duration: 0.18, delay: 0.06 }));
    else {
      if (ly.get() < -TRAVEL) ly.set(-OUT);
      anims.current.push(animate(ly, 0, spring.default), animate(lo, 1, { duration: 0.12 }));
    }
    // ly/lo are stable motion values
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [out, reduced]);

  const onPointerDown = (e: React.PointerEvent<HTMLButtonElement>) => {
    if (e.button !== 0 || out || reduced) return;
    e.preventDefault();
    stop();
    handled.current = true;
    e.currentTarget.setPointerCapture(e.pointerId);
    g.current = { pid: e.pointerId, y0: e.clientY - ly.get(), start: e.clientY, s: [{ t: e.timeStamp, y: e.clientY }], moved: false };
  };
  const onPointerMove = (e: React.PointerEvent<HTMLButtonElement>) => {
    const d = g.current;
    if (!d || d.pid !== e.pointerId) return;
    if (Math.abs(e.clientY - d.start) > 4) d.moved = true;
    d.s.push({ t: e.timeStamp, y: e.clientY });
    while (d.s.length > 2 && e.timeStamp - d.s[0].t > 80) d.s.shift();
    const up = d.y0 - e.clientY;
    // up and out 1:1; it resists past its travel, and won't go further into the box
    ly.set(-(up < 0 ? rubberband(up, 20) : up > TRAVEL ? TRAVEL + rubberband(up - TRAVEL, 40) : up));
  };
  const onPointerUp = (e: React.PointerEvent<HTMLButtonElement>) => {
    const d = g.current;
    if (!d || d.pid !== e.pointerId) return;
    g.current = null;
    if (!d.moved) {
      onPull(box.id);
      return;
    }
    let v = 0;
    const a = d.s[0];
    const b = d.s[d.s.length - 1];
    if (d.s.length > 1 && e.timeStamp - b.t < 60) v = ((b.y - a.y) / Math.max(8, b.t - a.t)) * 1000;
    if (-(ly.get() + project(v, 0.995)) > TRAVEL * 0.6) {
      // thrown out: it carries the release speed, with a little bounce only for a real throw
      anims.current.push(animate(ly, -OUT, { ...(v < -500 ? spring.flick : spring.default), velocity: v }), animate(lo, 0, { duration: 0.2, delay: 0.05 }));
      onPull(box.id);
      return;
    }
    anims.current.push(animate(ly, 0, { ...spring.default, velocity: v }));
  };

  return (
    <div
      className="app-contact-box"
      role="listitem"
      data-id={box.id}
      data-mail={box.letter ? "" : undefined}
      data-out={out || undefined}
      style={{ "--i": index + 1 } as React.CSSProperties}
    >
      <a href={box.href} target="_blank" rel={box.rel ?? "noopener noreferrer"} className="app-contact-box-door">
        <span className="app-contact-box-glyph" aria-hidden>
          <PixelGlyph cells={box.glyph} size={14} />
        </span>
        <span className="app-contact-box-slot" aria-hidden />
        <span className="app-contact-box-label">
          <span className="app-contact-box-name">{box.name}</span>
          <span className="app-contact-box-handle">{box.handle}</span>
        </span>
        <span className="app-contact-box-note">{box.note}</span>
        <span className="sr-only">{opens}</span>
      </a>
      {box.letter && (
        <span className="app-contact-box-mouth">
          <m.button
            type="button"
            className="app-contact-box-letter"
            style={{ y: ly, opacity: lo }}
            aria-expanded={out}
            aria-controls={ledgeId}
            aria-label={box.letter.label}
            tabIndex={out ? -1 : 0}
            onPointerDown={onPointerDown}
            onPointerMove={onPointerMove}
            onPointerUp={onPointerUp}
            onPointerCancel={onPointerUp}
            onClick={() => {
              // a pointer press is handled above (except under reduced motion); this is Enter, Space or a plain click
              if (handled.current) {
                handled.current = false;
                return;
              }
              onPull(box.id, true);
            }}
          >
            <span className="app-contact-box-paper" aria-hidden>
              <PixelLabel text={box.letter.edge} cell={1} />
            </span>
          </m.button>
        </span>
      )}
    </div>
  );
}

export function Wall({
  boxes,
  label,
  opens,
  closeLabel,
  reduced,
}: {
  boxes: Box[];
  label: string;
  opens: string;
  closeLabel: string;
  reduced: boolean;
}) {
  const id = useId();
  const ledgeId = `${id}-ledge`;
  const brick = useSyncExternalStore(noop, brickTile, () => null);
  const [out, setOut] = useState<string | null>(null);
  const ledge = useRef<HTMLDivElement>(null);
  /** opened from the keyboard: focus follows the letter to the ledge */
  const keyed = useRef(false);
  const shown = boxes.find((b) => b.id === out && b.letter);
  const index = shown ? boxes.indexOf(shown) : -1;

  // the letter is out: focus moves to what it says; Escape puts it back
  useEffect(() => {
    if (!out) return;
    const t = window.setTimeout(() => {
      if (keyed.current) ledge.current?.focus({ preventScroll: true });
    }, reduced ? 0 : 220);
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      e.preventDefault();
      const back = out;
      setOut(null);
      window.setTimeout(() => document.querySelector<HTMLElement>(`[data-id="${back}"] .app-contact-box-letter`)?.focus(), 0);
    };
    window.addEventListener("keydown", onKey);
    return () => {
      window.clearTimeout(t);
      window.removeEventListener("keydown", onKey);
    };
  }, [out, reduced]);

  return (
    <div className="app-contact-wall" style={brick ? ({ "--app-contact-brick": `url(${brick})` } as React.CSSProperties) : undefined}>
      <div className="app-contact-boxes" style={{ "--app-contact-open": index >= 0 ? index + 1 : 99 } as React.CSSProperties}>
        <div role="list" aria-label={label} className="app-contact-boxes-list">
          {boxes.map((b, i) => (
            <LetterBox
              key={b.id}
              box={b}
              index={i}
              out={out === b.id}
              onPull={(v, viaKey) => {
                keyed.current = Boolean(viaKey);
                setOut((cur) => (cur === v ? null : v));
              }}
              ledgeId={ledgeId}
              reduced={reduced}
              opens={opens}
            />
          ))}
        </div>
        <div id={ledgeId} className="app-contact-ledge" data-open={shown ? "" : undefined}>
          {shown?.letter && (
            <m.div
              key={shown.id}
              ref={ledge}
              tabIndex={-1}
              className="app-contact-ledge-letter"
              role="group"
              aria-label={shown.letter.label}
              initial={reduced ? { opacity: 0 } : { opacity: 0, y: -18, scaleY: 0.6 }}
              animate={{ opacity: 1, y: 0, scaleY: 1 }}
              transition={reduced ? { duration: 0.15 } : { ...spring.default, delay: 0.08 }}
            >
              {shown.letter.body}
              <button type="button" className="app-contact-ledge-close" onClick={() => setOut(null)} aria-label={closeLabel}>
                <span aria-hidden>×</span>
              </button>
            </m.div>
          )}
        </div>
      </div>
    </div>
  );
}

/** a link out of an opened letter */
export function LetterLink({ href, children }: { href: string; children: React.ReactNode }) {
  return (
    <a href={href} target="_blank" rel="noopener noreferrer" className="app-contact-ledge-link">
      <PixelGlyph cells={href.includes("spotify") ? G_OPEN : G_ARROW} size={12} />
      <span>{children}</span>
    </a>
  );
}
