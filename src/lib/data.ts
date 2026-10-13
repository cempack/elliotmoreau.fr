import "server-only";
import { cache } from "react";
import { getLatestPosts, type GhostPost } from "./ghost";
import { getActivity, getDayPushes, getPushes, getRepos, type ActivityInfo, type DayPush, type PushHistory, type RepoInfo } from "./github";
import { getDayTracks, getSpotifyStatus, type DayTrack, type SpotifyStatus } from "./spotify";
import { getWeather, type Weather } from "./weather";
import { getTheme } from "./theme-source";
import type { Theme } from "./theme";
import { FIXTURE_ACTIVITY, FIXTURE_POSTS, FIXTURE_PUSHES, FIXTURE_REPOS, FIXTURE_SPOTIFY, fixtureDay } from "./fixtures";
import { getSiteContent } from "@/server/content";
import type { CurrentAway, NowContent, PlaceRow, PublicLive, Status } from "./content";

export type Source = "live" | "sample" | "none";

export type SiteData = {
  posts: GhostPost[];
  spotify: SpotifyStatus | null;
  /** without the repos hidden from the admin panel */
  repos: RepoInfo[];
  activity: ActivityInfo | null;
  pushes: PushHistory | null;
  sources: Record<"posts" | "spotify" | "repos" | "activity" | "pushes", Source>;
  /** the Atlas: home first, then been, then want */
  places: PlaceRow[];
  /** away, working hours, reply days */
  status: Status;
  /** the /now page's hand-written content */
  now: NowContent;
  /** the overrides pages act on (the hidden list stays on the server) */
  live: PublicLive;
  /** who's away today (hand-set, or a trip whose dates include today), resolved at render */
  away: CurrentAway | null;
  /** Toulouse's weather now (the wallpaper's sky, the clock widget); null when unknown */
  weather: Weather | null;
  /** the Dos Moos palette, live from its repo (the snapshot when GitHub is out of reach) */
  theme: Theme;
};

/** sample data stands in for unreachable sources everywhere except the
    production deployment (Railway's "production" environment) */
const fixturesAllowed = () =>
  process.env.RAILWAY_ENVIRONMENT_NAME !== "production" && process.env.EM_NO_FIXTURES !== "1";

/**
 * Everything the OS shows, fetched on the server once per render (each
 * source keeps its own revalidate window), plus the content from the
 * database with its live-data overrides applied (hidden repos are left
 * out, Spotify can be switched off). A source that's down or unconfigured
 * falls back to sample data outside production, or to an empty value the
 * UI has a designed state for.
 */
export const getSiteData = cache(async (): Promise<SiteData> => {
  const fx = fixturesAllowed();
  const { live, projects, ...content } = getSiteContent();
  const { hiddenRepos, ...publicLive } = live;
  const hidden = new Set(hiddenRepos.map((n) => n.toLowerCase()));
  const skip = hidden.size ? (repo: string) => hidden.has(repo.toLowerCase()) : undefined;
  const [posts, spotify, repos, activity, pushes, weather, theme] = await Promise.all([
    getLatestPosts(12),
    live.showSpotify ? getSpotifyStatus().catch(() => null) : null,
    getRepos(),
    getActivity(skip),
    getPushes(skip),
    getWeather(),
    getTheme(),
  ]);
  const pick = <T,>(live: T | null | undefined, sample: T, empty: T): [T, Source] => {
    const has = Array.isArray(live) ? live.length > 0 : live != null;
    if (has) return [live as T, "live"];
    return fx ? [sample, "sample"] : [empty, "none"];
  };
  const [p, ps] = pick(posts, FIXTURE_POSTS, []);
  const [s, ss] = live.showSpotify ? pick(spotify, FIXTURE_SPOTIFY, null) : [null, "none" as const];
  const [r, rs] = pick(repos, FIXTURE_REPOS, []);
  const [a, as] = pick(activity, FIXTURE_ACTIVITY, null);
  const [h, hs] = pick(pushes, FIXTURE_PUSHES, null);
  // the admin panel's notes and order ride on each repo (only the visible ones reach the page)
  const rankOf = new Map(projects.order.map((n, i) => [n, i]));
  const noted = (list: RepoInfo[]) =>
    list.map((x) => {
      const k = x.name.toLowerCase();
      const note = projects.notes[k];
      const rank = rankOf.get(k);
      return { ...x, ...(note ? { note } : {}), ...(rank != null ? { rank } : {}) };
    });
  return {
    posts: p,
    spotify: s,
    // a repo says something on the site: GitHub's description, or the admin panel's sentence
    repos: noted(skip ? r.filter((x) => !skip(x.name)) : r).filter((x) => x.description || x.note?.plain),
    // live activity and pushes come filtered; the samples can name a hidden repo too
    activity: a && skip?.(a.repo) ? null : a,
    pushes: h && skip ? { ...h, days: h.days.filter((d) => !skip(d.repo)) } : h,
    sources: { posts: ps, spotify: ss, repos: rs, activity: as, pushes: hs },
    weather,
    theme,
    ...content,
    live: publicLive,
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

/**
 * Whether `name` is a repo the site shows: one of Elliot's own, not hidden
 * from the admin panel. The repo routes answer for those only, so a
 * made-up or hidden name never costs a call on the GitHub token.
 */
export async function isShownRepo(name: string) {
  const k = name.toLowerCase();
  if (getSiteContent().live.hiddenRepos.some((n) => n.toLowerCase() === k)) return false;
  return (await getRepos())?.some((r) => r.name.toLowerCase() === k) ?? false;
}

export type DayData = { tracks: DayTrack[]; pushes: DayPush[] };

/**
 * The last day, for /now's sky: the plays Spotify remembers (with their
 * times) and the pushes of the last 24 hours. Same fallbacks as the rest:
 * samples outside production, empty in it.
 */
export const getDayData = cache(async (): Promise<DayData> => {
  const fx = fixturesAllowed();
  const { live } = getSiteContent();
  const hidden = new Set(live.hiddenRepos.map((n) => n.toLowerCase()));
  const skip = hidden.size ? (repo: string) => hidden.has(repo.toLowerCase()) : undefined;
  const [tracks, pushes] = await Promise.all([live.showSpotify ? getDayTracks().catch(() => null) : null, getDayPushes(skip).catch(() => null)]);
  const sample = fx ? fixtureDay() : { tracks: [], pushes: [] };
  return {
    tracks: live.showSpotify ? (tracks ?? sample.tracks) : [],
    pushes: pushes ?? sample.pushes,
  };
});
