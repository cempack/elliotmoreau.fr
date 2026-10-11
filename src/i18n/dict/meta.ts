// SEO strings: <title>, meta descriptions, share cards (src/lib/og.tsx
// sets `description` under the wordmark and each page description on
// its app card), the manifest and the Person structured data.
// Keep descriptions under ~150 characters so search results and the
// cards never truncate them. French typography: U+00A0 (no-break space)
// before : and inside « », U+202F (narrow no-break space) before ? ! ;.
const en = {
  siteName: "Elliot Moreau",
  title: "Elliot Moreau, developer in Toulouse",
  description: "Elliot Moreau, a developer in Toulouse, France. Projects, writing, travel and what I’m listening to.",
  pages: {
    home: "Desktop",
    work: "Projects",
    writing: "Writing",
    atlas: "Atlas",
    now: "Now",
    contact: "Contact",
    notFound: "Not found",
  },
  pageDescriptions: {
    work: "Elliot Moreau’s open-source projects, from GitHub: Omarchy themes, web experiments and small tools.",
    writing: "Posts by Elliot Moreau on code, design, travel and music.",
    atlas: "Places Elliot Moreau has been to and wants to visit, on a pixel globe.",
    now: "What Elliot Moreau is working on, reading and listening to right now.",
    contact: "Get in touch with Elliot Moreau: email, socials and a PGP key.",
  },
};

const fr: typeof en = {
  siteName: "Elliot Moreau",
  title: "Elliot Moreau, développeur à Toulouse",
  description: "Elliot Moreau, développeur à Toulouse. Projets, écrits, voyages et ce que j’écoute.",
  pages: {
    home: "Bureau",
    work: "Projets",
    writing: "Écrits",
    atlas: "Atlas",
    now: "En ce moment",
    contact: "Contact",
    notFound: "Introuvable",
  },
  pageDescriptions: {
    work: "Les projets open source d’Elliot Moreau, depuis GitHub : thèmes Omarchy, expériences web et petits outils.",
    writing: "Les articles d’Elliot Moreau sur le code, le design, le voyage et la musique.",
    atlas: "Les lieux qu’Elliot Moreau a visités et ceux qu’il veut voir, sur un globe en pixels.",
    now: "Ce sur quoi Elliot Moreau travaille, ce qu’il lit et ce qu’il écoute en ce moment.",
    contact: "Contacter Elliot Moreau : e-mail, réseaux et clé PGP.",
  },
};

const meta = { en, fr };
export default meta;
