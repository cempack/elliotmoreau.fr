/**
 * Paints the wallpaper off the main thread. Receives { id, opts }, answers
 * { id, pixels, life } with the RGBA buffer transferred (zero copy), so a
 * cold first paint never competes with hydration or input.
 */
import { paintPixels, type PaintOpts } from "./paint";

type Scope = {
  onmessage: ((e: MessageEvent<{ id: number; opts: PaintOpts }>) => void) | null;
  postMessage: (message: unknown, transfer: Transferable[]) => void;
};
const scope = self as unknown as Scope;

scope.onmessage = (e) => {
  const { id, opts } = e.data;
  const { pixels, life } = paintPixels(opts);
  scope.postMessage({ id, pixels, life }, [pixels.buffer]);
};
