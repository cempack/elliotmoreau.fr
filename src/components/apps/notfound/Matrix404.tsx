import { bandIndexFor, bandInk } from "@/lib/pixelword";

/**
 * A giant "404" on an LED panel: the hero wordmark's two-pixel strokes and
 * laser bands (paper crest → lime → seafoam → lilac → indigo foot), each
 * lit cell a bevelled pixel with a soft bloom, on a faint grid of unlit
 * cells. Static SVG, so the first paint is already finished; the columns
 * ignite left to right in CSS like the boot mark.
 *
 * The 0 is the app that isn't there: it lights with the rest, sputters
 * and dies to a dim ghost of its colours, and one of its LEDs keeps
 * trying. Where the alert sits over it (wide screens) that ghost is only
 * there once you pull the alert away (`--nf-reveal`, 0 at rest → 1, set
 * from the drag): at rest the glass bends unlit cells, crisp grid lines,
 * and the text sits on calm glass, not on coloured blocks. On phones the
 * alert sits below the 404, so the ghost is always in view.
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

/** the 0's columns (ink space) */
const ZERO_X0 = DIGIT_W + TRACK;
const isZero = (inkX: number) => inkX >= ZERO_X0 && inkX < ZERO_X0 + DIGIT_W;
/** the LED in the dead 0 that keeps trying (ink space): in its foot, so on
    a desktop it hides behind the alert's buttons until you pull it away */
const FLICKER = `${ZERO_X0 + 3},6`;

const jitter = (i: number) => ((((i + 1) * 2654435761) >>> 0) % 1000) / 1000;

type Cell = { x: number; y: number; fill: string; flicker: boolean; dead: boolean };

const LIT: Cell[] = [];
const GHOST: { x: number; y: number }[] = [];
/** the dead 0's cells, unlit: what's left when it gives up */
const DEAD: { x: number; y: number }[] = [];
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
        const dead = isZero(x - MARGIN);
        LIT.push({ x, y, fill, flicker: `${x - MARGIN},${y - MARGIN}` === FLICKER, dead });
        if (dead) DEAD.push({ x, y });
      } else GHOST.push({ x, y });
    }
  }
})();

const delay = (col: number) => Math.round(90 + col * 30 + jitter(col) * 110);

/** lit cells grouped by column, each column with its ignition delay */
const COLUMNS = Array.from({ length: MATRIX_COLS }, (_, col) => ({
  col,
  d: delay(col),
  dead: isZero(col - MARGIN),
  cells: LIT.filter((c) => c.x === col),
})).filter((c) => c.cells.length > 0);

const TRYING = LIT.find((c) => c.flicker);

function Led({ c }: { c: Cell }) {
  const x = c.x + O;
  const y = c.y + O;
  return (
    <>
      <rect x={x} y={y} width={LED} height={LED} fill={c.fill} />
      {/* bevel: lit top edge, shaded foot */}
      <rect x={x} y={y} width={LED} height={0.1} fill="#fff" opacity={0.38} />
      <rect x={x} y={y + LED - 0.1} width={LED} height={0.1} fill="#0a0c0b" opacity={0.22} />
    </>
  );
}

function Column({ c }: { c: (typeof COLUMNS)[number] }) {
  return (
    <g
      className={c.dead ? "app-nf-matrix-col app-nf-matrix-dead" : "app-nf-matrix-col"}
      style={{ "--d": `${c.d}ms` } as React.CSSProperties}
    >
      {c.cells.map((cell) => (cell.flicker ? null : <Led key={cell.y} c={cell} />))}
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
      <g className="app-nf-matrix-ghost app-nf-matrix-ghost--dead">
        {DEAD.map((g) => (
          <rect key={`${g.x}-${g.y}`} x={g.x + O} y={g.y + O} width={LED} height={LED} />
        ))}
      </g>
      {/* the dead 0 doesn't glow */}
      <g className="app-nf-matrix-bloom" filter="url(#app-nf-bloom)" shapeRendering="auto">
        {LIT.filter((c) => !c.dead).map((c) => (
          <rect key={`${c.x}-${c.y}`} x={c.x} y={c.y} width={1} height={1} fill={c.fill} />
        ))}
      </g>
      {COLUMNS.filter((c) => !c.dead).map((c) => (
        <Column key={c.col} c={c} />
      ))}
      <g className="app-nf-matrix-reveal">
        {COLUMNS.filter((c) => c.dead).map((c) => (
          <Column key={c.col} c={c} />
        ))}
        {TRYING && (
          <g className="app-nf-matrix-flicker" style={{ "--d": `${delay(TRYING.x)}ms` } as React.CSSProperties}>
            <Led c={TRYING} />
          </g>
        )}
      </g>
    </svg>
  );
}
