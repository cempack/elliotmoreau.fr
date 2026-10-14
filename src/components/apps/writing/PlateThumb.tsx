"use client";

import { useEffect, useRef } from "react";
import { useSettled, viewTransitionActive } from "@/hooks/useSettled";
import { loadSky, publishedMs } from "./sky";

/** thumbs already painted this visit (the palette rebuilds its rows on every open) */
const painted = new Map<string, ImageData>();
function remember(key: string, img: ImageData) {
  painted.delete(key);
  painted.set(key, img);
  if (painted.size > 24) painted.delete(painted.keys().next().value!);
}

/**
 * A post's dome in miniature: the same one its picture shows (Toulouse at
 * the minute it went out, the same first look), one canvas cell per
 * pixel, painted once the window has settled. It names nothing, so it
 * needs no words (the palette and Now show it outside the Blog). Small
 * ones leave the turntable out, so the glass is bigger.
 */
export function PlateThumb({
  post,
  cols: W = 64,
  rows: H = 44,
  className = "",
}: {
  post: { slug: string; published_at: string };
  cols?: number;
  rows?: number;
  className?: string;
}) {
  const ref = useRef<HTMLCanvasElement>(null);
  const settled = useSettled();
  const ms = publishedMs(post);
  const slug = post.slug;

  useEffect(() => {
    const canvas = ref.current;
    if (!canvas || ms == null) return;
    const key = `${slug}@${ms}:${W}x${H}`;
    if (canvas.dataset.key === key) return;
    const put = (img: ImageData) => {
      canvas.getContext("2d")?.putImageData(img, 0, 0);
      canvas.dataset.key = key;
    };
    const hit = painted.get(key);
    if (hit) {
      put(hit);
      return;
    }
    // (settled is read at render, before a window's transition starts: ask again here)
    if (!settled || viewTransitionActive()) return;
    let live = true;
    loadSky().then(
      (mod) => {
        if (!live) return;
        const dome = new mod.Dome({ table: W >= 60, fill: W >= 60 ? 0.9 : 0.8 });
        dome.size(W, H);
        dome.set(ms, mod.faceOf(slug, ms));
        const img = new ImageData(W, H);
        dome.paint(new Uint32Array(img.data.buffer));
        remember(key, img);
        put(img);
      },
      () => {},
    );
    return () => {
      live = false;
    };
  }, [slug, ms, W, H, settled]);

  return <canvas ref={ref} className={className} width={W} height={H} aria-hidden />;
}
