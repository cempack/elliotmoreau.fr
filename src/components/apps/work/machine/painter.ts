import type { ProjectKind } from "../kind";
import { MODELS } from "./models";
import { bayer8, paint, type Tex, type View } from "./render";

/** A frame, as the page asks for it: the view (its model by kind), and whether a sharp screenshot goes under the screen. */
export type Ask = Omit<View, "model" | "screen" | "marquee"> & { kind: ProjectKind; w: number; h: number; sharp: boolean };

/** what the page tells a worker painting for it (./paint.worker), and what comes back: each frame, and screenshots scaled to size */
export type ToPainter =
  | { type: "textures"; screen: Tex | null; marquee: Tex | null }
  | { type: "dissolve"; at: number }
  | { type: "frame"; id: number; ask: Ask; buf: ArrayBuffer }
  | { type: "picture"; id: number; url: string; w: number; h: number };
export type FromPainter = { type: "frame"; id: number; buf: ArrayBuffer; pictured: number } | { type: "picture"; id: number; pic: ImageBitmap | null };

/** how long one machine takes to dissolve into the next, in seconds */
export const DISSOLVE = 0.5;

/**
 * The machine's frames, kept apart from the page so a worker can paint
 * them (./paint.worker), or the page itself where workers can't run: the
 * screen's and marquee's textures as they change, then each frame painted
 * (see `paint`), dissolving in Bayer order from the last machine for a
 * moment after it changes.
 */
export function painter() {
  let w = 0, h = 0;
  let out = new Uint32Array(0), under = new Uint32Array(0);
  /** the last frame had a sharp screenshot under it: its picture's cells are in `under` */
  let layered = false;
  let screen: Tex | null = null, marquee: Tex | null = null;
  let fade: { from: Uint32Array; at: number } | null = null;
  return {
    textures(next: { screen: Tex | null; marquee: Tex | null }) {
      screen = next.screen;
      marquee = next.marquee;
    },
    /** dissolve from the frame last painted, starting at `at` (the view's clock) */
    dissolve(at: number) {
      if (!out.length) return;
      const from = out.slice();
      if (layered) for (let i = 0; i < from.length; i++) if (under[i]) from[i] = under[i];
      fade = { from, at };
    },
    /** paints the frame into `into` (w×h cells); returns how many cells show the screen's picture */
    frame(ask: Ask, into: Uint32Array) {
      if (ask.w !== w || ask.h !== h) {
        w = ask.w; h = ask.h;
        out = new Uint32Array(w * h);
        under = new Uint32Array(w * h);
        fade = null;
      }
      const view: View = { ...ask, model: MODELS[ask.kind], screen, marquee };
      layered = ask.sharp;
      const pictured = paint(out, w, h, view, layered ? under : undefined);
      if (fade) {
        const k = (ask.t - fade.at) / DISSOLVE;
        if (k >= 1) fade = null;
        else {
          const m = k * k * (3 - 2 * k), from = fade.from;
          for (let y = 0; y < h; y++)
            for (let x = 0; x < w; x++)
              if (bayer8(x, y) >= m) {
                const i = y * w + x;
                out[i] = from[i];
                under[i] = 0;
              }
        }
      }
      into.set(out);
      return pictured;
    },
  };
}
