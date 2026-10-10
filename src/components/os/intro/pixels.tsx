/**
 * Tiny pixel drawings for the lock screen: the padlock (its shackle is a
 * separate layer so unlocking can lift it) and the sky glyphs that sit by
 * the date. Cell maps are strings, rendered as crisp SVG rects, SSR-safe.
 */
import { m } from "motion/react";

type Map = string[];

function rects(map: Map) {
  const out: { x: number; y: number }[] = [];
  map.forEach((row, y) => [...row].forEach((ch, x) => ch === "#" && out.push({ x, y })));
  return out;
}

function Pixels({ map, cell, className = "" }: { map: Map; cell: number; className?: string }) {
  const w = map[0].length;
  const h = map.length;
  return (
    <svg
      aria-hidden
      width={w * cell}
      height={h * cell}
      viewBox={`0 0 ${w} ${h}`}
      shapeRendering="crispEdges"
      fill="currentColor"
      className={className}
    >
      {rects(map).map(({ x, y }) => (
        <rect key={`${x}-${y}`} x={x} y={y} width={1.02} height={1.02} />
      ))}
    </svg>
  );
}

const SHACKLE: Map = ["..#####..", ".##...##.", ".#.....#.", ".#.....#.", ".#.....#."];
const BODY: Map = [
  "#########",
  "#########",
  "###...###",
  "###...###",
  "####.####",
  "####.####",
  "#########",
  "#########",
];

/** Pixel padlock; `open` pops the shackle up two cells. */
export function Padlock({ cell = 3, open = false }: { cell?: number; open?: boolean }) {
  return (
    <span aria-hidden className="os-intro-padlock">
      <m.span
        className="os-intro-padlock-shackle"
        initial={{ y: 0 }}
        animate={{ y: open ? -2 * cell : 0 }}
        transition={{ type: "spring", visualDuration: 0.2, bounce: 0.3 }}
      >
        <Pixels map={SHACKLE} cell={cell} />
      </m.span>
      <Pixels map={BODY} cell={cell} className="os-intro-padlock-body" />
    </span>
  );
}

const SUN: Map = ["...#...", ".#...#.", "..###..", "#.###.#", "..###..", ".#...#.", "...#..."];
const MOON: Map = ["..####.", ".###...", "###....", "###....", "###....", ".###...", "..####."];
const HORIZON: Map = [".......", "...#...", ".#...#.", "..###..", ".#####.", "#######", "......."];

/**
 * The sky phase glyph. All three are rendered and CSS picks one from
 * html[data-sky], which a head script sets before first paint, so the
 * server HTML is right from frame one.
 */
export function SkyGlyph({ cell = 3 }: { cell?: number }) {
  return (
    <span aria-hidden className="os-intro-skyglyph">
      <Pixels map={SUN} cell={cell} className="os-intro-sky-day" />
      <Pixels map={MOON} cell={cell} className="os-intro-sky-night" />
      <Pixels map={HORIZON} cell={cell} className="os-intro-sky-edge" />
    </span>
  );
}
