"use client";

import { useEffect, useRef } from "react";
import { animate, m, useMotionValue, useTransform } from "motion/react";

/**
 * The pixel envelope: a letter standing in an open envelope, drawn as
 * crisp SVG cells (32 × 28 on a 33 × 30 grid, the extra row and column
 * for the pixel drop shadow). It is a live miniature of the draft: the
 * subject is a lime line, the body a stack of ink lines whose lengths
 * follow the real text.
 *
 * `sealed` plays the fold in pixel steps: the letter slides in, the open
 * flap folds down to nothing and the closed flap unfolds over the pocket,
 * then the seal stamps. `instant` jumps straight to the end.
 */

export const ENV_W = 33;
export const ENV_H = 30;
const W = 32;
const FLAP = 8; // open flap rows (2:1 slope)
const TOP = 9; // first body row (the hinge)
const BOTTOM = 28; // last body row
const LETTER = { x: 8, w: 16, y: 3 };
const TEXT_X = 10;
export const TEXT_CELLS = 12;
export const MAX_LINES = 6;
const SLIDE = TOP - LETTER.y; // rows the letter travels to sit inside

const P = {
  paper: "#ebe9e1",
  paperEdge: "#d2cec5",
  paperTop: "#fffdf8",
  rule: "#e9e5dd",
  sideL: "#e6e2da",
  sideR: "#dad6ce",
  bottom: "#cdc9c1",
  crease: "#aaa69e",
  rim: "#e4e0d8",
  vEdge: "#fffdf8",
  vShade: "rgba(10, 12, 11, 0.2)",
  flapOut: "#ece8e0",
  flapEdge: "#b8b4ac",
  liner: "#1d1a45",
  stripe: "#5a4bc4",
  ink: "#3f4842",
  lime: "#b0cc86",
  limeDeep: "#86a35c",
  limeLight: "#e9ffc2",
  subject: "#7fbf14",
} as const;

type Run = { x: number; y: number; w: number; fill: string };

/** Paint a region cell by cell, merged into horizontal runs. */
function paint(x0: number, x1: number, y0: number, y1: number, at: (x: number, y: number) => string | null): Run[] {
  const out: Run[] = [];
  for (let y = y0; y <= y1; y++) {
    let cur: Run | null = null;
    for (let x = x0; x <= x1; x++) {
      const fill = at(x, y);
      if (fill && cur && cur.fill === fill && cur.x + cur.w === x) cur.w++;
      else {
        if (cur) out.push(cur);
        cur = fill ? { x, y, w: 1, fill } : null;
      }
    }
    if (cur) out.push(cur);
  }
  return out;
}

const half = (x: number) => Math.floor(Math.min(x, W - 1 - x) / 2);
/** top edge of the front pocket (a V dipping to the middle) */
const vTop = (x: number) => TOP + half(x);
/** top edge of the bottom flap (a shallow Λ) */
const bTop = (x: number) => BOTTOM - half(x);
const stripe = (x: number, y: number) => (x + y) % 4 === 0;

// static layers, computed once
const LINER = paint(0, W - 1, TOP, 18, (x, y) => (stripe(x, y) ? P.stripe : P.liner));

// open flap (inside face): rows 1..8, rim of paper along the slopes
const FLAP_OPEN = paint(0, W - 1, TOP - FLAP, TOP - 1, (x, y) => {
  const k = TOP - 1 - y; // 0 at the hinge
  const l = 2 * k;
  const r = W - 1 - 2 * k;
  if (x < l || x > r) return null;
  if (x <= l + 1 || x >= r - 1 || y === TOP - FLAP) return P.rim;
  return stripe(x, y) ? P.stripe : P.liner;
});

const POCKET = paint(0, W - 1, TOP, BOTTOM, (x, y) => {
  const v = vTop(x);
  // the pocket's lip shades whatever stands behind it (the letter)
  if (y === v - 1) return x >= LETTER.x && x < LETTER.x + LETTER.w ? P.vShade : null;
  if (y < v) return null;
  if (y === v) return P.vEdge; // the crisp paper edge, catching the light
  const b = bTop(x);
  if (y === b) return P.crease;
  if (y > b) return P.bottom;
  return x < W / 2 ? P.sideL : P.sideR;
});

