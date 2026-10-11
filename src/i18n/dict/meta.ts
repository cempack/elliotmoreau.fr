// SEO strings: <title>, meta descriptions, share cards (src/lib/og.tsx
// sets `description` under the wordmark and each page description on
// its app card), the manifest and the Person structured data.
// Keep descriptions under ~150 characters so search results and the
// cards never truncate them. French typography: U+00A0 (no-break space)
// before : and inside « », U+202F (narrow no-break space) before ? ! ;.
const en = {
  siteName: "Elliot Moreau",
  title: "Elliot Moreau — a personal OS made of glass and pixels",
  description:
    "Developer in France, making software, Omarchy themes and small tools that feel good to use. Plus writing, music and the places in between.",
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
    work: "Open-source work by Elliot Moreau, live from GitHub: Omarchy themes, web experiments and small tools that feel good to use.",
    writing: "Essays and field notes by Elliot Moreau on code, design, travel and music, straight from his blog.",
    atlas: "Where Elliot Moreau has been and where he’s headed next, on a spinning pixel globe, with a postcard from every stop.",
    now: "What Elliot Moreau is building, reading and listening to right now, with live updates from GitHub and Spotify.",
    contact: "Write to Elliot Moreau about a project, a question or just to say hello. The inbox is open, PGP welcome.",
  },
};

const fr: typeof en = {
  siteName: "Elliot Moreau",
  title: "Elliot Moreau — un OS personnel fait de verre et de pixels",
  description:
    "Développeur en France. Des logiciels, des thèmes Omarchy et de petits outils agréables à utiliser. Et aussi des écrits, de la musique, des voyages.",
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
    work: "Les projets open source d’Elliot Moreau, en direct de GitHub : thèmes Omarchy, expériences web et petits outils agréables à utiliser.",
    writing: "Essais et carnets d’Elliot Moreau sur le code, le design, le voyage et la musique, tout droit sortis de son blog.",
    atlas: "Là où Elliot Moreau est allé et là où il ira ensuite, sur un globe en pixels, avec une carte postale de chaque étape.",
    now: "Ce qu’Elliot Moreau construit, lit et écoute en ce moment, avec GitHub et Spotify en direct.",
    contact: "Écrire à Elliot Moreau pour un projet, une question ou simplement dire bonjour. La boîte est ouverte, PGP bienvenu.",
  },
};

const meta = { en, fr };
export default meta;
