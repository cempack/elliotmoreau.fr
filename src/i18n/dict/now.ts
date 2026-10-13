// Strings for the Now app (/now). Hand-written content (focus, books,
// drafts…) lives in the database (seeded from src/content/now.ts, edited in
// the admin panel); this file is UI copy only.
// Templates use {placeholders}; values stay plain strings.
const en = {
  kicker: "What I’m up to",
  live: "Live",
  /** the headline; {doing} comes from content (e.g. "building emOS") */
  sentence: {
    playing: "Right now I’m {doing}, listening to {track}, and it’s {time} in Toulouse.",
    paused: "Right now I’m {doing}, with {track} on pause, and it’s {time} in Toulouse.",
    quiet: "Right now I’m {doing}, and it’s {time} in Toulouse.",
  },
  day: {
    label: "Today in Toulouse",
    slider: "Today in Toulouse: drag to go back in the day",
    hint: "Drag the sun",
    nowAt: "now {time}",
    back: "Back to now",
    earlier: "Earlier in the day",
    later: "Later in the day",
    summary: "Today so far: {songs} and {pushes}. Drag the sun to go back.",
    songOne: "one song",
    songs: "{n} songs",
    pushOne: "one push",
    pushes: "{n} pushes",
    empty: "Nothing played or pushed yet today.",
    both: "At {time} I was listening to {track} by {artist}, and pushing “{msg}” to {repo}.",
    track: "At {time} I was listening to {track} by {artist}.",
    push: "At {time} I was pushing “{msg}” to {repo}.",
    none: "At {time}, nothing playing and nothing pushed.",
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
    building: "Building",
    pulse: "Activity",
    reading: "Reading & learning",
    writing: "Blog",
  },

  listening: {
    playing: "Playing",
    paused: "Paused",
    last: "Last played",
    progress: "{elapsed} of {total}",
    open: "Open “{title}” on Spotify",
    topArtists: "Top artists · last 6 months",
    crateHint: "Swipe sideways, use the buttons or the arrow keys to go through them. Enter opens the artist on Spotify.",
    cratePrev: "Previous artist",
    crateNext: "Next artist",
    crateOpen: "Open {name} on Spotify",
    nothing: "Nothing playing right now.",
    nothingBody: "When something’s on, it shows up here as it plays.",
    profile: "Spotify profile",
  },


  building: {
    sourceOf: "{name} source code on GitHub",
    lastPush: "Last push",
    pushedTo: "Pushed to {repo}",
    /** the last push, read aloud */
    pushLabel: "Pushed to {repo}: {message}",
    none: "No public pushes lately.",
  },

  pulse: {
    unit: "pushes",
    unitOne: "push",
    /** under the big number: "214 pushes since 14 July" */
    since: "{unit} since {date}",
    /** a day picked on the chart: "3 pushes on Tue 7 Oct" */
    on: "{unit} on {date}",
    busiest: "Busiest day",
    longest: "Longest run",
    days: "{n} days",
    dayOne: "1 day",
    today: "Today",
    label: "Public pushes per day since {date}. The arrow keys read each day.",
    empty: "Nothing public to show yet.",
  },

  reading: {
    books: "Reading",
    learning: "Learning",
    status: { reading: "reading", rereading: "rereading", next: "up next", finished: "finished" },
    none: "Nothing on the nightstand.",
  },

  writing: {
    drafting: "Drafting",
    latest: "Latest post",
    minutes: "{n} min read",
    read: "Read “{title}” on the blog",
    all: "All posts",
    none: "Nothing published yet.",
    blog: "Visit the blog",
    cadence: "Last 12 months",
    month: "{month}: {n} posts",
    monthOne: "{month}: 1 post",
    earlier: "Earlier",
  },

  footer: {
    sources: "Music from Spotify, pushes from GitHub, posts from the blog.",
  },
};

