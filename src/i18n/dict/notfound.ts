// Strings for the notfound app (the 404 alert) and the site's SEO surfaces
// (share-image alt text, structured data). Owned by the notfound-seo
// builder: add keys to `en` and the type forces the same keys in `fr`.
const en = {
  /** h1. `{path}` is the address that failed, set in its own span */
  title: "The application “{path}” can’t be opened.",
  body: "There’s no app at this address. It may have moved, been renamed, or never existed. Everything else in emOS is right where you left it.",
  /** when the address looks like a typo of a real app */
  bodySuggest: "There’s no app at this address. Did you mean {app}?",
  desktop: "Go to Desktop",
  search: "Search emOS",
  open: "Open {app}",
  /** the glass cursor's label over the draggable alert */
  drag: "Drag",
  /** the little zsh transcript */
  console: "Terminal",
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
  title: "L’application « {path} » ne peut pas être ouverte.",
  body: "Aucune app à cette adresse. Elle a peut-être déménagé, changé de nom, ou n’a jamais existé. Tout le reste d’emOS est là où vous l’avez laissé.",
  bodySuggest: "Aucune app à cette adresse. Vouliez-vous dire {app} ?",
  desktop: "Aller au Bureau",
  search: "Rechercher",
  open: "Ouvrir {app}",
  drag: "Glisser",
  console: "Terminal",
  answers: {
    y: "Oui, ouvrir {app}",
    n: "Non",
    a: "Annuler",
    e: "Modifier : chercher dans emOS",
  },
  seo: {
    homeAlt: "« Elliot Moreau » en lettres de pixels sur un ciel de nuit étoilé : {tagline}",
    appAlt: "{app}, par Elliot Moreau : l’icône de l’app en pixels sur un ciel de nuit étoilé. {description}",
    jobTitle: "Développeur logiciel",
  },
};

export default { en, fr };