// closed flap (outside face): rows 9..16, darker lip along the slopes
const FLAP_SHUT = paint(0, W - 1, TOP, TOP + FLAP - 1, (x, y) => {
  const k = y - TOP;
  const l = 2 * k;
  const r = W - 1 - 2 * k;
  if (x < l || x > r) return null;
  if (x <= l + 1 || x >= r - 1 || y === TOP + FLAP - 1) return P.flapEdge;
  return P.flapOut;
});

const SEAL = paint(13, 18, 14, 19, (x, y) => {
  const rows: Record<number, string> = {
    14: "..LL..",
    15: ".LSSS.",
    16: "LSSSSs",
    17: "SSSSSs",
    18: ".SSSs.",
    19: "..ss..",
  };
  const c = rows[y]?.[x - 13];
  if (c === "L") return P.limeLight;
  if (c === "S") return P.lime;
  if (c === "s") return P.limeDeep;
  return null;
});

// pixel drop shadow: the pocket's silhouette, one cell down and right
const SHADOW = paint(1, W, TOP + 1, BOTTOM + 1, (x, y) => {
  const sx = x - 1;
  const sy = y - 1;
  if (sx < 0 || sx > W - 1 || sy < TOP) return null;
  return "rgba(10, 12, 11, 0.5)";
});

// tall enough to fill the pocket once tucked in, short enough never to poke out below it
const LETTER_BODY = paint(LETTER.x, LETTER.x + LETTER.w, LETTER.y, BOTTOM - 1 - SLIDE, (x, y) => {
  if (x === LETTER.x + LETTER.w) return y > LETTER.y ? "rgba(10, 12, 11, 0.28)" : null; // cast shadow
  if (x === LETTER.x + LETTER.w - 1) return P.paperEdge;
  if (y === LETTER.y) return P.paperTop;
  return P.paper;
});

/** ruled lines on the letter, under the writing */
const RULES = Array.from({ length: MAX_LINES }, (_, i) => LETTER.y + 4 + i * 2);

/**
 * A layer as one <path> per colour (a few elements instead of hundreds of
 * rects). Built once at module load; React skips identical elements, so
 * typing never touches them.
 */
function layer(runs: Run[]) {
  const byFill = new Map<string, string>();
  for (const r of runs) byFill.set(r.fill, `${byFill.get(r.fill) ?? ""}M${r.x} ${r.y}h${r.w}v1h${-r.w}z`);
  return [...byFill].map(([fill, d]) => <path key={fill} d={d} fill={fill} />);
}

const L_SHADOW = layer(SHADOW);
const L_LINER = layer(LINER);
const L_FLAP_OPEN = layer(FLAP_OPEN);
const L_LETTER = layer([...LETTER_BODY, ...RULES.map((y) => ({ x: TEXT_X, y, w: TEXT_CELLS, fill: P.rule }))]);
const L_POCKET = layer(POCKET);
const L_FLAP_SHUT = layer(FLAP_SHUT);
const L_SEAL = layer(SEAL);

/** fold timings (s): the letter slides in, the flaps swap, then the seal stamps */
const FOLD = { letter: 0.22, back: [0.15, 0.1], front: [0.24, 0.12] } as const;
/** when the fold is done and the seal starts to stamp */
export const FOLDED_AT = 0.36;
const STAMP = { duration: 0.24, ease: [0.3, 1.6, 0.6, 1] as const };

