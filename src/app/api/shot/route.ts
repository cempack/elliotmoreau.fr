import { getRepos } from "@/lib/github";
import { FIXTURE_REPOS } from "@/lib/fixtures";
import { getSiteContent } from "@/server/content";

/**
 * GET /api/shot?name=<repo>: a shown repo's README screenshot, passed
 * through from this site's own address. Projects paints it onto the
 * machine's screen, which means reading its pixels, and a browser only
 * lets a page read pixels from its own origin (README pictures live on
 * GitHub's hosts, which don't all say otherwise). Only the screenshot
 * Projects already shows, for a repo the site shows: never a URL from the
 * request, so it can't be used to fetch anything else. Raster images only
 * (no SVG, which could carry script), 8 MB at most.
 */
const sampleAllowed = () => process.env.RAILWAY_ENVIRONMENT_NAME !== "production" && process.env.EM_NO_FIXTURES !== "1";
const TYPES = /^image\/(png|jpeg|gif|webp|avif)$/;
const MAX = 8 * 1024 * 1024;

async function previewOf(name: string) {
  const k = name.toLowerCase();
  if (!k || getSiteContent().live.hiddenRepos.some((n) => n.toLowerCase() === k)) return null;
  const live = await getRepos();
  const repos = live?.length ? live : sampleAllowed() ? FIXTURE_REPOS : [];
  const url = repos.find((r) => r.name.toLowerCase() === k)?.preview;
  return url && /^https:\/\//i.test(url) ? url : null;
}

export async function GET(req: Request) {
  const url = await previewOf(new URL(req.url).searchParams.get("name") ?? "");
  if (!url) return new Response(null, { status: 404 });
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(8000), cache: "no-store" });
    const type = (res.headers.get("content-type") ?? "").split(";")[0].trim().toLowerCase();
    if (!res.ok || !TYPES.test(type) || Number(res.headers.get("content-length") ?? 0) > MAX) return new Response(null, { status: 502 });
    const body = await res.arrayBuffer();
    if (body.byteLength > MAX) return new Response(null, { status: 502 });
    return new Response(body, {
      headers: {
        "Content-Type": type,
        "Cache-Control": "public, max-age=3600, s-maxage=86400",
        "Content-Security-Policy": "default-src 'none'",
      },
    });
  } catch {
    return new Response(null, { status: 504 });
  }
}
