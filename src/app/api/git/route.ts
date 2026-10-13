import { getMetro, getSiteCity, getSiteCommit, getSiteCommits } from "@/lib/github";
import { getSiteContent } from "@/server/content";

/**
 * GET /api/git: this site's latest commits, for the Terminal's `git log --oneline`.
 * GET /api/git?show=<hash>: one commit and its files (`git show`).
 * GET /api/git?metro: the recently pushed repos' commits, a line each (`git log`'s metro map),
 * without the repos hidden from the admin panel.
 * GET /api/git?city: this site's source files, sizes and recent changes (Now's code city).
 * Public data from GitHub, cached (5 minutes for the log, 10 for the map, an hour per commit).
 */
export async function GET(req: Request) {
  const params = new URL(req.url).searchParams;
  const headers = { "Cache-Control": "public, max-age=60, s-maxage=300" };
  const show = params.get("show");
  if (show) {
    const commit = await getSiteCommit(show);
    return commit ? Response.json({ commit }, { headers }) : Response.json({ error: "notfound" }, { status: 404 });
  }
  if (params.has("city")) {
    const city = await getSiteCity();
    return city ? Response.json({ city }, { headers }) : Response.json({ error: "unavailable" }, { status: 503 });
  }
  if (params.has("metro")) {
    const hidden = new Set(getSiteContent().live.hiddenRepos.map((n) => n.toLowerCase()));
    const lines = await getMetro(hidden.size ? (repo) => hidden.has(repo.toLowerCase()) : undefined);
    return lines ? Response.json({ lines }, { headers }) : Response.json({ error: "unavailable" }, { status: 503 });
  }
  const commits = await getSiteCommits(15);
  return commits ? Response.json({ commits }, { headers }) : Response.json({ error: "unavailable" }, { status: 503 });
}
