import { bandIndexFor, bandInk, rasterizePixelLine } from "@/lib/pixelword";

/**
 * The emos logo, the way fastfetch prints a distro's: the boot wordmark's
 * own glyphs, "em" over "os", in its band inks from the paper crest down
 * to the indigo foot.
 */
const LOGO = (() => {
  const lines = ["em", "os"].map((t) => {
    const l = rasterizePixelLine(t);
    // x-height glyphs: drop the empty rows above them
    let top = 0;
    while (top < l.rows && !l.grid.slice(top * l.cols, (top + 1) * l.cols).some(Boolean)) top++;
    return { ...l, top };
  });
  const cols = Math.max(...lines.map((l) => l.cols));
  const cells: { x: number; y: number }[] = [];
  let y0 = 0;
  for (const l of lines) {
    const dx = Math.floor((cols - l.cols) / 2);
    for (let y = l.top; y < l.rows; y++) {
      for (let x = 0; x < l.cols; x++) if (l.grid[y * l.cols + x]) cells.push({ x: x + dx, y: y0 + y - l.top });
    }
    y0 += l.rows - l.top + 2;
  }
  const rows = y0 - 2;
  return { cols, rows, cells: cells.map((c) => ({ ...c, ink: bandInk(bandIndexFor(c.y / (rows - 1))) })) };
})();

export function EmosLogo({ className = "" }: { className?: string }) {
  return (
    <svg className={className} viewBox={`-0.5 -0.5 ${LOGO.cols + 1} ${LOGO.rows + 1}`} shapeRendering="crispEdges" aria-hidden>
      {LOGO.cells.map((c) => (
        <rect key={`${c.x}-${c.y}`} x={c.x + 0.07} y={c.y + 0.07} width={0.86} height={0.86} fill={c.ink} />
      ))}
    </svg>
  );
}

