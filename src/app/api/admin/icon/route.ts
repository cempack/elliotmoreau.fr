import { currentSession } from "@/server/auth";
import { db } from "@/server/db";
import { KNOWN_SOURCE_HOSTS } from "@/components/apps/admin/stats/data";

/**
 * GET /api/admin/icon?host=github.com: the little icon of a site visitors
 * came from, for the stats' sources. Signed-in only, and only for a site
 * that actually appears in the stats (or one a utm word stands for). It's
 * fetched from one fixed icon service (never from the site itself, which
 * could point anywhere) and kept in memory; a site without an icon gets
 * the panel's own link glyph.
 */

const UPSTREAM = (host: string) => `https://icons.duckduckgo.com/ip3/${host}.ico`;
const HOST = /^(?=.{3,80}$)[a-z0-9](?:[a-z0-9-]*[a-z0-9])?(?:\.[a-z0-9](?:[a-z0-9-]*[a-z0-9])?)+$/;
const DAY = 86_400_000;

type Entry = { at: number; type: string; body: ArrayBuffer | null };
const cache = new Map<string, Entry>();

/** no icon to be had: the panel's own link glyph, in its muted ink (an image file can't read the page's colors) */
const GLYPH = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" fill="none" stroke="#72856c" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M6.5 9.5l3-3M7 4.5l1.2-1.2a2.5 2.5 0 013.5 3.5L10.5 8M9 11.5l-1.2 1.2a2.5 2.5 0 01-3.5-3.5L5.5 8"/></svg>`;
function none() {
  return new Response(GLYPH, { headers: { "Content-Type": "image/svg+xml", "Cache-Control": "private, max-age=3600" } });
}

export async function GET(req: Request) {
  if (!(await currentSession())) return new Response(null, { status: 401 });
  const host = new URL(req.url).searchParams.get("host")?.toLowerCase() ?? "";
  if (!HOST.test(host)) return none();
  if (!KNOWN_SOURCE_HOSTS.includes(host) && !db().prepare(`SELECT 1 FROM hits WHERE ref = ? LIMIT 1`).get(host)) return none();

  let e = cache.get(host);
  if (!e || Date.now() - e.at > (e.body ? 7 * DAY : DAY)) {
    e = { at: Date.now(), type: "", body: null };
    try {
      const res = await fetch(UPSTREAM(host), { signal: AbortSignal.timeout(4000), redirect: "follow" });
      const type = res.headers.get("content-type") ?? "";
      if (res.ok && /^image\//.test(type)) {
        const body = await res.arrayBuffer();
        if (body.byteLength > 0 && body.byteLength < 64_000) e = { at: e.at, type, body };
      }
    } catch {
      // unreachable or too slow: no icon this time
    }
    if (cache.size >= 300) cache.delete(cache.keys().next().value as string);
    cache.set(host, e);
  }
  if (!e.body) return none();
  return new Response(e.body, { headers: { "Content-Type": e.type, "Cache-Control": "private, max-age=604800" } });
}
