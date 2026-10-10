/**
 * The emOS mark: a lowercase "em" set on an LED-style pixel matrix, lime
 * on ink. Each lit cell knows its ignition delay (`--d`), so the boot
 * screen assembles it cell by cell in pure CSS from the very first
 * server-rendered paint. Two cells carry a paper-white glint: the glass
 * catching light on the pixels.
 */
const E = [".###.", "#...#", "#####", "#....", "#....", ".####"];
const M = ["####.", "#.#.#", "#.#.#", "#.#.#", "#.#.#", "#.#.#"];
const GLYPH = E.map((row, i) => `${row}.${M[i]}`);

/** Matrix size: the 11×6 glyph with a one-cell margin all round. */
export const MARK_COLS = GLYPH[0].length + 2;
export const MARK_ROWS = GLYPH.length + 2;

const GLINT = new Set(["2,1", "7,1"]);

type Cell = { x: number; y: number; on: boolean; glint: boolean; d: number };

/** Deterministic 0–1 jitter per cell (no randomness during render). */
const jitter = (i: number) => (((i + 1) * 2654435761) >>> 0) % 1000 / 1000;

const CELLS: Cell[] = (() => {
  const out: Cell[] = [];
  for (let y = 0; y < MARK_ROWS; y++) {
    for (let x = 0; x < MARK_COLS; x++) {
      const gx = x - 1;
      const gy = y - 1;
      const on = gy >= 0 && gy < GLYPH.length && gx >= 0 && gx < GLYPH[0].length && GLYPH[gy][gx] === "#";
      // a left-to-right sweep, roughened so it reads as assembling, not wiping
      const d = Math.round(70 + x * 26 + jitter(y * MARK_COLS + x) * 120);
      out.push({ x, y, on, glint: GLINT.has(`${x},${y}`), d });
    }
  }
  return out;
})();

export function EmMark({
  cell,
  gap,
  animate = false,
  ghost = true,
  className = "",
}: {
  /** cell size in CSS px (defaults to the CSS `--c`, so media queries can size it) */
  cell?: number;
  gap?: number;
  /** boot ignition (CSS keyframes, staggered per cell) */
  animate?: boolean;
  /** show the unlit matrix behind the glyph */
  ghost?: boolean;
  className?: string;
}) {
  return (
    <span
      aria-hidden
      className={`os-intro-mark ${animate ? "is-boot" : ""} ${className}`}
      style={
        {
          ...(cell != null && { "--c": `${cell}px` }),
          ...(gap != null && { "--g": `${gap}px` }),
          gridTemplateColumns: `repeat(${MARK_COLS}, var(--c))`,
        } as React.CSSProperties
      }
    >
      {CELLS.map((c) =>
        c.on ? (
          <i
            key={`${c.x}-${c.y}`}
            className={`os-intro-mark-cell is-on ${c.glint ? "is-glint" : ""}`}
            style={{ "--d": `${c.d}ms` } as React.CSSProperties}
          />
        ) : (
          <i key={`${c.x}-${c.y}`} className={`os-intro-mark-cell ${ghost ? "" : "is-void"}`} />
        )
      )}
    </span>
  );
}
