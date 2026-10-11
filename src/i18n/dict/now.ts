// Strings for the Now app (/now). Hand-written content (focus, books,
// setup…) lives in src/content/now.ts; this file is UI copy only.
// Templates use {placeholders}; values stay plain strings.
const en = {
  kicker: "What I’m up to",
  live: "Live",
  /** the headline; {doing} comes from content (e.g. "building emOS") */
  sentence: {
    playing: "Right now I’m {doing}, listening to {track}, and it’s {time} in Paris.",
    paused: "Right now I’m {doing}, with {track} on pause, and it’s {time} in Paris.",
    quiet: "Right now I’m {doing}, and it’s {time} in Paris.",
  },
  whatIs: "What’s a now page?",
  updated: "Updated {date}",
  today: "today",
  yesterday: "yesterday",
  daysAgo: "{n} days ago",

  board: {
    label: "Dashboard",
    arrange: "Arrange",
    done: "Done",
    reset: "Reset layout",
    hintFine: "Drag any widget to rearrange.",
    hintTouch: "Touch and hold a widget to move it.",
    hintArrange: "Drag the handles, or use the keyboard.",
    saved: "Layout saved on this device",
    move: "Move {name}",
    grab: "Move",
    instructions: "Press Space to pick it up. Arrow keys move it, Space drops it, Escape cancels.",
    picked: "Picked up {name}. Position {pos} of {total}.",
    moved: "{name}, position {pos} of {total}.",
    dropped: "{name} dropped at position {pos} of {total}.",
    cancelled: "Move cancelled. {name} is back at position {pos}.",
    resetDone: "Layout reset.",
  },

  widgets: {
    listening: "Listening",
    here: "Here & now",
    building: "Building",
    pulse: "Pulse",
    setup: "Setup",
    reading: "Reading & learning",
    writing: "Writing",
  },

  listening: {
    playing: "Playing",
    paused: "Paused",
    last: "Last played",
    progress: "{elapsed} of {total}",
    open: "Open “{title}” on Spotify",
    topArtists: "Top artists · last 6 months",
    nothing: "Nothing playing right now.",
    nothingBody: "When something’s on, it shows up here as it plays.",
    profile: "Spotify profile",
  },

  here: {
    sky: "{phase} in Paris",
    pinned: "{phase}, pinned",
    phases: { dawn: "Dawn", day: "Day", dusk: "Dusk", night: "Night" },
    forYou: "It’s {here} here, {you} for you.",
    same: "Same time zone as you.",
    ahead: "Paris is {n} ahead of you.",
    behind: "Paris is {n} behind you.",
    clockLabel: "Paris time",
  },

  building: {
    focus: "Focus",
    source: "Source",
    sourceOf: "{name} source code on GitHub",
    lastPush: "Last push",
    recent: "Recent repos",
    pushedTo: "Pushed to {repo}",
    /** the last push, read aloud */
    pushLabel: "Pushed to {repo}: {message}",
    none: "No public pushes lately.",
    all: "All projects",
  },

  pulse: {
    caption: "Each blip is a real, timestamped event: the latest push to each repo, and every post. Newest on the right.",
    push: "Push",
    post: "Post",
    now: "Now",
    pushTo: "Pushed to {name}",
    published: "Published “{name}”",
    ticks: { day: "1 day", week: "1 wk", month: "1 mo", quarter: "3 mo", half: "6 mo", year: "1 yr" },
    empty: "Nothing public to show yet.",
  },

  setup: {
    caption: "Copied by hand from my machine.",
    langs: "Languages",
    palette: "Nocturne palette",
  },

  reading: {
    books: "Reading",
    learning: "Learning",
    status: { reading: "reading", rereading: "rereading", next: "up next", finished: "finished" },
    none: "Nothing on the nightstand.",
  },

  writing: {
    drafting: "Drafting",
    draft: "draft",
    latest: "Latest post",
    minutes: "{n} min read",
    read: "Read “{title}” on the blog",
    all: "All writing",
    none: "Nothing published yet.",
    blog: "Visit the blog",
  },

  footer: {
    sources: "Music from Spotify, pushes from GitHub, posts from the blog.",
  },
};