export function Envelope({
  subject = 0,
  lines = [],
  sealed = false,
  lifted = false,
  instant = false,
  stamp = false,
  onFolded,
  className = "",
}: {
  /** subject line length in cells (0 = none) */
  subject?: number;
  /** body line lengths in cells, 0 for a blank line */
  lines?: number[];
  sealed?: boolean;
  /** the letter rises a row while it's being written */
  lifted?: boolean;
  instant?: boolean;
  /** mounted sealed: the seal is still stamping (the fold happened in the slot) */
  stamp?: boolean;
  /** the flaps are shut and the seal starts to stamp (or at once when `instant`) */
  onFolded?: () => void;
  className?: string;
}) {
  const letter = useMotionValue(sealed ? SLIDE : 0);
  const back = useMotionValue(sealed ? 0 : 1);
  const front = useMotionValue(sealed ? 1 : 0);
  const seal = useMotionValue(sealed && !stamp ? 1 : 0);
  // pixel steps: whole rows for the letter, whole rows of each flap
  const letterY = useTransform(letter, (v) => Math.round(v));
  const backS = useTransform(back, (v) => Math.round(v * FLAP) / FLAP);
  const frontS = useTransform(front, (v) => Math.round(v * FLAP) / FLAP);
  const sealS = useTransform(seal, (v) => Math.max(0, v));
  const sealO = useTransform(seal, (v) => (v > 0.05 ? 1 : 0));

  const onFoldedRef = useRef(onFolded);
  useEffect(() => {
    onFoldedRef.current = onFolded;
  });

  // the letter breathes up a row while it's being written
  useEffect(() => {
    if (sealed) return;
    const c = animate(letter, lifted ? -1 : 0, { duration: instant ? 0 : 0.18, ease: "easeOut" });
    return () => c.stop();
  }, [lifted, sealed, instant, letter]);

  // fold (sealed) and unfold (unsealed), in pixel steps
  useEffect(() => {
    const shut = letter.get() === SLIDE && front.get() === 1;
    const open = front.get() === 0 && back.get() === 1 && seal.get() === 0;
    if (sealed) {
      if (instant) {
        letter.jump(SLIDE);
        back.jump(0);
        front.jump(1);
        seal.jump(1);
        onFoldedRef.current?.();
        return;
      }
      if (shut) {
        // already folded: only the seal is left to stamp
        if (seal.get() === 1) return;
        const c = animate(seal, 1, STAMP);
        return () => c.stop();
      }
      const fold = animate([
        [letter, SLIDE, { duration: FOLD.letter, ease: [0.5, 0, 0.75, 0] }],
        [back, 0, { duration: FOLD.back[1], ease: "easeIn", at: FOLD.back[0] }],
        [front, 1, { duration: FOLD.front[1], ease: "easeOut", at: FOLD.front[0] }],
      ]);
      const stamp = animate(seal, 1, { ...STAMP, delay: FOLDED_AT });
      let done = false;
      fold.then(() => {
        if (done) return;
        done = true;
        onFoldedRef.current?.();
      });
      return () => {
        done = true;
        fold.stop();
        stamp.stop();
      };
    }
    if (open) return;
    if (instant) {
      seal.jump(0);
      front.jump(0);
      back.jump(1);
      letter.jump(0);
      return;
    }
    const c = animate([
      [seal, 0, { duration: 0.1, ease: "easeIn" }],
      [front, 0, { duration: 0.12, ease: "easeIn", at: 0.06 }],
      [back, 1, { duration: 0.12, ease: "easeOut", at: 0.16 }],
      [letter, 0, { duration: 0.3, ease: [0.22, 1, 0.36, 1], at: 0.24 }],
    ]);
    return () => c.stop();
  }, [sealed, instant, letter, back, front, seal]);

  const maxW = TEXT_CELLS;
  return (
    <svg
      viewBox={`0 0 ${ENV_W} ${ENV_H}`}
      shapeRendering="crispEdges"
      className={`app-contact-env ${className}`}
      aria-hidden
      focusable="false"
    >
      {L_SHADOW}
      {L_LINER}
      <m.g style={{ scaleY: backS, originY: 1 }}>{L_FLAP_OPEN}</m.g>
      <m.g style={{ y: letterY }}>
        {L_LETTER}
        {subject > 0 && (
          <rect x={TEXT_X} y={LETTER.y + 2} width={Math.min(subject, maxW - 2)} height={1} fill={P.subject} />
        )}
        {lines.slice(0, MAX_LINES).map((w, i) =>
          w > 0 ? (
            <rect key={i} x={TEXT_X} y={LETTER.y + 4 + i * 2} width={Math.min(w, maxW)} height={1} fill={P.ink} />
          ) : null
        )}
      </m.g>
      {L_POCKET}
      <m.g style={{ scaleY: frontS, originY: 0 }}>{L_FLAP_SHUT}</m.g>
      <m.g style={{ scale: sealS, opacity: sealO, originX: 0.5, originY: 0.5 }}>{L_SEAL}</m.g>
    </svg>
  );
}
