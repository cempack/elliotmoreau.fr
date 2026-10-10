"use client";

/**
 * The dashboard's layout model, independent of the DOM.
 *
 * The board is a CSS grid with fixed row heights and `grid-auto-flow:
 * dense`, so where every widget lands is a pure function of the order and
 * each widget's span. `pack()` reproduces the browser's dense auto-placement
 * (first fit, row-major, from the top for every item), which lets a drag
 * ask "if I dropped it at index i, where would it go?" for every i without
 * touching the DOM. Phones are a single column with natural heights:
 * slots there are a plain stack of measured heights.
 */

export type Span = { c: number; r: number };
export type Rect = { x: number; y: number; w: number; h: number };

export type Metrics =
  | { kind: "grid"; cols: number; colW: number; rowH: number; gap: number; spans: Map<string, Span> }
  | { kind: "stack"; gap: number; heights: Map<string, number>; width: number };

/** Grid cell placement for each id, CSS dense algorithm. */
export function pack(order: string[], spans: Map<string, Span>, cols: number) {
  const taken: boolean[][] = [];
  const free = (row: number, col: number, c: number, r: number) => {
    for (let y = row; y < row + r; y++) for (let x = col; x < col + c; x++) if (taken[y]?.[x]) return false;
    return true;
  };
  const out = new Map<string, { col: number; row: number; c: number; r: number }>();
  for (const id of order) {
    const s = spans.get(id) ?? { c: 1, r: 1 };
    const c = Math.min(Math.max(1, s.c), cols);
    const r = Math.max(1, s.r);
    for (let row = 0; ; row++) {
      let placed = false;
      for (let col = 0; col + c <= cols; col++) {
        if (!free(row, col, c, r)) continue;
        for (let y = row; y < row + r; y++) {
          taken[y] ??= [];
          for (let x = col; x < col + c; x++) taken[y][x] = true;
        }
        out.set(id, { col, row, c, r });
        placed = true;
        break;
      }
      if (placed) break;
    }
  }
  return out;
}

/** Pixel rects (board coordinates) for every id in an order. */
export function slots(order: string[], m: Metrics): Map<string, Rect> {
  const out = new Map<string, Rect>();
  if (m.kind === "stack") {
    let y = 0;
    for (const id of order) {
      const h = m.heights.get(id) ?? 0;
      out.set(id, { x: 0, y, w: m.width, h });
      y += h + m.gap;
    }
    return out;
  }
  const placed = pack(order, m.spans, m.cols);
  for (const [id, p] of placed) {
    out.set(id, {
      x: p.col * (m.colW + m.gap),
      y: p.row * (m.rowH + m.gap),
      w: p.c * m.colW + (p.c - 1) * m.gap,
      h: p.r * m.rowH + (p.r - 1) * m.gap,
    });
  }
  return out;
}

/** `order` with `id` moved to `index`. */
export function moveTo(order: string[], id: string, index: number) {
  const rest = order.filter((x) => x !== id);
  const i = Math.max(0, Math.min(rest.length, index));
  return [...rest.slice(0, i), id, ...rest.slice(i)];
}

export const sameOrder = (a: readonly string[], b: readonly string[]) =>
  a.length === b.length && a.every((x, i) => x === b[i]);

/**
 * The insertion index whose slot for `id` lies closest to a point (the
 * dragged widget's centre, or where a throw would carry it), plus that
 * distance.
 */
export function bestIndex(order: string[], id: string, m: Metrics, px: number, py: number) {
  let best = { index: order.indexOf(id), dist: Infinity };
  for (let i = 0; i < order.length; i++) {
    const r = slots(moveTo(order, id, i), m).get(id);
    if (!r) continue;
    const d = Math.hypot(r.x + r.w / 2 - px, r.y + r.h / 2 - py);
    if (d < best.dist) best = { index: i, dist: d };
  }
  return best;
}

/** Read the live grid from the DOM at the start of a gesture. */
export function measure(board: HTMLElement, items: Map<string, HTMLElement>): Metrics {
  const cs = getComputedStyle(board);
  const tracks = cs.gridTemplateColumns.split(" ").filter(Boolean);
  const gap = parseFloat(cs.columnGap) || 0;
  if (tracks.length <= 1) {
    const heights = new Map<string, number>();
    for (const [id, el] of items) heights.set(id, el.offsetHeight);
    return { kind: "stack", gap: parseFloat(cs.rowGap) || 0, heights, width: board.clientWidth };
  }
  const spans = new Map<string, Span>();
  for (const [id, el] of items) {
    const ics = getComputedStyle(el);
    const c = Number(/span (\d+)/.exec(ics.gridColumnEnd)?.[1] ?? 1);
    const r = Number(/span (\d+)/.exec(ics.gridRowEnd)?.[1] ?? 1);
    spans.set(id, { c, r });
  }
  return {
    kind: "grid",
    cols: tracks.length,
    colW: parseFloat(tracks[0]) || 0,
    rowH: parseFloat(cs.gridAutoRows) || 0,
    gap,
    spans,
  };
}
