/** Pixel runs as one SVG path per fill instead of one <rect> per run. */
export type PxRun = { x: number; y: number; w?: number; h?: number };
export function pxPath(runs: readonly PxRun[], pad = 0): string {
  let d = "";
  for (const r of runs) {
    const w = (r.w ?? 1) + pad;
    const h = (r.h ?? 1) + pad;
    d += `M${r.x} ${r.y}h${w}v${h}h${-w}z`;
  }
  return d;
}
export function byFill<T>(runs: readonly T[], key: (r: T) => string): Map<string, T[]> {
  const m = new Map<string, T[]>();
  for (const r of runs) {
    const k = key(r);
    let a = m.get(k);
    if (!a) m.set(k, (a = []));
    a.push(r);
  }
  return m;
}

/**
 * Single cells ({x, y} on an integer grid) as one path per fill, with
 * neighbouring same-colour cells on a row merged into one run.
 */
export function cellPaths<T extends { x: number; y: number }>(cells: readonly T[], fill: (c: T) => string, pad = 0) {
  const out: { fill: string; d: string }[] = [];
  for (const [f, group] of byFill(cells, fill)) {
    const sorted = [...group].sort((a, b) => a.y - b.y || a.x - b.x);
    const runs: PxRun[] = [];
    for (const c of sorted) {
      const last = runs[runs.length - 1];
      if (last && last.y === c.y && last.x + (last.w ?? 1) === c.x) last.w = (last.w ?? 1) + 1;
      else runs.push({ x: c.x, y: c.y, w: 1 });
    }
    out.push({ fill: f, d: pxPath(runs, pad) });
  }
  return out;
}
