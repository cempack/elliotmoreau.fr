/**
 * ─────────────────────────────── /now content ───────────────────────────────
 *
 *  DRAFT, for Elliot to edit. Everything in this file was written by the
 *  site builder from what is public (GitHub, the blog, this site) and is
 *  meant to be rewritten in your own words. Nothing here is fetched: the
 *  live parts of /now (music, pushes, posts, the Paris clock and sky) come
 *  from the APIs, and this file holds only what a human has to say.
 *
 *  How to edit
 *  - Bump `updated` (YYYY-MM-DD) whenever you touch this file; the page shows
 *    it as "Last updated".
 *  - Every user-facing string is bilingual: `{ en, fr }`.
 *  - Setup rows marked `todo: true` are guesses or blanks. They are NEVER
 *    rendered: confirm the value and delete the `todo` flag to show a row.
 *  - Lists can be any length (0 hides the block); keep them short. A /now
 *    page is a snapshot, not an archive.
 */

export type L10n = { en: string; fr: string };

export type Book = {
  title: string;
  author: string;
  status: "reading" | "rereading" | "next" | "finished";
  /** one short line: why, or what you're getting out of it */
  note?: L10n;
  url?: string;
};

export type Learning = { label: L10n; note?: L10n };

export type Draft = { title: L10n; note?: L10n };

export type SetupRow = {
  /** fastfetch-style key, shown as-is (short, technical) */
  key: L10n;
  value: string | L10n;
  /** unconfirmed: kept here as a placeholder, never shown on the page */
  todo?: boolean;
};

export const NOW = {
  /** YYYY-MM-DD, shown as "Last updated" */
  updated: "2026-10-10",

  /** One or two sentences under the headline. */
  intro: {
    en: "What I’m working on right now. Music, pushes and posts update live; the rest I edit by hand.",
    fr: "Ce sur quoi je travaille en ce moment. La musique, les pushs et les articles se mettent à jour seuls, le reste je l’écris à la main.",
  } satisfies L10n,

  /** The current focus: the one thing most of my time goes into. */
  focus: {
    name: "emOS",
    /** Completes the headline. EN: "Right now I'm {doing}, …"; FR: "Ces jours-ci, {doing}, …". Keep {name}. */
    doing: { en: "building {name}", fr: "je construis {name}" } satisfies L10n,
    title: {
      en: "Rebuilding this site to work like my desktop",
      fr: "Je refais ce site pour qu’il marche comme mon bureau",
    } satisfies L10n,
    body: {
      en: "Workspaces, tiled windows and a terminal, in the colours of my Omarchy theme.",
      fr: "Des espaces de travail, des fenêtres en mosaïque et un terminal, aux couleurs de mon thème Omarchy.",
    } satisfies L10n,
    url: "https://github.com/cempack/elliotmoreau.fr",
  },

  /** Books: add what you're actually reading (an empty list hides the block). */
  reading: [] as Book[],

  /** Skills and topics (empty hides the block). */
  learning: [] as Learning[],

  /** Posts in progress (empty hides the block). */
  drafting: [] as Draft[],

  /**
   * The "uses" sheet, fastfetch style. Rows with `todo: true` stay hidden.
   * Known from public work: Omarchy, Hyprland, Neovim, Ghostty, Dos Moos,
   * JetBrains Mono, Spotify, Ghost, Next.js on Vercel.
   */
  setup: [
    { key: { en: "OS", fr: "OS" }, value: "Omarchy · Arch Linux" },
    { key: { en: "WM", fr: "WM" }, value: "Hyprland" },
    { key: { en: "Editor", fr: "Éditeur" }, value: "Neovim" },
    { key: { en: "Terminal", fr: "Terminal" }, value: "Ghostty" },
    { key: { en: "Theme", fr: "Thème" }, value: { en: "Dos Moos (my own)", fr: "Dos Moos (le mien)" } },
    { key: { en: "Font", fr: "Police" }, value: "JetBrainsMono Nerd Font" },
    { key: { en: "Shell", fr: "Shell" }, value: "TODO: zsh? bash? fish?", todo: true },
    { key: { en: "Bar", fr: "Barre" }, value: "Waybar" },
    { key: { en: "Launcher", fr: "Lanceur" }, value: "TODO: Walker? wofi?", todo: true },
    { key: { en: "Browser", fr: "Navigateur" }, value: "Chromium" },
    { key: { en: "Keyboard", fr: "Clavier" }, value: "TODO: board, switches, layout", todo: true },
    { key: { en: "Machine", fr: "Machine" }, value: "TODO: laptop / desktop model", todo: true },
    { key: { en: "Music", fr: "Musique" }, value: "Spotify" },
    { key: { en: "Blog", fr: "Blog" }, value: "Ghost" },
    { key: { en: "Site", fr: "Site" }, value: { en: "Next.js on Vercel", fr: "Next.js sur Vercel" } },
  ] satisfies SetupRow[],
};

/** Pick the current language from an L10n (or pass a plain string through). */
export const loc = (v: string | L10n, lang: "en" | "fr") => (typeof v === "string" ? v : v[lang]);
