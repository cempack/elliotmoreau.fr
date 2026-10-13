"use client";

import { pxPath } from "@/lib/pxpath";

/** 7x7 pixel icon cells, drawn cell by cell like the home link cards. */
export type Cells = [number, number][];

export function PixelGlyph({
  cells,
  className = "",
  size = 21,
}: {
  cells: Cells;
  className?: string;
  size?: number;
}) {
  return (
    <svg
      viewBox="0 0 7 7"
      width={size}
      height={size}
      shapeRendering="crispEdges"
      fill="currentColor"
      className={className}
      aria-hidden
    >
      <path d={pxPath(cells.map(([x, y]) => ({ x, y })), 0.02)} />
    </svg>
  );
}

