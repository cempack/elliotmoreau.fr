import { bandIndexFor, bandInk } from "@/lib/pixelword";

/**
 * A giant "404" on an LED panel: the hero wordmark's two-pixel strokes and
 * laser bands (paper crest → lime → seafoam → lilac → indigo foot), each
 * lit cell a bevelled pixel with a soft bloom, on a faint grid of unlit
 * cells. Static SVG, so the first paint is already finished; the columns
 * ignite left to right in CSS like the boot mark, and one cell in the
 * last 4 is a dying LED. The alert sits over the 0, and the regular grid
 * is what lets you see the glass bend.
 */

const FOUR = ["...###", "..####", ".##.##", "##..##", "######", "....##", "....##"];
const ZERO = [".####.", "##..##", "##..##", "##..##", "##..##", "##..##", ".####."];
const DIGITS = [FOUR, ZERO, FOUR];
const ROWS = 7;
const DIGIT_W = 6;
const TRACK = 3;
const INK_COLS = DIGITS.length * DIGIT_W + (DIGITS.length - 1) * TRACK;
/** unlit panel around the ink, in cells */
const MARGIN = 1;
const MATRIX_COLS = INK_COLS + MARGIN * 2;
const MATRIX_ROWS = ROWS + MARGIN * 2;

/** lit square inside its cell (the rest is the gap) */
const LED = 0.84;
const O = (1 - LED) / 2;

/** a dying LED in the last 4 */
const FLICKER = `${2 * (DIGIT_W + TRACK) + 1},3`;

const jitter = (i: number) => ((((i + 1) * 2654435761) >>> 0) % 1000) / 1000;

type Cell = { x: number; y: number; fill: string; flicker: boolean };

const LIT: Cell[] = [];
const GHOST: { x: number; y: number }[] = [];
(() => {
  const on = new Set<string>();
  DIGITS.forEach((g, i) => {
    const ox = MARGIN + i * (DIGIT_W + TRACK);
    g.forEach((row, y) => {
      for (let x = 0; x < DIGIT_W; x++) if (row[x] === "#") on.add(`${ox + x},${MARGIN + y}`);
    });
  });
  for (let y = 0; y < MATRIX_ROWS; y++) {
    for (let x = 0; x < MATRIX_COLS; x++) {
      const key = `${x},${y}`;
      if (on.has(key)) {
        const fill = bandInk(bandIndexFor((y - MARGIN) / 7.5));
        LIT.push({ x, y, fill, flicker: `${x - MARGIN},${y - MARGIN}` === FLICKER });
      } else GHOST.push({ x, y });
    }
  }
})();

/** lit cells grouped by column, each column with its ignition delay */
const COLUMNS = Array.from({ length: MATRIX_COLS }, (_, col) => ({
  col,
  d: Math.round(90 + col * 30 + jitter(col) * 110),
  cells: LIT.filter((c) => c.x === col),
})).filter((c) => c.cells.length > 0);

function Led({ c }: { c: Cell }) {
  const x = c.x + O;
  const y = c.y + O;
  return (
    <g className={c.flicker ? "app-nf-matrix-flicker" : undefined}>
      <rect x={x} y={y} width={LED} height={LED} fill={c.fill} />
      {/* bevel: lit top edge, shaded foot */}
      <rect x={x} y={y} width={LED} height={0.1} fill="#fff" opacity={0.38} />
      <rect x={x} y={y + LED - 0.1} width={LED} height={0.1} fill="#05060a" opacity={0.22} />
    </g>
  );
}

export function Matrix404({ className = "" }: { className?: string }) {
  return (
    <svg
      aria-hidden
      focusable="false"
      className={`app-nf-matrix ${className}`}
      viewBox={`0 0 ${MATRIX_COLS} ${MATRIX_ROWS}`}
      preserveAspectRatio="xMidYMid meet"
      shapeRendering="crispEdges"
    >
      <defs>
        <filter id="app-nf-bloom" x="-10%" y="-30%" width="120%" height="160%">
          <feGaussianBlur stdDeviation="0.55" />
        </filter>
      </defs>
      <g className="app-nf-matrix-ghost">
        {GHOST.map((g) => (
          <rect key={`${g.x}-${g.y}`} x={g.x + O} y={g.y + O} width={LED} height={LED} />
        ))}
      </g>
      <g className="app-nf-matrix-bloom" filter="url(#app-nf-bloom)" shapeRendering="auto">
        {LIT.map((c) => (
          <rect key={`${c.x}-${c.y}`} x={c.x} y={c.y} width={1} height={1} fill={c.fill} />
        ))}
      </g>
      {COLUMNS.map((c) => (
        <g key={c.col} className="app-nf-matrix-col" style={{ "--d": `${c.d}ms` } as React.CSSProperties}>
          {c.cells.map((cell) => (
            <Led key={cell.y} c={cell} />
          ))}
        </g>
      ))}
    </svg>
  );
}
