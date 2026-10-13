import "server-only";
import { LOCALES } from "@/i18n/config";

/**
 * Render every page ahead of its visitors. Marking the pages stale (at
 * boot, after an edit in the admin panel, after a theme push) makes each
 * one's next visit wait for its render, one to two seconds when GitHub,
 * Spotify and Ghost have to be asked again. So the server makes those
 * visits itself, in the background, right after: the Desktop, every app,
 * the admin panel and the newest posts, in both languages. A page load and
 * the prefetches behind it then find everything rendered.
 *
 * Asked again while a pass runs, it runs once more after it (an edit
 * landing mid-pass is picked up). Production only: development renders
 * every request anyway.
 */

const ROUTES = ["", "/work", "/blog", "/atlas", "/now", "/contact", "/admin"];
/** the posts the Blog shows first, the ones a visitor opens */
const POSTS = 6;
/** two at a time, so a visitor arriving meanwhile isn't kept waiting behind a queue */
const LANES = 2;

let timer: ReturnType<typeof setTimeout> | null = null;
let running = false;
let again = false;

export function warmPages(delay = 400) {
  if (process.env.NODE_ENV !== "production") return;
  if (running) {
    again = true;
    return;
  }
  // a burst of edits makes one pass
  if (timer) clearTimeout(timer);
  timer = setTimeout(() => {
    timer = null;
    void pass();
  }, delay);
  timer.unref?.();
}

async function pass() {
  running = true;
  const started = Date.now();
  try {
    const paths = [...ROUTES, ...(await posts())].flatMap((p) => LOCALES.map((lang) => `/${lang}${p}`));
    const queue = [...paths];
    let failed = 0;
    const lane = async () => {
      for (let p = queue.shift(); p !== undefined; p = queue.shift()) if (!(await visit(p))) failed++;
    };
    await Promise.all(Array.from({ length: LANES }, lane));
    console.log(`[warm] ${paths.length - failed}/${paths.length} pages rendered in ${((Date.now() - started) / 1000).toFixed(1)}s`);
  } catch (err) {
    console.error("[warm] failed:", err);
  } finally {
    running = false;
    if (again) {
      again = false;
      warmPages(0);
    }
  }
}

/** the newest posts' paths ("/blog/slug"), or none without Ghost */
async function posts() {
  const { getLatestPosts } = await import("@/lib/ghost");
  return ((await getLatestPosts(POSTS)) ?? []).map((p) => `/blog/${p.slug}`);
}

async function visit(path: string) {
  const port = process.env.PORT || "3000";
  try {
    const res = await fetch(`http://127.0.0.1:${port}${path}`, {
      headers: { accept: "text/html" },
      cache: "no-store",
      signal: AbortSignal.timeout(30_000),
    });
    // read to the end: the render is done when the page is
    await res.arrayBuffer();
    return res.ok;
  } catch {
    return false;
  }
}
