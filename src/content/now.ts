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
 *  - Lists can be any length (0 hides the block); keep them short. A /now
 *    page is a snapshot, not an archive.
 */

import type { NowContent } from "@/lib/content";

export type { Book, Draft, L10n, Learning, NowContent } from "@/lib/content";

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
};
