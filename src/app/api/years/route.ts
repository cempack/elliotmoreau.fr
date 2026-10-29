import { getYears } from "@/lib/github";
import { fixtureYears } from "@/lib/fixtures";
import { getSiteContent } from "@/server/content";
import { sampleAllowed } from "@/lib/deploy";

/**
 * GET /api/years: a year of work for Projects' Years view: each recently
 * pushed repo's commits per week over the last 52 weeks, and its last
 * commit, without the repos hidden from the admin panel. Public GitHub
 * data, cached half an hour; a sample outside production when GitHub
 * can't be reached.
 */

export async function GET() {
  const hidden = new Set(getSiteContent().live.hiddenRepos.map((n) => n.toLowerCase()));
  const skip = hidden.size ? (repo: string) => hidden.has(repo.toLowerCase()) : undefined;
  const live = await getYears(skip);
  if (live?.ranges.length) return Response.json({ years: live, sample: false }, { headers: { "Cache-Control": "public, max-age=300, s-maxage=1800" } });
  if (!sampleAllowed()) return Response.json({ error: "unavailable" }, { status: 503 });
  const years = fixtureYears();
  return Response.json({ years: { ...years, ranges: years.ranges.filter((r) => !skip?.(r.repo)) }, sample: true }, { headers: { "Cache-Control": "no-store" } });
}
