import type { GhostPost } from "./ghost";
import type { ActivityInfo, PushHistory, RepoInfo } from "./github";
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
    description: "A calm, mossy theme for Omarchy: Hyprland, Waybar, terminal and editor.",
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

/** ~90 days of sample pushes: steady weekdays, quiet weekends, a few busy
    stretches. Seeded, so it is the same wall on every render. */
export const FIXTURE_PUSHES: PushHistory = (() => {
  let a = 0x5eed;
  const rnd = () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  const fmt = new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Paris", year: "numeric", month: "2-digit", day: "2-digit" });
  const repos = ["elliotmoreau.fr", "omarchy-dos-moos-theme", "ttfx", "dotfiles"];
  const msgs = [
    "tune the springs until they feel right",
    "relight the city from the real sun",
    "fix the dock overlapping app bottoms",
    "dither the moon phase",
    "tighten the waybar spacing",
    "Safari: rims as real borders",
    "add the sundial",
    "write the French strings",
  ];
  const days: PushHistory["days"] = [];
  for (let k = 0; k < 90; k++) {
    const date = new Date(Date.now() - k * 86_400_000);
    const weekend = [0, 6].includes(date.getUTCDay());
    const busy = Math.sin(k / 9) > 0.55;
    const r = rnd();
    const n = weekend ? (r < 0.75 ? 0 : 1) : r < 0.22 ? 0 : Math.floor(1 + rnd() * (busy ? 8 : 4));
    if (!n) continue;
    days.push({ d: fmt.format(date), n, repo: repos[Math.floor(rnd() * (busy ? 1.5 : repos.length))], msg: msgs[Math.floor(rnd() * msgs.length)] });
  }
  return { days, since: fmt.format(new Date(Date.now() - 89 * 86_400_000)) };
})();
