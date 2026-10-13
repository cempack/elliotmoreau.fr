// Strings for the work app (Projects: what Elliot has made, for anyone).
// Plain strings only: the dict crosses the server → client boundary.
// Templates use {placeholders}; plurals come as `…One` / `…Other` pairs
// (French uses the singular for 0 and 1).
const en = {
  title: "Things I’ve made",
  lede: "Apps, games and small tools I’ve built. Pick one to see what it does.",
  listLabel: "Projects",
  kinds: {
    app: { one: "App", group: "Apps and websites", gloss: "" },
    game: { one: "Game", group: "Games", gloss: "" },
    desktop: {
      one: "Desktop add-on",
      group: "For my Linux desktop",
      gloss: "Omarchy is the Linux desktop I use every day. These add small tools to the bar at the top of its screen, or change how it looks.",
    },
    tool: {
      one: "Tool",
      group: "Tools",
      gloss: "A small program that does one job on a computer, so nobody has to do it by hand.",
    },
    lab: { one: "Experiment", group: "Experiments", gloss: "Something I made to try an idea." },
  },
  actions: {
    open: "Open it",
    play: "Play it",
    get: "Get the add-on",
    code: "See it on GitHub",
    /** the second button, when the first one isn't GitHub */
    source: "How it’s made",
    newTab: "(opens in a new tab)",
  },
  facts: {
    updated: "Last worked on",
    madeWith: "Made with",
    saved: "Saved by",
    savedOne: "{n} person",
    savedOther: "{n} people",
  },
  ago: {
    today: "Today",
    yesterday: "Yesterday",
    daysOne: "{n} day ago",
    daysOther: "{n} days ago",
    weeksOne: "{n} week ago",
    weeksOther: "{n} weeks ago",
    monthsOne: "{n} month ago",
    monthsOther: "{n} months ago",
    yearsOne: "Over a year ago",
    yearsOther: "{n} years ago",
  },
  shot: "Screenshot of {name}",
  scene: "A drawing of {kind}",
  steps: "Other projects",
  prev: "Previous",
  next: "Next",
  labelled: "{label}: {value}",
  all: "Everything is on GitHub",
  allLabel: "All of Elliot’s code on GitHub (opens in a new tab)",
  offlineTitle: "GitHub is out of reach",
  offlineBody: "The projects couldn’t load just now. They all still live on GitHub.",
  openProfile: "Open github.com/cempack",
};

const fr: typeof en = {
  title: "Ce que j’ai fait",
  lede: "Des applis, des jeux et des petits outils que j’ai construits. Choisissez-en un pour voir à quoi il sert.",
  listLabel: "Projets",
  kinds: {
    app: { one: "Appli", group: "Applis et sites", gloss: "" },
    game: { one: "Jeu", group: "Jeux", gloss: "" },
    desktop: {
      one: "Module de bureau",
      group: "Pour mon bureau Linux",
      gloss: "Omarchy est le bureau Linux que j’utilise tous les jours. Ces modules ajoutent des petits outils à la barre en haut de l’écran, ou changent son apparence.",
    },
    tool: {
      one: "Outil",
      group: "Outils",
      gloss: "Un petit programme qui fait une tâche sur un ordinateur, pour que personne n’ait à la faire à la main.",
    },
    lab: { one: "Expérience", group: "Expériences", gloss: "Quelque chose que j’ai fait pour essayer une idée." },
  },
  actions: {
    open: "L’ouvrir",
    play: "Y jouer",
    get: "Installer le module",
    code: "Voir sur GitHub",
    source: "Comment c’est fait",
    newTab: "(s’ouvre dans un nouvel onglet)",
  },
  facts: {
    updated: "Dernière retouche",
    madeWith: "Fait avec",
    saved: "Favori de",
    savedOne: "{n} personne",
    savedOther: "{n} personnes",
  },
  ago: {
    today: "Aujourd’hui",
    yesterday: "Hier",
    daysOne: "Il y a {n} jour",
    daysOther: "Il y a {n} jours",
    weeksOne: "Il y a {n} semaine",
    weeksOther: "Il y a {n} semaines",
    monthsOne: "Il y a {n} mois",
    monthsOther: "Il y a {n} mois",
    yearsOne: "Il y a plus d’un an",
    yearsOther: "Il y a {n} ans",
  },
  shot: "Capture d’écran de {name}",
  scene: "Un dessin : {kind}",
  steps: "Autres projets",
  prev: "Précédent",
  next: "Suivant",
  labelled: "{label} : {value}",
  all: "Tout est sur GitHub",
  allLabel: "Tout le code d’Elliot sur GitHub (s’ouvre dans un nouvel onglet)",
  offlineTitle: "GitHub est injoignable",
  offlineBody: "Les projets n’ont pas pu se charger. Ils sont tous toujours sur GitHub.",
  openProfile: "Ouvrir github.com/cempack",
};

const work = { en, fr };
export default work;
