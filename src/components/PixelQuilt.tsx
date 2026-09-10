/**
 * PixelQuilt: a deterministic pixel identicon from any seed string — 5x7
 * mirrored blocks in Everforest inks, the same 7px rhythm as the site's
 * glyphs. Gives every repo a visual identity even when it has no
 * screenshot. Pure function of the seed: SSR and client agree.
 */

const INKS = ["#A7C080", "#83C092", "#D3C6AA", "#7A8478"];

function hash01(seed: string): number {
  let h = 2166136261;
  for (let i = 0; i < seed.length; i++) {
    h ^= seed.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  // splitmix32 finalizer: full avalanche, so neighboring cells decorrelate
  // (raw FNV clusters on similar inputs and paints stripes instead)
  h ^= h >>> 15;
  h = Math.imul(h, 0x85ebca6b);
  h ^= h >>> 13;
  h = Math.imul(h, 0xc2b2ae35);
  h ^= h >>> 16;
  return (h >>> 0) / 4294967296;
}

export function PixelQuilt({ seed, className = "" }: { seed: string; className?: string }) {
  const rects: { x: number; y: number; fill: string }[] = [];
  for (let r = 0; r < 7; r++) {
    for (let c = 0; c < 3; c++) {
      const v = hash01(`${seed}:${r}:${c}`);
      if (v < 0.42) continue;
      const ink = INKS[Math.floor(v * 997) % INKS.length];
      rects.push({ x: c, y: r, fill: ink });
      if (c < 2) rects.push({ x: 4 - c, y: r, fill: ink });
    }
  }
  return (
    <svg
      viewBox="0 0 5 7"
      preserveAspectRatio="xMidYMid meet"
      shapeRendering="crispEdges"
      aria-hidden
      className={className}
    >
      {rects.map((rc, k) => (
        <rect key={k} x={rc.x} y={rc.y} width={1.02} height={1.02} fill={rc.fill} />
      ))}
    </svg>
  );
}