const fr: typeof en = {
  kicker: "Ce qui m’occupe",
  live: "En direct",
  sentence: {
    playing: "Ces jours-ci, {doing}, j’écoute {track}, et il est {time} à Toulouse.",
    paused: "Ces jours-ci, {doing}, j’ai mis {track} en pause, et il est {time} à Toulouse.",
    quiet: "Ces jours-ci, {doing}, et il est {time} à Toulouse.",
  },
  day: {
    label: "Aujourd’hui à Toulouse",
    slider: "Aujourd’hui à Toulouse : glissez pour remonter dans la journée",
    hint: "Faites glisser le soleil",
    nowAt: "maintenant {time}",
    back: "Revenir à maintenant",
    earlier: "Plus tôt dans la journée",
    later: "Plus tard dans la journée",
    summary: "Aujourd’hui pour l’instant : {songs} et {pushes}. Faites glisser le soleil pour remonter le temps.",
    songOne: "un morceau",
    songs: "{n} morceaux",
    pushOne: "un push",
    pushes: "{n} pushs",
    empty: "Rien écouté ni poussé pour l’instant aujourd’hui.",
    both: "À {time}, j’écoutais {track} de {artist}, et je poussais « {msg} » sur {repo}.",
    track: "À {time}, j’écoutais {track} de {artist}.",
    push: "À {time}, je poussais « {msg} » sur {repo}.",
    none: "À {time}, rien en lecture et rien de poussé.",
  },
  whatIs: "C’est quoi, une page /now ?",
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
    building: "En chantier",
    pulse: "Activité",
    reading: "Lire, apprendre",
    writing: "Blog",
  },

  listening: {
    playing: "En lecture",
    paused: "En pause",
    last: "Dernière écoute",
    progress: "{elapsed} sur {total}",
    open: "Ouvrir « {title} » sur Spotify",
    topArtists: "Artistes favoris · 6 derniers mois",
    crateHint: "Glissez de côté, utilisez les boutons ou les flèches pour les parcourir. Entrée ouvre l’artiste sur Spotify.",
    cratePrev: "Artiste précédent",
    crateNext: "Artiste suivant",
    crateOpen: "Ouvrir {name} sur Spotify",
    nothing: "Rien en lecture pour l’instant.",
    nothingBody: "Dès que la musique tourne, elle s’affiche ici en direct.",
    profile: "Profil Spotify",
  },


  building: {
    sourceOf: "{name} : code source sur GitHub",
    lastPush: "Dernier push",
    pushedTo: "Push sur {repo}",
    pushLabel: "Push sur {repo} : {message}",
    none: "Aucun push public récemment.",
  },

  pulse: {
    unit: "pushs",
    unitOne: "push",
    since: "{unit} depuis le {date}",
    on: "{unit} le {date}",
    busiest: "Jour le plus actif",
    longest: "Plus longue série",
    days: "{n} jours",
    dayOne: "1 jour",
    today: "Aujourd’hui",
    label: "Pushs publics par jour depuis le {date}. Les flèches lisent chaque jour.",
    empty: "Rien de public à montrer pour l’instant.",
  },

  reading: {
    books: "Je lis",
    learning: "J’apprends",
    status: { reading: "en cours", rereading: "relecture", next: "à suivre", finished: "terminé" },
    none: "Rien sur la table de chevet.",
  },

  writing: {
    drafting: "En brouillon",
    latest: "Dernier article",
    minutes: "{n} min de lecture",
    read: "Lire « {title} » sur le blog",
    all: "Tous les articles",
    none: "Rien de publié pour l’instant.",
    blog: "Voir le blog",
    cadence: "Les 12 derniers mois",
    month: "{month} : {n} articles",
    monthOne: "{month} : 1 article",
    earlier: "Avant",
  },

  footer: {
    sources: "Musique via Spotify, pushs via GitHub, articles via le blog.",
  },
};

const now = { en, fr };
export default now;
