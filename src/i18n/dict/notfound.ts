// Strings for the notfound app (the 404 alert) and the site's SEO surfaces
// (share-image alt text, structured data). Owned by the notfound-seo
// builder: add keys to `en` and the type forces the same keys in `fr`.
// French typography: U+202F (narrow no-break space) inside « » and
// before : ; ? !, so no line ever starts with a lone mark; U+2011
// (no-break hyphen) in "Vouliez‑vous", which must never break.
const en = {
  /** h1. `{path}` is the address that failed, set in its own span */
  title: "The application “{path}” can’t be opened.",
  body: "Nothing lives at this address.",
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
  going: "Taking you to {target} in {n}…",
  stay: "Stay",
  /** under the app in pieces, while it's apart */
  rebuild: "Drag right to put it back together",
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
  /** the network map below the alert: the site as a metro diagram */
  map: {
    title: "network map",
    label: "Network map of emOS",
    cue: "Network map",
    here: "YOU ARE HERE",
    notServed: "Station not served",
    search: "search",
    blog: "blog",
    river: "Garonne",
    status: "no such page: {path}",
    nearest: "nearest: {name}",
    ride: "Ride to {name}",
    hint: "Pick a station and ride there.",
  },
  seo: {
    /** share-image alt text */
    homeAlt: "“Elliot Moreau” in pixel letters: {tagline}",
    appAlt: "{app}, by Elliot Moreau: the app’s pixel icon. {description}",
  },
};

const fr: typeof en = {
  title: "L’application « {path} » ne peut pas être ouverte.",
  body: "Rien à cette adresse.",
  bodySuggest: "Aucune app à cette adresse. Vouliez‑vous dire {app} ?",
  bodyPost: "Les articles ont déménagé sur le blog. Vouliez‑vous dire « {name} » ?",
  bodyRepo: "On dirait l’un des dépôts d’Elliot. Vouliez‑vous dire {name} ?",
  desktop: "Aller au Bureau",
  search: "Rechercher",
  open: "Ouvrir {app}",
  read: "Lire « {name} »",
  openRepo: "Ouvrir {name} sur GitHub",
  drag: "Déplacez-moi",
  going: "Direction {target} dans {n}…",
  stay: "Rester",
  rebuild: "Glissez vers la droite pour le recoller",
  console: "Terminal",
  answerGroup: "Répondre à zsh",
  answers: {
    y: "Oui, ouvrir {app}",
    n: "Non",
    a: "Annuler",
    e: "Modifier : chercher dans emOS",
  },
  map: {
    title: "plan du réseau",
    label: "Plan du réseau emOS",
    cue: "Plan du réseau",
    here: "VOUS ÊTES ICI",
    notServed: "Station non desservie",
    search: "rechercher",
    blog: "blog",
    river: "Garonne",
    status: "page introuvable : {path}",
    nearest: "la plus proche : {name}",
    ride: "Aller à {name}",
    hint: "Choisissez une station pour y aller.",
  },
  seo: {
    homeAlt: "« Elliot Moreau » en lettres de pixels sur un ciel de nuit étoilé : {tagline}",
    appAlt: "{app}, par Elliot Moreau : l’icône de l’app en pixels. {description}",
  },
};

const notfound = { en, fr };
export default notfound;
