import { getRepos } from "@/lib/github";
import { FIXTURE_REPOS } from "@/lib/fixtures";
import { getSiteContent } from "@/server/content";

/**
 * GET /api/shot?name=<repo>: a shown repo's README screenshot, passed
 * through from this site's own address. Projects paints it onto the
 * machine's screen, which means reading its pixels, and a browser only
 * lets a page read pixels from another host when that host says so:
 * GitHub's raw files do, and Projects reads those directly; this is for
 * the README hosts that don't. Only the screenshot
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
  const name = new URL(req.url).searchParams.get("name") ?? "";
  const url = await previewOf(name);
  if (!url) return new Response(null, { status: 404 });
  // the machine falls back to its drawing: say why here, where Railway's logs show it
  const fail = (status: number, why: unknown) => {
    console.error(`[shot] ${name}:`, why);
    return new Response(null, { status });
  };
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(8000), cache: "no-store" });
    const type = (res.headers.get("content-type") ?? "").split(";")[0].trim().toLowerCase();
    if (!res.ok || !TYPES.test(type) || Number(res.headers.get("content-length") ?? 0) > MAX)
      return fail(502, `${res.status} ${type || "no type"} from ${url}`);
    const body = await res.arrayBuffer();
    if (body.byteLength > MAX) return fail(502, `${body.byteLength} bytes from ${url}`);
    return new Response(body, {
      headers: {
        "Content-Type": type,
        "Cache-Control": "public, max-age=3600, s-maxage=86400",
        "Content-Security-Policy": "default-src 'none'",
      },
    });
  } catch (err) {
    return fail(504, err instanceof Error ? err.message : err);
  }
}
