import { bandIndexFor, bandInk } from "@/lib/pixelword";

/**
 * A giant "404" in the hero wordmark's language: two-pixel strokes, the
 * same laser bands (paper crest → lime → seafoam → lilac → indigo foot)
 * and the same voxel relief (dark solids receding up-right, a lit lip on
 * every top edge). Static SVG, so the first paint is already finished; the
 * columns ignite left to right in CSS like the boot mark, and one cell in
 * the last 4 is a dying LED. The alert sits over the 0.
 */

const FOUR = ["...###", "..####", ".##.##", "##..##", "######", "....##", "....##"];
const ZERO = [".####.", "##..##", "##..##", "##..##", "##..##", "##..##", ".####."];
const DIGITS = [FOUR, ZERO, FOUR];
const ROWS = 7;
const DIGIT_W = 6;
export const MATRIX_TRACK = 3;
export const MATRIX_COLS = DIGITS.length * DIGIT_W + (DIGITS.length - 1) * MATRIX_TRACK;
/** relief reaches 2 cells up and ~2.6 right of the ink */
export const MATRIX_PAD = 3;

const SOLID_FAR = "#0C0D22";
const SOLID_NEAR = "#1F2050";
const TOP_FACE = "#FBF9F4";

/** a dying LED in the last 4 */
const FLICKER = `${2 * (DIGIT_W + MATRIX_TRACK) + 1},3`;

type Rect = { x: number; y: number; h?: number; fill: string; op?: number; flicker?: boolean };

const jitter = (i: number) => ((((i + 1) * 2654435761) >>> 0) % 1000) / 1000;

const COLUMNS: { col: number; d: number; rects: Rect[] }[] = (() => {
  const W = MATRIX_COLS;
  const ink = new Uint8Array(W * ROWS);
  DIGITS.forEach((g, i) => {
    const ox = i * (DIGIT_W + MATRIX_TRACK);
    g.forEach((row, y) => {
      for (let x = 0; x < DIGIT_W; x++) if (row[x] === "#") ink[y * W + ox + x] = 1;
    });
  });
  // open sky: flood from the borders so counters (the 0's hole) get no relief
  const sky = new Uint8Array(W * ROWS);
  const stack: number[] = [];
  for (let c = 0; c < W; c++) stack.push(c, (ROWS - 1) * W + c);
  for (let r = 0; r < ROWS; r++) stack.push(r * W, r * W + W - 1);
  while (stack.length) {
    const i = stack.pop() as number;
    if (i < 0 || i >= W * ROWS || sky[i] || ink[i]) continue;
    sky[i] = 1;
    const c = i % W;
    const r = (i / W) | 0;
    if (c > 0) stack.push(i - 1);
    if (c < W - 1) stack.push(i + 1);
    if (r > 0) stack.push(i - W);
    if (r < ROWS - 1) stack.push(i + W);
  }
  const isSky = (x: number, y: number) => x < 0 || x >= W || y < 0 || y >= ROWS || sky[y * W + x] === 1;
  const cols = Array.from({ length: W }, (_, col) => ({
    col,
    d: Math.round(90 + col * 30 + jitter(col) * 110),
    rects: [] as Rect[],
  }));
  const far: Rect[][] = cols.map(() => []);
  const near: Rect[][] = cols.map(() => []);
  const faces: Rect[][] = cols.map(() => []);
  for (let y = 0; y < ROWS; y++) {
    const fill = bandInk(bandIndexFor(y / 7.5));
    for (let x = 0; x < W; x++) {
      if (!ink[y * W + x]) continue;
      const flicker = `${x},${y}` === FLICKER;
      faces[x].push({ x, y, fill, flicker });
      if (isSky(x + 2, y - 2)) far[x].push({ x: x + 1.6, y: y - 2, fill: SOLID_FAR });
      if (isSky(x + 1, y - 1)) near[x].push({ x: x + 0.8, y: y - 1, fill: SOLID_NEAR });
      if (isSky(x, y - 1)) faces[x].push({ x, y, h: 0.5, fill: TOP_FACE, op: 0.85, flicker });
    }
  }
  cols.forEach((c, i) => {
    c.rects = [...far[i], ...near[i], ...faces[i]];
  });
  return cols.filter((c) => c.rects.length > 0);
})();

export function Matrix404({ className = "" }: { className?: string }) {
  const p = MATRIX_PAD;
  return (
    <svg
      aria-hidden
      focusable="false"
      className={`app-nf-matrix ${className}`}
      viewBox={`${-p} ${-p} ${MATRIX_COLS + p * 2} ${ROWS + p * 2}`}
      preserveAspectRatio="xMidYMid meet"
      shapeRendering="crispEdges"
    >
      {COLUMNS.map((c) => (
        <g key={c.col} className="app-nf-matrix-col" style={{ "--d": `${c.d}ms` } as React.CSSProperties}>
          {c.rects.map((r, k) => (
            <rect
              key={k}
              x={r.x}
              y={r.y}
              width={1.02}
              height={r.h ?? 1.02}
              fill={r.fill}
              opacity={r.op}
              className={r.flicker ? "app-nf-matrix-flicker" : undefined}
            />
          ))}
        </g>
      ))}
    </svg>
  );
}
