/**
 * The Blog's skies, loaded on first use: the renderer and its star
 * catalogue (about 45 KB compressed) stay out of the pages that never show
 * a post. `skyModule()` is the module once it has arrived, so a picture
 * painted before can come back without waiting.
 */

export type SkyModule = typeof import("./render");
export type { Dome, Exposure, Sky } from "./render";

let ready: SkyModule | null = null;
let pending: Promise<SkyModule> | null = null;

export function loadSky(): Promise<SkyModule> {
  pending ??= import("./render").then(
    (m) => (ready = m),
    (err) => {
      // a failed chunk can be asked for again
      pending = null;
      throw err;
    },
  );
  return pending;
}

export const skyModule = () => ready;

/** a post's moment, or null when its date doesn't parse */
export function publishedMs(p: { published_at: string }) {
  const t = Date.parse(p.published_at);
  return Number.isFinite(t) ? t : null;
}
