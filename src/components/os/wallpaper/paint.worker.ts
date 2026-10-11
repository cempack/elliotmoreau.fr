/**
 * Builds the city off the main thread. Receives { id, W, H }, answers
 * { id, city } with its buffers transferred (zero copy), so a cold first
 * build never competes with hydration or input. Lighting it happens on
 * the main thread (./light), a few milliseconds per frame.
 */
import { buildCity, type City } from "./city";

type Scope = {
  onmessage: ((e: MessageEvent<{ id: number; W: number; H: number }>) => void) | null;
  postMessage: (message: { id: number; city: City }, transfer: Transferable[]) => void;
};
const scope = self as unknown as Scope;

scope.onmessage = (e) => {
  const { id, W, H } = e.data;
  const city = buildCity(W, H);
  scope.postMessage({ id, city }, [city.idx.buffer, city.vig.buffer, city.yw.buffer, city.codes.buffer]);
};