const fr: typeof en = {
  kicker: "Ce qui m’occupe",
  live: "En direct",
  sentence: {
    playing: "Ces jours-ci, {doing}, j’écoute {track}, et il est {time} à Paris.",
    paused: "Ces jours-ci, {doing}, j’ai mis {track} en pause, et il est {time} à Paris.",
    quiet: "Ces jours-ci, {doing}, et il est {time} à Paris.",
  },
  whatIs: "C’est quoi, une page /now\u202f?",
  updated: "Mis à jour le {date}",
  today: "aujourd’hui",
  yesterday: "hier",
  daysAgo: "il y a {n} jours",

  board: {
    label: "Tableau de bord",
    arrange: "Organiser",
    done: "OK",
    reset: "Réinitialiser la disposition",
    hintFine: "Faites glisser un widget pour le déplacer.",
    hintTouch: "Maintenez un widget appuyé pour le déplacer.",
    hintArrange: "Utilisez les poignées, ou le clavier.",
    saved: "Disposition enregistrée sur cet appareil",
    move: "Déplacer {name}",
    grab: "Déplacer",
    instructions: "Espace pour le saisir. Les flèches le déplacent, Espace le pose, Échap annule.",
    picked: "{name} saisi. Position {pos} sur {total}.",
    moved: "{name}, position {pos} sur {total}.",
    dropped: "{name} posé en position {pos} sur {total}.",
    cancelled: "Déplacement annulé. {name} revient en position {pos}.",
    resetDone: "Disposition réinitialisée.",
  },

  widgets: {
    listening: "En écoute",
    here: "Ici et maintenant",
    building: "En chantier",
    pulse: "Pouls",
    setup: "Ma config",
    reading: "Lire, apprendre",
    writing: "Écriture",
  },

  listening: {
    playing: "En lecture",
    paused: "En pause",
    last: "Dernière écoute",
    progress: "{elapsed} sur {total}",
    open: "Ouvrir «\u00a0{title}\u00a0» sur Spotify",
    topArtists: "Artistes favoris · 6 derniers mois",
    nothing: "Rien en lecture pour l’instant.",
    nothingBody: "Dès que la musique tourne, elle s’affiche ici en direct.",
    profile: "Profil Spotify",
  },

  here: {
    sky: "{phase} à Paris",
    pinned: "{phase}, épinglé",
    phases: { dawn: "Aube", day: "Jour", dusk: "Crépuscule", night: "Nuit" },
    forYou: "Il est {here} ici, {you} chez vous.",
    same: "Nous sommes sur le même fuseau.",
    ahead: "Paris a {n} d’avance sur vous.",
    behind: "Paris a {n} de retard sur vous.",
    clockLabel: "Heure de Paris",
  },

  building: {
    focus: "Priorité",
    source: "Code source",
    sourceOf: "Code source de {name} sur GitHub",
    lastPush: "Dernier push",
    recent: "Dépôts récents",
    pushedTo: "Push sur {repo}",
    pushLabel: "Push sur {repo}\u202f: {message}",
    none: "Aucun push public récemment.",
    all: "Tous les projets",
  },

  pulse: {
    caption: "Chaque pic est un vrai événement daté\u202f: le dernier push de chaque dépôt, et chaque article. Le plus récent à droite.",
    push: "Push",
    post: "Article",
    now: "Maintenant",
    pushTo: "Push sur {name}",
    published: "Publié\u202f: «\u00a0{name}\u00a0»",
    ticks: { day: "1 jour", week: "1 sem.", month: "1 mois", quarter: "3 mois", half: "6 mois", year: "1 an" },
    empty: "Rien de public à montrer pour l’instant.",
  },

  setup: {
    caption: "Recopié à la main depuis ma machine.",
    langs: "Langages",
    palette: "Palette Nocturne",
  },

  reading: {
    books: "Je lis",
    learning: "J’apprends",
    status: { reading: "en cours", rereading: "relecture", next: "à suivre", finished: "terminé" },
    none: "Rien sur la table de chevet.",
  },

  writing: {
    drafting: "En brouillon",
    draft: "brouillon",
    latest: "Dernier article",
    minutes: "{n} min de lecture",
    read: "Lire «\u00a0{title}\u00a0» sur le blog",
    all: "Tous les textes",
    none: "Rien de publié pour l’instant.",
    blog: "Voir le blog",
  },

  footer: {
    sources: "Musique via Spotify, pushs via GitHub, articles via le blog.",
  },
};

const now = { en, fr };
export default now;
