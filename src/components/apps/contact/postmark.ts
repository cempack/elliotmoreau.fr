import { PIXEL_GLYPHS } from "@/components/PixelLabel";

/**
 * The franking meter's die, as pixel cells: a French machine postmark.
 * On the left the date ring (TOULOUSE over the top arc, the city's
 * latitude under the bottom one, the date over the time in the middle,
 * the same layout as Atlas's postmarks); on the right the flamme, the
 * box French post offices fill with their town's landmark (here the
 * octagonal tower of Saint-Sernin over a line of the Garonne), over five
 * wavy cancellation lines. One ink, with a slight ordered dropout so it
 * reads as ink on paper.
 */

export type Mark = { dd: string; mo: string; hh: string; mi: string; yy: string };

/** Toulouse wall-clock parts of an instant */
export function markAt(d: Date): Mark {
  const p = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Europe/Paris",
    day: "2-digit",
    month: "2-digit",
    year: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(d);
  const get = (t: string) => p.find((x) => x.type === t)?.value ?? "00";
  return { dd: get("day"), mo: get("month"), yy: get("year"), hh: get("hour"), mi: get("minute") };
}

export const RING = 43;
export const DIE_W = 74;
export const DIE_H = 43;

const BAYER = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5];

/** the flamme: Saint-Sernin's five tiered stages and spire, the Garonne under it (26 × 12 inside its frame) */
const FLAMME = [
  "............##............",
  "...........####...........",
  "..........#.##.#..........",
  "..........######..........",
  ".........#.#..#.#.........",
  ".........########.........",
  "........#.#.##.#.#........",
  "........##########........",
  "........#.#.##.#.#........",
  "..######################..",
  "..#.#.#.#.#.##.#.#.#.#.#..",
  ".##..##..##..##..##..##...",
];

/** glyph columns, with punctuation trimmed to its ink */
function glyph(ch: string) {
  const g = PIXEL_GLYPHS[ch];
  if (!g) return null;
  let a = 0;
  let b = 2;
  if (ch === "." || ch === ":" || ch === "'") {
    while (a < 2 && g.every((r) => r[a] === "0")) a++;
    while (b > a && g.every((r) => r[b] === "0")) b--;
  }
  return { g, a, w: b - a + 1 };
}

function textWidth(s: string, tracking = 1) {
  let w = 0;
  for (const ch of s) w += (ch === " " ? 2 : (glyph(ch)?.w ?? 3)) + tracking;
  return w - tracking;
}

/** Paint the die (or just its ring) into a cell grid; 1 is ink. */
export function dieCells(mark: Mark, { flamme = true, lat = "43.60N" }: { flamme?: boolean; lat?: string } = {}) {
  const w = flamme ? DIE_W : RING;
  const h = DIE_H;
  const cells = new Uint8Array(w * h);
  /** 2: lettering, which the ink never drops (it has to stay readable) */
  let ink = 1;
  const set = (x: number, y: number) => {
    if (x >= 0 && y >= 0 && x < w && y < h) cells[y * w + x] = Math.max(cells[y * w + x], ink);
  };
  const text = (s: string, x0: number, y0: number, tracking = 1) => {
    ink = 2;
    let x = x0;
    for (const ch of s) {
      if (ch === " ") {
        x += 2 + tracking;
        continue;
      }
      const gl = glyph(ch);
      if (!gl) {
        x += 3 + tracking;
        continue;
      }
      for (let r = 0; r < 5; r++) for (let c = 0; c < gl.w; c++) if (gl.g[r][gl.a + c] === "1") set(x + c, y0 + r);
      x += gl.w + tracking;
    }
    ink = 1;
  };
  // the ring: two clean one-cell circles, letters upright along both arcs
  const c = (RING - 1) / 2;
  const circle = (r: number) => {
    const n = Math.ceil(r * 8);
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2;
      set(Math.round(c + r * Math.cos(a)), Math.round(c + r * Math.sin(a)));
    }
  };
  circle(20.5);
  circle(11.5);
  // arched lettering: an even pitch across, each letter dropped onto the circle (upright, so none collide)
  const arc = (s: string, top: boolean) => {
    const r = 16;
    const n = s.length;
    [...s].forEach((ch, i) => {
      const dx = (i - (n - 1) / 2) * 4;
      // a slightly flattened arch, so the end letters don't fall away
      const dy = r * Math.sqrt(Math.max(0, 1 - (dx / (r + 2.5)) ** 2));
      text(ch, Math.round(c + dx - 1.5), Math.round((top ? c - dy : c + dy) - 2.5), 0);
    });
  };
  arc("TOULOUSE", true);
  arc(lat, false);
  const date = `${mark.dd}.${mark.mo}`;
  const time = `${mark.hh}:${mark.mi}`;
  text(date, Math.round(c - textWidth(date, 1) / 2 + 0.5), c - 6, 1);
  text(time, Math.round(c - textWidth(time, 1) / 2 + 0.5), c + 2, 1);
  if (flamme) {
    // the flamme's frame and art
    const fx = 46;
    const fy = 3;
    for (let x = 0; x < 28; x++) {
      set(fx + x, fy);
      set(fx + x, fy + 13);
    }
    for (let y = 0; y < 14; y++) {
      set(fx, fy + y);
      set(fx + 27, fy + y);
    }
    FLAMME.forEach((row, y) => [...row].forEach((ch, x) => ch === "#" && set(fx + 1 + x, fy + 1 + y)));
    // five wavy cancellation lines, run out of the ring
    for (let k = 0; k < 5; k++) {
      const y0 = 21 + k * 4;
      for (let x = 44; x < w; x++) {
        const p = (x - 44 + k * 2) % 8;
        if (p <= 3) set(x, y0);
        if (p >= 3 && p <= 7) set(x, y0 + 1);
        if (p === 7) set(x, y0);
      }
    }
  }
  // the ink runs a little thin in places
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) {
      const i = y * w + x;
      if (cells[i] === 1 && BAYER[((y & 3) << 2) | (x & 3)] === 0 && (x * 7 + y * 3) % 3 === 0) cells[i] = 0;
      else if (cells[i]) cells[i] = 1;
    }
  return { w, h, cells };
}

/** The cells as one SVG path (runs merged per row). */
export function diePath(grid: { w: number; h: number; cells: Uint8Array }) {
  let d = "";
  for (let y = 0; y < grid.h; y++) {
    let x = 0;
    while (x < grid.w) {
      if (!grid.cells[y * grid.w + x]) {
        x++;
        continue;
      }
      const x0 = x;
      while (x < grid.w && grid.cells[y * grid.w + x]) x++;
      d += `M${x0} ${y}h${x - x0}v1h${x0 - x}z`;
    }
  }
  return d;
}
