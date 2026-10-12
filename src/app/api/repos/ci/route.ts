import { getCi, type CiInfo } from "@/lib/github";

/**
 * GET /api/repos/ci?names=a,b,c: each repo's default-branch checks folded
 * into one signal (Projects' green light). At most 12 names; cached 5
 * minutes per repo.
 */
export async function GET(req: Request) {
  const names = (new URL(req.url).searchParams.get("names") ?? "")
    .split(",")
    .map((n) => n.trim())
    .filter((n) => /^[A-Za-z0-9._-]{1,100}$/.test(n))
    .slice(0, 12);
  const entries = await Promise.all(names.map(async (n) => [n, await getCi(n)] as const));
  const ci: Record<string, CiInfo> = Object.fromEntries(entries);
  return Response.json({ ci }, { headers: { "Cache-Control": "public, max-age=60, s-maxage=300" } });
}
