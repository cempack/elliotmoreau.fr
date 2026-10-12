import { byFill, pxPath, type PxRun } from "@/lib/pxpath";
import { PixelGlyph, type Cells } from "@/components/glyphs";
import type { ProjectKind } from "./kind";

/**
 * The pictures for projects without a screenshot: one small pixel scene per
 * shelf (a web page, a platformer, a desktop with its top bar, a terminal
 * finishing a job, a flask), varied a little by the project's name so two
 * tools never look identical. Plus a 7×7 icon of each for the list.
 */

export const KIND_ACCENT: Record<ProjectKind, string> = {
  app: "var(--color-ion)",
  game: "var(--color-ember)",
  desktop: "var(--color-signal)",
  tool: "var(--color-lilac)",
  lab: "var(--color-yellow)",
};

const BG = "var(--color-ink-900)";
const DEEP = "var(--color-ink-950)";
const NIGHT = "var(--color-ink-800)";
const FRAME = "var(--color-ink-700)";
const BEZEL = "var(--color-ink-600)";
const LINE = "var(--color-ink-500)";
const TEXT = "var(--color-label-3)";
const PAPER = "var(--color-label)";

type Px = PxRun & { f: string; o?: number };

/** seeded 0..1 generator: the same name always draws the same scene */
function rng(seed: string) {
  let a = 2166136261;
  for (let i = 0; i < seed.length; i++) a = Math.imul(a ^ seed.charCodeAt(i), 16777619);
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const W = 48;
const H = 30;

function app(r: () => number, a: string): Px[] {
  const n = (lo: number, hi: number) => lo + Math.floor(r() * (hi - lo + 1));
  return [
    { x: 0, y: 0, w: W, h: H, f: BG },
    { x: 1, y: 1, w: 46, h: 28, f: FRAME },
    { x: 2, y: 5, w: 44, h: 23, f: DEEP },
    // window buttons and the address bar
    { x: 3, y: 2, w: 2, h: 2, f: LINE },
    { x: 6, y: 2, w: 2, h: 2, f: LINE },
    { x: 9, y: 2, w: 2, h: 2, f: LINE },
    { x: 14, y: 2, w: 22, h: 2, f: BG },
    { x: 15, y: 2, w: 1, h: 2, f: a, o: 0.8 },
    // the page: a title, a nav, two lines, buttons, a picture
    { x: 5, y: 7, w: 6, f: PAPER, o: 0.85 },
    { x: 31, y: 7, w: 3, f: TEXT },
    { x: 36, y: 7, w: 3, f: TEXT },
    { x: 41, y: 7, w: 2, f: TEXT },
    { x: 5, y: 11, w: n(16, 21), h: 2, f: PAPER },
    { x: 5, y: 15, w: n(18, 22), f: TEXT },
    { x: 5, y: 17, w: n(12, 17), f: TEXT },
    { x: 5, y: 21, w: 8, h: 2, f: a },
    { x: 15, y: 21, w: 7, h: 2, f: FRAME },
    { x: 29, y: 10, w: 14, h: 14, f: NIGHT },
    { x: 38, y: 12, w: 2, h: 2, f: PAPER, o: 0.7 },
    ...[0, 1, 2, 3, 4, 5].map((i) => ({ x: 34 - i, y: 18 + i, w: 2 + 2 * i, f: a, o: 0.55 })),
    ...[0, 1, 2, 3].map((i) => ({ x: 38 - i, y: 20 + i, w: 2 + 2 * i, f: a })),
  ];
}

function game(r: () => number, a: string): Px[] {
  const out: Px[] = [{ x: 0, y: 0, w: W, h: H, f: BG }];
  for (let i = 0; i < 9; i++) out.push({ x: Math.floor(r() * 30), y: 1 + Math.floor(r() * 10), f: TEXT, o: 0.5 });
  // the ground, grass on top
  out.push({ x: 0, y: 25, w: W, h: 5, f: FRAME }, { x: 0, y: 25, w: W, f: "var(--color-signal)" });
  for (let x = 1; x < W; x += 4) out.push({ x: x + Math.floor(r() * 2), y: 27 + Math.floor(r() * 2), f: BEZEL });
  // two platforms, coins over the higher one
  for (const [x, y, w] of [
    [4, 20, 9],
    [16, 15, 9],
  ]) {
    out.push({ x, y, w, f: "var(--color-signal)" }, { x, y: y + 1, w, f: BEZEL });
  }
  for (let c = 17; c < 24; c += 2) out.push({ x: c, y: 12, f: "var(--color-yellow)" });
  // the hero, on the first platform, mid-jump towards them
  out.push(
    { x: 7, y: 14, w: 3, h: 2, f: PAPER },
    { x: 8, y: 14, f: DEEP },
    { x: 7, y: 16, w: 3, h: 2, f: "var(--color-ion)" },
    { x: 7, y: 18, f: DEEP },
    { x: 9, y: 18, f: DEEP }
  );
  // the dragon, facing it, breathing a little fire
  out.push(
    { x: 42, y: 6, f: "var(--color-flare)", o: 0.85 },
    { x: 41, y: 7, w: 3, f: "var(--color-flare)", o: 0.85 },
    { x: 40, y: 8, w: 5, f: "var(--color-flare)", o: 0.85 },
    { x: 39, y: 9, w: 6, f: "var(--color-flare)", o: 0.85 },
    { x: 34, y: 9, w: 4, h: 2, f: a },
    { x: 33, y: 10, w: 2, f: a },
    { x: 35, y: 9, f: "var(--color-yellow)" },
    { x: 37, y: 10, w: 2, h: 2, f: a },
    { x: 38, y: 11, w: 6, h: 3, f: a },
    { x: 39, y: 13, w: 4, f: "var(--color-yellow)", o: 0.55 },
    { x: 44, y: 12, w: 2, f: a },
    { x: 46, y: 11, f: a },
    { x: 39, y: 14, f: a },
    { x: 42, y: 14, f: a },
    { x: 29, y: 10, w: 3, f: "var(--color-yellow)" },
    { x: 26, y: 10, w: 2, f: a, o: 0.6 }
  );
  return out;
}

function desktop(r: () => number, a: string): Px[] {
  const out: Px[] = [
    { x: 0, y: 0, w: W, h: H, f: BG },
    { x: 5, y: 1, w: 38, h: 23, f: BEZEL },
    { x: 6, y: 2, w: 36, h: 21, f: NIGHT },
    { x: 33, y: 7, w: 2, h: 2, f: PAPER, o: 0.75 },
  ];
  // the wallpaper: two ranges of hills
  const ph = r() * 6;
  for (let x = 6; x < 42; x++) {
    const back = 14 + Math.round(2 * Math.sin(x * 0.22 + ph));
    const front = 18 + Math.round(1.5 * Math.sin(x * 0.37 + ph * 2));
    out.push({ x, y: back, h: 23 - back, f: "var(--color-signal-deep)" }, { x, y: front, h: 23 - front, f: FRAME });
  }
  // the top bar: workspaces, the clock, the add-on lit, its menu open
  out.push(
    { x: 6, y: 2, w: 36, h: 3, f: DEEP },
    { x: 8, y: 3, f: a },
    { x: 10, y: 3, f: TEXT },
    { x: 12, y: 3, f: TEXT },
    { x: 21, y: 3, w: 6, f: TEXT },
    { x: 33, y: 3, f: TEXT },
    { x: 35, y: 3, f: TEXT },
    { x: 37, y: 3, w: 2, f: a },
    { x: 28, y: 6, w: 13, h: 8, f: FRAME },
    { x: 30, y: 8, w: 7 + Math.floor(r() * 3), f: PAPER, o: 0.85 },
    { x: 30, y: 10, w: 5 + Math.floor(r() * 3), f: TEXT },
    { x: 30, y: 12, w: 4, f: a },
    // the stand
    { x: 21, y: 24, w: 6, h: 2, f: BEZEL },
    { x: 17, y: 26, w: 14, f: BEZEL }
  );
  return out;
}

function tool(r: () => number, a: string): Px[] {
  const n = (lo: number, hi: number) => lo + Math.floor(r() * (hi - lo + 1));
  const done = n(12, 22);
  return [
    { x: 0, y: 0, w: W, h: H, f: BG },
    { x: 2, y: 2, w: 44, h: 26, f: FRAME },
    { x: 3, y: 5, w: 42, h: 22, f: DEEP },
    { x: 4, y: 3, f: LINE },
    { x: 6, y: 3, f: LINE },
    { x: 8, y: 3, f: LINE },
    { x: 19, y: 3, w: 10, f: TEXT },
    // a command, its output, a bar filling up, done
    { x: 5, y: 7, f: a },
    { x: 7, y: 7, w: n(10, 16), f: PAPER },
    { x: 5, y: 9, w: n(18, 26), f: TEXT },
    { x: 5, y: 11, w: n(14, 22), f: TEXT },
    { x: 5, y: 13, f: TEXT },
    { x: 6, y: 13, w: done, f: a },
    { x: 6 + done, y: 13, w: 24 - done, f: LINE },
    { x: 30, y: 13, f: TEXT },
    { x: 5, y: 15, w: n(10, 18), f: TEXT },
    { x: 5, y: 18, f: "var(--color-signal)" },
    { x: 7, y: 18, w: n(12, 18), f: PAPER, o: 0.85 },
    { x: 5, y: 21, f: a },
    { x: 7, y: 21, w: 2, f: PAPER },
  ];
}

function lab(r: () => number, a: string): Px[] {
  const out: Px[] = [{ x: 0, y: 0, w: W, h: H, f: BG }];
  const c = 24;
  out.push({ x: c - 4, y: 3, w: 8, f: LINE }, { x: c - 3, y: 4, h: 8, f: LINE }, { x: c + 2, y: 4, h: 8, f: LINE });
  for (let i = 0; i < 14; i++) {
    const y = 12 + i;
    const w = 3 + Math.round((i * 9) / 13);
    out.push({ x: c - w, y, f: LINE }, { x: c + w - 1, y, f: LINE });
    if (y >= 17) out.push({ x: c - w + 1, y, w: 2 * w - 2, f: a, o: y === 17 ? 0.55 : 0.85 });
  }
  out.push({ x: c - 12, y: 26, w: 24, f: LINE });
  // bubbles rising, a few sparks around
  out.push(
    { x: c - 2, y: 15, f: a, o: 0.8 },
    { x: c + 1, y: 13, f: a, o: 0.6 },
    { x: c - 1, y: 9, f: a, o: 0.45 },
    { x: c - 5, y: 21, f: PAPER, o: 0.55 },
    { x: c + 4, y: 23, f: PAPER, o: 0.55 }
  );
  for (let i = 0; i < 4; i++) {
    const x = i % 2 ? 34 + Math.floor(r() * 8) : 6 + Math.floor(r() * 8);
    const y = 5 + Math.floor(r() * 16);
    out.push({ x, y: y - 1, f: TEXT, o: 0.6 }, { x: x - 1, y, w: 3, f: TEXT, o: 0.6 }, { x, y: y + 1, f: TEXT, o: 0.6 });
  }
  return out;
}

const SCENES: Record<ProjectKind, (r: () => number, a: string) => Px[]> = { app, game, desktop, tool, lab };

/** A project's scene, 48×30 art pixels (16:10). Sized by className. */
export function KindScene({ kind, seed, className = "" }: { kind: ProjectKind; seed: string; className?: string }) {
  const px = SCENES[kind](rng(seed), KIND_ACCENT[kind]);
  const groups = byFill(px, (p) => `${p.f}|${p.o ?? 1}`);
  return (
    <svg viewBox={`0 0 ${W} ${H}`} shapeRendering="crispEdges" aria-hidden focusable="false" className={className}>
      {[...groups].map(([key, runs]) => {
        const [fill, o] = key.split("|");
        return <path key={key} d={pxPath(runs)} fill={fill} opacity={o === "1" ? undefined : o} />;
      })}
    </svg>
  );
}

function cells(rows: string[]): Cells {
  const out: Cells = [];
  rows.forEach((row, y) => {
    for (let x = 0; x < row.length; x++) if (row[x] === "#") out.push([x, y]);
  });
  return out;
}

const ICONS: Record<ProjectKind, Cells> = {
  app: cells(["#######", "#######", "#.....#", "#.###.#", "#.....#", "#.##..#", "#######"]),
  game: cells([".......", ".#####.", "##.##.#", "#...###", "##.#.##", "##...##", "......."]),
  desktop: cells(["#######", "#.....#", "#...#.#", "#.###.#", "#######", "...#...", "..###.."]),
  tool: cells(["#######", "#.....#", "#.#...#", "#..#..#", "#.#.#.#", "#.....#", "#######"]),
  lab: cells(["..###..", "..#.#..", "..#.#..", ".#...#.", "#..#..#", "#######", ".#####."]),
};

/** The shelf's icon on a tile in its colour, for list rows. */
export function KindIcon({ kind, className = "" }: { kind: ProjectKind; className?: string }) {
  return (
    <span className={`app-work-icon ${className}`} data-kind={kind} aria-hidden>
      <PixelGlyph cells={ICONS[kind]} size={14} />
    </span>
  );
}
