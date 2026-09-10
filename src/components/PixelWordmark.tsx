import {
  GLYPH_H,
  WORDMARK_LINES,
  bandIndexFor,
  bandInk,
  rasterizePixelLine,
} from "@/lib/pixelword";

/**
 * The wordmark as static pixel blocks in the same band gradient the canvas
 * engine wears, rendered as SSR SVG — so the very first paint already shows
 * the finished word and there is never a flash of fallback text. The live
 * canvas fades in over it. Stays put under reduced motion and no-JS.
 *
 * Wears the same voxel relief as the canvas: a dark solid receding
 * up-back plus a lit top face on skyline edges (flat when a custom ink
 * is set).
 */

// the engine's line gap is ~1 native row at common scales; the static
// lockup breathes a little wider so it stands alone well
const GAP_ROWS = 2;
const SPAN_ROWS = 2 * GLYPH_H + 1;
const PITCH_ROWS = GLYPH_H + 1;

// voxel relief tones, shared with the canvas engine's FIELD table
const SOLID_FAR = "#1E2326";
const SOLID_NEAR = "#333F45";
const TOP_FACE = "#EDEAD8";

type Rect = { x: number; y: number; fill: string };

export function PixelWordmark({ className = "", ink }: { className?: string; ink?: string }) {
  const lines = WORDMARK_LINES.map((l) => rasterizePixelLine(l));
  const width = Math.max(...lines.map((l) => l.cols));
  const height = 2 * GLYPH_H + GAP_ROWS;
  // exterior air over the combined canvas: flood fill from the borders so
  // the relief only builds against open sky, never inside counters
  const occ = new Uint8Array(width * height);
  const offs = lines.map((line) => ({
    ox: Math.round((width - line.cols) / 2),
    oy: 0,
  }));
  lines.forEach((line, li) => {
    const oy = li * (GLYPH_H + GAP_ROWS);
    offs[li].oy = oy;
    for (let r = 0; r < GLYPH_H; r++) {
      for (let c = 0; c < line.cols; c++) {
        if (line.grid[r * line.cols + c] === 1) occ[(oy + r) * width + (offs[li].ox + c)] = 1;
      }
    }
  });
  const sky = new Uint8Array(width * height);
  {
    const stack: number[] = [];
    for (let c = 0; c < width; c++) stack.push(c, (height - 1) * width + c);
    for (let r = 0; r < height; r++) stack.push(r * width, r * width + width - 1);
    while (stack.length > 0) {
      const i = stack.pop() as number;
      if (i < 0 || i >= width * height || sky[i] || occ[i]) continue;
      sky[i] = 1;
      const cc = i % width;
      const rr = (i / width) | 0;
      if (cc > 0) stack.push(i - 1);
      if (cc < width - 1) stack.push(i + 1);
      if (rr > 0) stack.push(i - width);
      if (rr < height - 1) stack.push(i + width);
    }
  }
  const isSky = (x: number, y: number) =>
    x < 0 || x >= width || y < 0 || y >= height || sky[y * width + x] === 1;
  const solidsFar: Rect[] = [];
  const solidsNear: Rect[] = [];
  const lips: Rect[] = [];
  const faces: Rect[] = [];
  lines.forEach((line, li) => {
    const ox = Math.round((width - line.cols) / 2);
    const oy = li * (GLYPH_H + GAP_ROWS);
    const isInk = (c: number, r: number) =>
      r >= 0 && r < GLYPH_H && c >= 0 && c < line.cols && line.grid[r * line.cols + c] === 1;
    for (let r = 0; r < GLYPH_H; r++) {
      const fill = ink ?? bandInk(bandIndexFor((li * PITCH_ROWS + r) / (SPAN_ROWS - 1)));
      for (let c = 0; c < line.cols; c++) {
        if (!isInk(c, r)) continue;
        faces.push({ x: ox + c, y: oy + r, fill });
        if (!ink) {
          const gx = ox + c;
          const gy = oy + r;
          if (isSky(gx + 2, gy - 2)) solidsFar.push({ x: gx + 1.6, y: gy - 2, fill: SOLID_FAR });
          if (isSky(gx + 1, gy - 1)) solidsNear.push({ x: gx + 0.8, y: gy - 1, fill: SOLID_NEAR });
          // top-face light hugs the face's own top edge: inner edges read
          // as bevels, never floating bars
          if (isSky(gx, gy - 1)) lips.push({ x: gx, y: gy, fill: TOP_FACE });
        }
      }
    }
  });
  // far solid reaches 2 units up and ~2.6 right of the ink
  const pad = ink ? 1 : 3;
  return (
    <svg
      viewBox={`-${pad} -${pad} ${width + pad * 2} ${height + pad * 2}`}
      preserveAspectRatio="xMidYMid meet"
      shapeRendering="crispEdges"
      role="img"
      aria-label="Elliot Moreau"
      className={className}
    >
      {solidsFar.map((rc, k) => (
        <rect key={`f${k}`} x={rc.x} y={rc.y} width={1.02} height={1.02} fill={rc.fill} />
      ))}
      {solidsNear.map((rc, k) => (
        <rect key={`n${k}`} x={rc.x} y={rc.y} width={1.02} height={1.02} fill={rc.fill} />
      ))}
      {faces.map((rc, k) => (
        <rect key={k} x={rc.x} y={rc.y} width={1.02} height={1.02} fill={rc.fill} />
      ))}
      {lips.map((rc, k) => (
        <rect key={`l${k}`} x={rc.x} y={rc.y} width={1.02} height={0.5} fill={rc.fill} opacity={0.85} />
      ))}
    </svg>
  );
}
