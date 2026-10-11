import type { GhostPost } from "./ghost";
import type { ActivityInfo, RepoInfo } from "./github";
import type { SpotifyStatus } from "./spotify";

/**
 * Sample data for local work and preview builds, used only when a live
 * source is unreachable (no tokens in dev). Never served in production
 * (see getSiteData in ./data.ts; EM_NO_FIXTURES=1 shows the empty states).
 */

const daysAgo = (d: number) => new Date(Date.now() - d * 86_400_000).toISOString();

export const FIXTURE_POSTS: GhostPost[] = [
  {
    title: "Ricing a laptop until it feels like mine",
    slug: "ricing-a-laptop",
    excerpt:
      "Notes on building a desktop that gets out of the way, and the details that make it mine.",
    published_at: daysAgo(6),
    reading_time: 7,
    feature_image: null,
    url: "https://blog.elliotmoreau.fr/ricing-a-laptop/",
    tags: [{ name: "Linux", slug: "linux" }],
  },
  {
    title: "What a pixel font taught me about spacing",
    slug: "pixel-font-spacing",
    excerpt: "Designing a 3×5 typeface forces every decision into the open.",
    published_at: daysAgo(19),
    reading_time: 5,
    feature_image: null,
    url: "https://blog.elliotmoreau.fr/pixel-font-spacing/",
    tags: [{ name: "Design", slug: "design" }],
  },
  {
    title: "A week in Ireland with one camera and no plan",
    slug: "ireland-no-plan",
    excerpt: "Cliffs, rain, and the best soup of my life.",
    published_at: daysAgo(41),
    reading_time: 9,
    feature_image: null,
    url: "https://blog.elliotmoreau.fr/ireland-no-plan/",
    tags: [{ name: "Travel", slug: "travel" }],
  },
];

export const FIXTURE_REPOS: RepoInfo[] = [
  {
    name: "elliotmoreau.fr",
    description: "This website: workspaces, tiled windows and a terminal, in Next.js.",
    url: "https://github.com/cempack/elliotmoreau.fr",
    homepage: "https://elliotmoreau.fr",
    language: "TypeScript",
    stars: 12,
    forks: 1,
    pushedAt: daysAgo(0.2),
    topics: ["nextjs", "pixel-art", "portfolio"],
    preview: null,
  },
  {
    name: "omarchy-dos-moos-theme",
    description: "A calm, mossy theme for Omarchy — Hyprland, Waybar, terminal and editor.",
    url: "https://github.com/cempack/omarchy-dos-moos-theme",
    homepage: "",
    language: "Shell",
    stars: 48,
    forks: 4,
    pushedAt: daysAgo(3),
    topics: ["omarchy", "hyprland", "theme"],
    preview: null,
  },
  {
    name: "ttfx",
    description: "Terminal text effects for the browser: decrypt, beams, rings, waves.",
    url: "https://github.com/cempack",
    homepage: "",
    language: "TypeScript",
    stars: 21,
    forks: 2,
    pushedAt: daysAgo(9),
    topics: ["canvas", "animation"],
    preview: null,
  },
  {
    name: "dotfiles",
    description: "Everything that makes my machines feel like home.",
    url: "https://github.com/cempack",
    homepage: "",
    language: "Lua",
    stars: 9,
    forks: 0,
    pushedAt: daysAgo(14),
    topics: ["dotfiles", "neovim"],
    preview: null,
  },
  {
    name: "pixel-planets",
    description: "Seeded micro-planet identicons, dithered and deterministic.",
    url: "https://github.com/cempack",
    homepage: "",
    language: "TypeScript",
    stars: 6,
    forks: 0,
    pushedAt: daysAgo(30),
    topics: ["identicon", "generative"],
    preview: null,
  },
  {
    name: "spotify-now",
    description: "Tiny server-side now-playing endpoint, refresh-token flow.",
    url: "https://github.com/cempack",
    homepage: "",
    language: "Go",
    stars: 4,
    forks: 0,
    pushedAt: daysAgo(55),
    topics: ["spotify", "api"],
    preview: null,
  },
];

export const FIXTURE_SPOTIFY: SpotifyStatus = {
  now: {
    title: "Midnight City",
    artist: "M83",
    album: "Hurry Up, We're Dreaming",
    image: "",
    url: "https://open.spotify.com",
    progressMs: 96_000,
    durationMs: 243_000,
    playing: true,
  },
  recent: null,
  artists: [
    { name: "M83", image: "", url: "" },
    { name: "Justice", image: "", url: "" },
    { name: "Daft Punk", image: "", url: "" },
    { name: "Air", image: "", url: "" },
    { name: "Phoenix", image: "", url: "" },
  ],
};

export const FIXTURE_ACTIVITY: ActivityInfo = {
  type: "PushEvent",
  repo: "elliotmoreau.fr",
  repoUrl: "https://github.com/cempack/elliotmoreau.fr",
  message: "tune the springs until they feel right",
  createdAt: daysAgo(0.1),
};
