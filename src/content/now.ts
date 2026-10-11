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
    en: "A snapshot of what has my attention at this point in my life. The live bits update themselves; the rest I write by hand, now and then.",
    fr: "Un instantané de ce qui occupe mon attention ces temps-ci. Les éléments en direct se mettent à jour tout seuls ; le reste, je l’écris à la main, de temps en temps.",
  } satisfies L10n,

  /** The current focus: the one thing most of my time goes into. */
  focus: {
    name: "emOS",
    /** Completes the headline. EN: "Right now I'm {doing}, …"; FR: "Ces jours-ci, {doing}, …". Keep {name}. */
    doing: { en: "building {name}", fr: "je construis {name}" } satisfies L10n,
    title: {
      en: "Rebuilding this site as a tiny operating system",
      fr: "Je refais ce site comme un petit système d’exploitation",
    } satisfies L10n,
    body: {
      en: "Glass windows over a pixel night, a real terminal, and far too many springs. You’re clicking around in it right now.",
      fr: "Des fenêtres en verre sur une nuit en pixels, un vrai terminal et bien trop de ressorts. Vous cliquez dedans.",
    } satisfies L10n,
    url: "https://github.com/cempack/elliotmoreau.fr",
  },

  /** Books (TODO: replace with what you're actually reading). */
  reading: [
    {
      title: "Practical Typography",
      author: "Matthew Butterick",
      status: "rereading",
      note: { en: "The spacing chapters, again.", fr: "Les chapitres sur l’espacement." },
      url: "https://practicaltypography.com",
    },
    {
      title: "The Design of Everyday Things",
      author: "Don Norman",
      status: "reading",
      note: { en: "Affordances, before another gesture.", fr: "Les affordances, avant tout geste." },
    },
    {
      title: "Crafting Interpreters",
      author: "Robert Nystrom",
      status: "next",
      note: { en: "For a real shell in the terminal.", fr: "Pour un vrai shell dans le terminal." },
      url: "https://craftinginterpreters.com",
    },
  ] satisfies Book[],

  /** Skills and topics (TODO: confirm). */
  learning: [
    {
      label: { en: "Spring physics for interfaces", fr: "La physique des ressorts dans les interfaces" },
      note: { en: "Damping, response, earned bounces.", fr: "Amortir, répondre, rebondir juste." },
    },
    {
      label: { en: "SVG filters and refraction", fr: "Filtres SVG et réfraction" },
      note: { en: "The Liquid Glass on this page.", fr: "Le Liquid Glass de cette page." },
    },
    {
      label: { en: "Basic Japanese", fr: "Les bases du japonais" },
      note: { en: "For the trip I keep planning.", fr: "Pour le voyage que je repousse." },
    },
  ] satisfies Learning[],

  /** Posts in progress (TODO: confirm titles). */
  drafting: [
    {
      title: { en: "How emOS is built", fr: "Comment emOS est construit" },
      note: { en: "Glass, pixels and a lot of springs.", fr: "Verre, pixels et ressorts." },
    },
    {
      title: { en: "Liquid Glass in the browser", fr: "Le Liquid Glass dans le navigateur" },
      note: { en: "What refracts, what fakes it, and why.", fr: "Ce qui réfracte, ce qui triche." },
    },
  ] satisfies Draft[],

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
    { key: { en: "Font", fr: "Police" }, value: "JetBrains Mono" },
    { key: { en: "Shell", fr: "Shell" }, value: "TODO: zsh? bash? fish?", todo: true },
    { key: { en: "Bar", fr: "Barre" }, value: "TODO: Waybar (Omarchy default)?", todo: true },
    { key: { en: "Launcher", fr: "Lanceur" }, value: "TODO: Walker? wofi?", todo: true },
    { key: { en: "Browser", fr: "Navigateur" }, value: "TODO", todo: true },
    { key: { en: "Keyboard", fr: "Clavier" }, value: "TODO: board, switches, layout", todo: true },
    { key: { en: "Machine", fr: "Machine" }, value: "TODO: laptop / desktop model", todo: true },
    { key: { en: "Music", fr: "Musique" }, value: "Spotify" },
    { key: { en: "Blog", fr: "Blog" }, value: "Ghost" },
    { key: { en: "Site", fr: "Site" }, value: { en: "Next.js on Vercel", fr: "Next.js sur Vercel" } },
  ] satisfies SetupRow[],
};

/** Pick the current language from an L10n (or pass a plain string through). */
export const loc = (v: string | L10n, lang: "en" | "fr") => (typeof v === "string" ? v : v[lang]);
