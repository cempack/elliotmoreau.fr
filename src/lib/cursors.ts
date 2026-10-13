import type { ThemeTokens } from "./theme";

/**
 * emOS's pointer: pixel-art cursors drawn from the live theme, a warm
 * label-white body, a sage shade on its lower edge and an ink outline, a
 * pixel and a half to the sprite pixel: the size of the system's own
 * arrow, three device pixels a sprite pixel on a 2× screen. themeCss() puts them
 * in custom properties (--cursor-default, --cursor-pointer, --cursor-text,
 * --cursor-grab, --cursor-grabbing, --cursor-crosshair); every `cursor:`
 * in the CSS reads one, with the system cursor as its fallback. The
 * system's own come back in forced colours, and for anyone who asks for
 * them (html[data-cursor="system"], lib/cursorPref).
 *
 * Sprites: X outline, W body, S shade, . clear. Hotspots in sprite pixels.
 */

type Sprite = { rows: string[]; hot: [number, number]; fallback: string };

const SPRITES: Record<"default" | "pointer" | "text" | "grab" | "grabbing" | "crosshair", Sprite> = {
  default: {
    hot: [1, 1],
    fallback: "default",
    rows: [
      "X.........",
      "XX........",
      "XWX.......",
      "XWWX......",
      "XWWWX.....",
      "XWWWWX....",
      "XWWWWWX...",
      "XWWWWWWX..",
      "XWWWWWSSX.",
      "XWWWWXXXXX",
      "XWWXWSX...",
      "XWX.XWSX..",
      "XX..XWSX..",
      "X....XWSX.",
      ".....XWSX.",
      "......XX..",
    ],
  },
  pointer: {
    hot: [4, 1],
    fallback: "pointer",
    rows: [
      "...XX.....",
      "..XWWX....",
      "..XWWX....",
      "..XWWXXX..",
      "..XWWWWWXX",
      "XXXWWWWWWX",
      "XWXWWWWWWX",
      "XWWWWWWWSX",
      ".XWWWWWWSX",
      "..XWWWWSX.",
      "...XSSSSX.",
      "...XXXXXX.",
    ],
  },
  text: {
    hot: [3, 6],
    fallback: "text",
    rows: [
      "XXX.XXX",
      "XWWXWWX",
      "XXXWXXX",
      "..XWX..",
      "..XWX..",
      "..XWX..",
      "..XWX..",
      "..XWX..",
      "..XWX..",
      "XXXWXXX",
      "XWWXWWX",
      "XXX.XXX",
    ],
  },
  grab: {
    hot: [5, 5],
    fallback: "grab",
    rows: [
      "...XX.XX...",
      "..XWWXWWXX.",
      "..XWWXWWXWX",
      ".XXWWXWWXWX",
      "XWXWWWWWWWX",
      "XWWWWWWWWWX",
      "XWWWWWWWWSX",
      ".XWWWWWWWSX",
      "..XWWWWWSX.",
      "...XSSSSSX.",
      "...XXXXXXX.",
    ],
  },
  grabbing: {
    hot: [5, 5],
    fallback: "grabbing",
    rows: [
      "...........",
      "...XXXXXX..",
      "..XWSWSWSX.",
      ".XXWWWWWWXX",
      "XWXWWWWWWWX",
      "XWWWWWWWWWX",
      "XWWWWWWWWSX",
      ".XWWWWWWWSX",
      "..XWWWWWSX.",
      "...XSSSSSX.",
      "...XXXXXXX.",
    ],
  },
  crosshair: {
    hot: [4, 4],
    fallback: "crosshair",
    rows: [
      "...XXX...",
      "...XWX...",
      "...XWX...",
      "XXXX.XXXX",
      "XWW...WWX",
      "XXXX.XXXX",
      "...XWX...",
      "...XWX...",
      "...XXX...",
    ],
  },
};

/** CSS pixels per sprite pixel */
const SCALE = 1.5;

/** one sprite as an SVG: each run of a colour along a row is one rect */
function svg(s: Sprite, ink: Record<string, string>) {
  // even sides, so the image is a whole number of CSS pixels
  const even = (n: number) => n + (n % 2);
  const w = even(Math.max(...s.rows.map((r) => r.length)));
  const h = even(s.rows.length);
  let rects = "";
  s.rows.forEach((row, y) => {
    for (let x = 0; x < row.length; ) {
      const c = row[x];
      let end = x + 1;
      while (end < row.length && row[end] === c) end++;
      if (c !== ".") rects += `<rect x="${x}" y="${y}" width="${end - x}" height="1" fill="${ink[c]}"/>`;
      x = end;
    }
  });
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${w * SCALE}" height="${h * SCALE}" viewBox="0 0 ${w} ${h}" shape-rendering="crispEdges">${rects}</svg>`;
}

const dataUri = (markup: string) => `url("data:image/svg+xml,${encodeURIComponent(markup).replace(/'/g, "%27")}")`;

/** the cursor custom properties for a theme, plus the system's own in forced colours */
export function cursorCss(t: Pick<ThemeTokens, "label" | "label2" | "ink950">) {
  const ink = { X: t.ink950, W: t.label, S: t.label2 };
  const vars = Object.entries(SPRITES).map(([name, s]) => {
    const [hx, hy] = s.hot;
    return `--cursor-${name}:${dataUri(svg(s, ink))} ${Math.round(hx * SCALE)} ${Math.round(hy * SCALE)},${s.fallback}`;
  });
  const plain = Object.entries(SPRITES).map(([name, s]) => `--cursor-${name}:${s.fallback}`);
  return `:root{${vars.join(";")}}@media (forced-colors:active){:root{${plain.join(";")}}}:root[data-cursor="system"]{${plain.join(";")}}`;
}

/** the sprites as SVG markup, for previews */
export function cursorSvgs(t: Pick<ThemeTokens, "label" | "label2" | "ink950">) {
  const ink = { X: t.ink950, W: t.label, S: t.label2 };
  return Object.fromEntries(Object.entries(SPRITES).map(([n, s]) => [n, svg(s, ink)]));
}
