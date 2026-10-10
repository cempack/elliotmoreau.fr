import { getLatestPosts, type GhostPost } from "./ghost";
import { getActivity, getRepos, type ActivityInfo, type RepoInfo } from "./github";
import { getSpotifyStatus, type SpotifyStatus } from "./spotify";
import { FIXTURE_ACTIVITY, FIXTURE_POSTS, FIXTURE_REPOS, FIXTURE_SPOTIFY } from "./fixtures";

export type Source = "live" | "sample" | "none";

export type HomeData = {
  posts: GhostPost[];
  spotify: SpotifyStatus | null;
  repos: RepoInfo[];
  activity: ActivityInfo | null;
  sources: Record<"posts" | "spotify" | "repos" | "activity", Source>;
};

const fixturesAllowed = (asked: boolean) =>
  asked && process.env.VERCEL_ENV !== "production" && process.env.EM_NO_FIXTURES !== "1";

/**
 * Everything the home page shows, fetched on the server. Each live source
 * falls back to sample data on its own (dev only) when it's unreachable.
 */
export async function getHomeData({ allowFixtures = false } = {}): Promise<HomeData> {
  const fx = fixturesAllowed(allowFixtures);
  const [posts, spotify, repos, activity] = await Promise.all([
    getLatestPosts(3),
    getSpotifyStatus().catch(() => null),
    getRepos(),
    getActivity(),
  ]);
  const pick = <T,>(live: T | null | undefined, sample: T, empty: T): [T, Source] => {
    const has = Array.isArray(live) ? live.length > 0 : live != null;
    if (has) return [live as T, "live"];
    return fx ? [sample, "sample"] : [empty, "none"];
  };
  const [p, ps] = pick(posts, FIXTURE_POSTS, []);
  const [s, ss] = pick(spotify, FIXTURE_SPOTIFY, null);
  const [r, rs] = pick(repos, FIXTURE_REPOS, []);
  const [a, as] = pick(activity, FIXTURE_ACTIVITY, null);
  return {
    posts: p,
    spotify: s,
    repos: r,
    activity: a,
    sources: { posts: ps, spotify: ss, repos: rs, activity: as },
  };
}
