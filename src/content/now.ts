/**
 * ─────────────────────────────── /now content ───────────────────────────────
 *
 *  SEED ONLY. The /now content lives in the database and is edited from the
 *  admin panel (Now); this file fills an empty database on first boot, and
 *  stands in if the database can't be opened. The site never reads it
 *  directly: use useNowContent() on the client, getNowContent() on the
 *  server. Nothing here is fetched: the live parts of /now (music, pushes,
 *  posts, the Toulouse clock and sky) come from the APIs.
 *
 *  - `updated` (YYYY-MM-DD) is shown as "Last updated".
 *  - Every user-facing string is bilingual: `{ en, fr }`.
 *  - Setup rows marked `todo: true` are guesses or blanks. They are NEVER
 *    rendered: confirm the value and drop the `todo` flag to show a row.
 *  - Lists can be any length (0 hides the block); keep them short. A /now
 *    page is a snapshot, not an archive.
 */

import type { NowContent } from "@/lib/content";

export type { Book, Draft, L10n, Learning, NowContent, SetupRow } from "@/lib/content";
export { loc } from "@/lib/content";

export const NOW: NowContent = {
  updated: "2026-10-10",

  intro: {
    en: "What I’m working on right now. Music, pushes and posts update live; the rest I edit by hand.",
    fr: "Ce sur quoi je travaille en ce moment. La musique, les pushs et les articles se mettent à jour seuls, le reste je l’écris à la main.",
  },

  focus: {
    name: "emOS",
    /** Completes the headline. EN: "Right now I'm {doing}, …"; FR: "Ces jours-ci, {doing}, …". Keep {name}. */
    doing: { en: "building {name}", fr: "je construis {name}" },
    title: {
      en: "Rebuilding this site to work like my desktop",
      fr: "Je refais ce site pour qu’il marche comme mon bureau",
    },
    body: {
      en: "Workspaces, tiled windows and a terminal, in the colours of my Omarchy theme.",
      fr: "Des espaces de travail, des fenêtres en mosaïque et un terminal, aux couleurs de mon thème Omarchy.",
    },
    url: "https://github.com/cempack/elliotmoreau.fr",
  },

  /** Books: what's actually being read (an empty list hides the block). */
  reading: [],

  /** Skills and topics (empty hides the block). */
  learning: [],

  /** Posts in progress (empty hides the block). */
  drafting: [],

  /**
   * The "uses" sheet, fastfetch style. Rows with `todo: true` stay hidden.
   * Known from public work: Omarchy, Hyprland, Neovim, Ghostty, Dos Moos,
   * JetBrains Mono, Spotify, Ghost, Next.js on Railway.
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
    { key: { en: "Site", fr: "Site" }, value: { en: "Next.js on Railway", fr: "Next.js sur Railway" } },
  ],
};
