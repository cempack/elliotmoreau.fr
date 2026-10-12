import { getSiteCommit, getSiteCommits } from "@/lib/github";

/**
 * GET /api/git: this site's latest commits, for the Terminal's `git log`.
 * GET /api/git?show=<hash>: one commit and its files (`git show`).
 * Public data from GitHub, cached (5 minutes for the log, an hour per commit).
 */
export async function GET(req: Request) {
  const show = new URL(req.url).searchParams.get("show");
  const headers = { "Cache-Control": "public, max-age=60, s-maxage=300" };
  if (show) {
    const commit = await getSiteCommit(show);
    return commit ? Response.json({ commit }, { headers }) : Response.json({ error: "notfound" }, { status: 404 });
  }
  const commits = await getSiteCommits(15);
  return commits ? Response.json({ commits }, { headers }) : Response.json({ error: "unavailable" }, { status: 503 });
}
