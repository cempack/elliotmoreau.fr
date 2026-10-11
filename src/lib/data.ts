import "server-only";
import { cache } from "react";
import { getLatestPosts, type GhostPost } from "./ghost";
import { getActivity, getPushes, getRepos, type ActivityInfo, type PushHistory, type RepoInfo } from "./github";
import { getSpotifyStatus, type SpotifyStatus } from "./spotify";
import { FIXTURE_ACTIVITY, FIXTURE_POSTS, FIXTURE_PUSHES, FIXTURE_REPOS, FIXTURE_SPOTIFY } from "./fixtures";

export type Source = "live" | "sample" | "none";

export type SiteData = {
  posts: GhostPost[];
  spotify: SpotifyStatus | null;
  repos: RepoInfo[];
  activity: ActivityInfo | null;
  pushes: PushHistory | null;
  sources: Record<"posts" | "spotify" | "repos" | "activity" | "pushes", Source>;
};

// sample data stands in for unreachable sources everywhere except production
const fixturesAllowed = () =>
  process.env.VERCEL_ENV !== "production" && process.env.EM_NO_FIXTURES !== "1";

/**
 * Everything the OS shows, fetched on the server once per render (each
 * source keeps its own revalidate window). A source that's down or
 * unconfigured falls back to sample data outside production, or to an
 * empty value the UI has a designed state for.
 */
export const getSiteData = cache(async (): Promise<SiteData> => {
  const fx = fixturesAllowed();
  const [posts, spotify, repos, activity, pushes] = await Promise.all([
    getLatestPosts(12),
    getSpotifyStatus().catch(() => null),
    getRepos(),
    getActivity(),
    getPushes(),
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
  const [h, hs] = pick(pushes, FIXTURE_PUSHES, null);
  return {
    posts: p,
    spotify: s,
    repos: r,
    activity: a,
    pushes: h,
    sources: { posts: ps, spotify: ss, repos: rs, activity: as, pushes: hs },
  };
});

/**
 * What the always-mounted shell needs, for the root layout: everything but
 * the push history, which only the home page's brick wall reads (the home
 * page sends it itself), so other pages' HTML doesn't carry it.
 */
export const getShellData = cache(async (): Promise<SiteData> => {
  const d = await getSiteData();
  return { ...d, pushes: null };
});
