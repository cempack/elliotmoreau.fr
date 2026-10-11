// Strings for the notfound app (the 404 alert) and the site's SEO surfaces
// (share-image alt text, structured data). Owned by the notfound-seo
// builder: add keys to `en` and the type forces the same keys in `fr`.
// French typography: U+00A0 (no-break space) inside « » and before :,
// U+202F (narrow no-break space) before ? ! ;, so no line ever starts
// with a lone mark; U+2011 (no-break hyphen) in "Vouliez‑vous", which
// must never break.
const en = {
  /** h1. `{path}` is the address that failed, set in its own span */
  title: "The application “{path}” can’t be opened.",
  body: "There’s no app at this address. It may have moved, been renamed, or never existed. Everything else in emOS is right where you left it.",
  /** when the address looks like a typo of a real app */
  bodySuggest: "There’s no app at this address. Did you mean {app}?",
  /** when it looks like an old post slug (the blog moved to its own address) */
  bodyPost: "Posts moved to the blog. Did you mean “{name}”?",
  /** when it looks like one of the repositories */
  bodyRepo: "That sounds like one of Elliot’s repositories. Did you mean {name}?",
  desktop: "Go to Desktop",
  search: "Search emOS",
  open: "Open {app}",
  read: "Read “{name}”",
  openRepo: "Open {name} on GitHub",
  /** the hint pill beside the pointer when it rests on the alert */
  drag: "Drag me",
  /** the little zsh transcript */
  console: "Terminal",
  /** the [nyae] keys, as one keyboard stop (arrows move between them) */
  answerGroup: "Answer zsh",
  answers: {
    y: "Yes, open {app}",
    n: "No",
    a: "Abort",
    e: "Edit: search emOS instead",
  },
  seo: {
    /** share-image alt text */
    homeAlt: "“Elliot Moreau” in pixel letters over a starry night sky: {tagline}",
    appAlt: "{app}, by Elliot Moreau: the app’s pixel icon over a starry night sky. {description}",
    /** Person structured data */
    jobTitle: "Software developer",
  },
};

const fr: typeof en = {
  title: "L’application « {path} » ne peut pas être ouverte.",
  body: "Aucune app à cette adresse. Elle a peut-être déménagé, changé de nom, ou n’a jamais existé. Tout le reste d’emOS est là où vous l’avez laissé.",
  bodySuggest: "Aucune app à cette adresse. Vouliez‑vous dire {app} ?",
  bodyPost: "Les articles ont déménagé sur le blog. Vouliez‑vous dire « {name} » ?",
  bodyRepo: "On dirait l’un des dépôts d’Elliot. Vouliez‑vous dire {name} ?",
  desktop: "Aller au Bureau",
  search: "Rechercher",
  open: "Ouvrir {app}",
  read: "Lire « {name} »",
  openRepo: "Ouvrir {name} sur GitHub",
  drag: "Déplacez-moi",
  console: "Terminal",
  answerGroup: "Répondre à zsh",
  answers: {
    y: "Oui, ouvrir {app}",
    n: "Non",
    a: "Annuler",
    e: "Modifier : chercher dans emOS",
  },
  seo: {
    homeAlt: "« Elliot Moreau » en lettres de pixels sur un ciel de nuit étoilé : {tagline}",
    appAlt: "{app}, par Elliot Moreau : l’icône de l’app en pixels sur un ciel de nuit étoilé. {description}",
    jobTitle: "Développeur logiciel",
  },
};

const notfound = { en, fr };
export default notfound;
