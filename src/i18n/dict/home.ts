// Strings for the home Desktop (the first screen of `/`). Owned by the
// home-desktop builder: add keys to `en` and the type forces the same keys
// in `fr`. Plain strings only (the dict crosses the server → client
// boundary); templates use {placeholders}.
const en = {
  /** the page heading (the pixel wordmark is decorative) */
  name: "Elliot Moreau",
  desktop: "Desktop",
  hello: {
    greeting: "Hi, I’m Elliot.",
    lead: "Developer in Toulouse. I build web apps, small tools and Omarchy themes, and write about how they’re made.",
    work: "See the work",
    contact: "Say hello",
  },
  widgets: {
    label: "Widgets",
    clock: {
      title: "Toulouse",
      phase: { dawn: "Dawn", day: "Day", dusk: "Dusk", night: "Night" },
      /** the next change of light, Toulouse time */
      events: { sunrise: "Sunrise {time}", sunset: "Sunset {time}", night: "Nightfall {time}" },
      /** the visitor's own time, when it differs */
      you: "you {time}",
      /** the sky pinned in Control Center */
      pinnedLine: "Sky pinned: {phase}",
      /** Toulouse's weather now (the wallpaper shows it too) */
      weather: { clear: "Clear, {temp}°", cloudy: "Cloudy, {temp}°", rain: "Rain, {temp}°", fog: "Fog, {temp}°", autan: "Autan, {wind} km/h" },
      weatherAria: "Weather in Toulouse: {weather}.",
      aria: "Toulouse time {time}, {phase}. {next}.",
      ariaYou: "Your time {time}, {offset} from Toulouse.",
      open: "Open {app}.",
      /** the sundial is a slider over today's sun */
      slider: "Sun over Toulouse",
      valueText: "{time}, {phase} in Toulouse",
      hint: "Drag the shadow, or use the arrow keys, to move the sun across today. Page keys jump to sunrise, noon, sunset and nightfall; Home comes back to now.",
    },
    post: {
      title: "Latest post",
      /** reading time (spoken, then shown) */
      minutes: "{n} min read",
      minutesShort: "{n} min",
      empty: "The first post is on its way.",
      blog: "blog.elliotmoreau.fr",
      aria: "{title}, {minutes}, {date}. Open in Writing.",
      ariaEmpty: "No posts yet. Open Writing.",
      /** the poster's kicker: under a week old, or its tag */
      kickerNew: "New",
      kickerPost: "Post",
      prev: "Previous post",
      next: "Next post",
      hint: "The latest posts, stacked like newsstand posters. Left and right arrows flip through them; Enter opens one.",
    },
    /** the last push: a wall of Toulouse brick, one brick per day */
    push: {
      wall: "Public pushes, last 13 weeks",
      wallRole: "brick wall",
      last: "Last push to {repo}, {ago}",
      hint: "Each brick is a day; the redder, the more pushes. Arrow keys move by day (up and down) and by week (left and right); Enter opens that repo in Projects.",
      none: "No public push that day",
      dayOne: "{date}, 1 push to {repo}",
      dayMany: "{date}, {n} pushes to {repo}",
      dayNone: "{date}",
      empty: "No public pushes in the last 90 days.",
    },
  },
  icons: {
    label: "Desktop icons",
    readme: "README",
    search: "Search",
    untitled: "Untitled",
    draftHint: "Your unsent letter: open it in Mail",
    hint: "Double-click or press Enter to open. Drag to rearrange.",
    hintTouch: "Tap to open. Touch and hold to move.",
    hintPhone: "Tap to open.",
    /** announced when a sweep or ⌘A selects more than one icon */
    selected: "{n} icons selected",
  },
};

const fr: typeof en = {
  name: "Elliot Moreau",
  desktop: "Bureau",
  hello: {
    greeting: "Salut, moi c’est Elliot.",
    lead: "Développeur à Toulouse. Je fais des applis web, de petits outils et des thèmes Omarchy, et j’écris sur leur fabrication.",
    work: "Voir mes projets",
    contact: "Dire bonjour",
  },

  widgets: {
    label: "Widgets",
    clock: {
      title: "Toulouse",
      phase: { dawn: "Aube", day: "Jour", dusk: "Crépuscule", night: "Nuit" },
      events: { sunrise: "Lever {time}", sunset: "Coucher {time}", night: "Nuit à {time}" },
      you: "chez vous {time}",
      pinnedLine: "Ciel épinglé : {phase}",
      weather: { clear: "Dégagé, {temp}°", cloudy: "Nuageux, {temp}°", rain: "Pluie, {temp}°", fog: "Brouillard, {temp}°", autan: "Autan, {wind} km/h" },
      weatherAria: "Météo à Toulouse : {weather}.",
      aria: "Heure de Toulouse {time}, {phase}. {next}.",
      ariaYou: "Chez vous {time}, {offset} par rapport à Toulouse.",
      open: "Ouvrir {app}.",
      slider: "Soleil sur Toulouse",
      valueText: "{time}, {phase} à Toulouse",
      hint: "Faites glisser l’ombre, ou utilisez les flèches, pour déplacer le soleil sur la journée. Les touches Page sautent au lever, à midi, au coucher et à la nuit ; Début revient à maintenant.",
    },
    post: {
      title: "Dernier article",
      minutes: "{n} min de lecture",
      minutesShort: "{n} min",
      empty: "Le premier article arrive bientôt.",
      blog: "blog.elliotmoreau.fr",
      aria: "{title}, {minutes}, {date}. Ouvrir dans Écrits.",
      ariaEmpty: "Pas encore d’article. Ouvrir Écrits.",
      kickerNew: "Nouveau",
      kickerPost: "Article",
      prev: "Article précédent",
      next: "Article suivant",
      hint: "Les derniers articles, empilés comme des affiches de kiosque. Les flèches gauche et droite les feuillettent ; Entrée en ouvre un.",
    },
    push: {
      wall: "Pushs publics, 13 dernières semaines",
      wallRole: "mur de briques",
      last: "Dernier push sur {repo}, {ago}",
      hint: "Chaque brique est un jour ; plus elle est rouge, plus il y a eu de pushs. Les flèches avancent d’un jour (haut et bas) ou d’une semaine (gauche et droite) ; Entrée ouvre le dépôt dans Projets.",
      none: "Aucun push public ce jour-là",
      dayOne: "{date}, 1 push sur {repo}",
      dayMany: "{date}, {n} pushs sur {repo}",
      dayNone: "{date}",
      empty: "Aucun push public ces 90 derniers jours.",
    },
  },
  icons: {
    label: "Icônes du bureau",
    readme: "LISEZ-MOI",
    search: "Recherche",
    untitled: "Sans titre",
    draftHint: "Votre lettre pas encore envoyée : l’ouvrir dans Mail",
    hint: "Double-cliquez ou appuyez sur Entrée pour ouvrir. Faites glisser pour ranger.",
    hintTouch: "Touchez pour ouvrir. Maintenez le doigt pour déplacer.",
    hintPhone: "Touchez pour ouvrir.",
    selected: "{n} icônes sélectionnées",
  },
};

const home = { en, fr };
export default home;
