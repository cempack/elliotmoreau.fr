import { getRepoDetail, type RepoDetail } from "@/lib/github";
import { FIXTURE_REPOS } from "@/lib/fixtures";

/**
 * GET /api/repo?name=<repo>: one repo turned over, for Quick Look's back:
 * README intro and first image, languages by bytes, open issues, licence,
 * latest release and CI state. Public GitHub data, cached 5 minutes. A
 * sample outside production when GitHub can't be reached.
 */
const sampleAllowed = () => process.env.RAILWAY_ENVIRONMENT_NAME !== "production" && process.env.EM_NO_FIXTURES !== "1";

function sample(name: string): RepoDetail | null {
  const r = FIXTURE_REPOS.find((x) => x.name === name);
  if (!r) return null;
  return {
    name,
    intro: `${r.description} (Sample text: the real README loads once GitHub is reachable.)`,
    image: null,
    languages: r.language ? [{ name: r.language, bytes: 41_000 }, { name: "CSS", bytes: 9_000 }, { name: "Shell", bytes: 1_200 }] : [],
    issues: 2,
    license: "MIT",
    release: { tag: "v1.2.0", at: r.pushedAt, url: r.url },
    ci: name === "elliotmoreau.fr" ? { state: "passing", detail: "deployed", at: r.pushedAt } : { state: name.length % 3 === 0 ? "failing" : "passing", detail: name.length % 3 === 0 ? "tests" : undefined },
  };
}

export async function GET(req: Request) {
  const name = new URL(req.url).searchParams.get("name") ?? "";
  const detail = (await getRepoDetail(name)) ?? (sampleAllowed() ? sample(name) : null);
  if (!detail) return Response.json({ error: "notfound" }, { status: 404 });
  return Response.json({ detail }, { headers: { "Cache-Control": "public, max-age=60, s-maxage=300" } });
}
