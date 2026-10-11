// Strings for the home Desktop (the first screen of `/`). Owned by the
// home-desktop builder: add keys to `en` and the type forces the same keys
// in `fr`. Plain strings only (the dict crosses the server → client
// boundary); templates use {placeholders}.
const en = {
  /** the page heading (the pixel wordmark is decorative) */
  name: "Elliot Moreau",
  desktop: "Desktop",
  hero: {
    /** the glass cursor's label over the letters */
    cursor: "Replay",
  },
  hello: {
    file: "hello.txt",
    path: "~/Desktop",
    greeting: "Hi, I’m Elliot.",
    lead: "Developer in France. I build software and small tools that feel good to use, then write up how they were made. Between projects I’m usually somewhere new, headphones on.",
    work: "See the work",
    contact: "Say hello",
    close: "Close hello.txt",
    minimize: "Tuck hello.txt into the README",
    status: "Live status",
    /** "pushed 2h ago" */
    pushed: "pushed {ago}",
    openRepo: "{repo} on GitHub",
    /** the latest-post chip (narrow desks, where its widget is hidden) */
    post: "new post",
    openPost: "Latest post: {title}, {ago}. Open in Writing.",
    /** the places chip: "6 places → Japan" */
    places: "{n} places",
    openAtlas: "{n} places visited. Open Atlas.",
    openAtlasNext: "{n} places visited, {next} next. Open Atlas.",
  },
  widgets: {
    label: "Widgets",
    clock: {
      title: "Paris",
      phase: { dawn: "Dawn", day: "Day", dusk: "Dusk", night: "Night" },
      /** the phase that comes next and when it starts, Paris time */
      next: { dawn: "Dawn at {time}", day: "Day at {time}", dusk: "Dusk at {time}", night: "Night at {time}" },
      aria: "Paris time {time}, {phase}. {next}.",
      ariaYou: "Your time {time}, {offset} from Paris.",
      /** the sky pinned in Control Center: the phase line says so */
      pinned: "pinned",
      /** …and the second line keeps the real phase in Paris */
      real: "Paris: {phase}",
      ariaPinned: "Paris time {time}. The sky is pinned to {pinned}; in Paris it is {phase}.",
      /** the badge by the visitor's tick on the dial */
      you: "you",
      open: "Open {app}.",
    },
    post: {
      title: "Latest post",
      /** reading time (spoken, then shown) */
      minutes: "{n} min read",
      minutesShort: "{n} min",
      empty: "The first post is on its way.",
      blog: "blog.elliotmoreau.fr",
      aria: "Latest post: {title}, {minutes}, {ago}. Open in Writing.",
      ariaEmpty: "No posts yet. Open Writing.",
    },
    /** the phone's widget pages */
    page: "Widget page {n} of {total}",
    /** the last push (phones, beside the clock) */
    push: {
      title: "Last push",
      aria: "Last push to {repo}, {ago}: {message}. Open on GitHub.",
      empty: "No public pushes lately.",
      ariaEmpty: "No public pushes lately. Open GitHub.",
    },
  },
  icons: {
    label: "Desktop icons",
    readme: "README",
    search: "Search",
    hint: "Double-click or press Enter to open. Drag to rearrange.",
    hintTouch: "Tap to open. Touch and hold to move.",
    hintPhone: "Tap to open.",
    /** announced when a sweep or ⌘A selects more than one icon */
    selected: "{n} icons selected",
  },
  scroll: {
    label: "Scroll",
    aria: "Scroll to the story",
  },
};

const fr: typeof en = {
  name: "Elliot Moreau",
  desktop: "Bureau",
  hero: {
    cursor: "Rejouer",
  },
  hello: {
    file: "hello.txt",
    path: "~/Bureau",
    greeting: "Salut, moi c’est Elliot.",
    lead: "Développeur en France. Je crée des logiciels et de petits outils agréables à utiliser, puis je raconte comment ils sont nés. Entre deux projets, je bourlingue, casque sur les oreilles.",
    work: "Voir mes projets",
    contact: "Dire bonjour",
    close: "Fermer hello.txt",
    minimize: "Ranger hello.txt dans le LISEZ-MOI",
    status: "En direct",
    pushed: "pushé {ago}",
    openRepo: "{repo} sur GitHub",
    post: "nouvel article",
    openPost: "Dernier article : {title}, {ago}. Ouvrir dans Écrits.",
    places: "{n} lieux",
    openAtlas: "{n} lieux visités. Ouvrir Atlas.",
    openAtlasNext: "{n} lieux visités, prochain : {next}. Ouvrir Atlas.",
  },
  widgets: {
    label: "Widgets",
    clock: {
      title: "Paris",
      phase: { dawn: "Aube", day: "Jour", dusk: "Crépuscule", night: "Nuit" },
      next: { dawn: "Aube à {time}", day: "Jour à {time}", dusk: "Crépuscule à {time}", night: "Nuit à {time}" },
      aria: "Heure de Paris {time}, {phase}. {next}.",
      ariaYou: "Chez vous {time}, {offset} par rapport à Paris.",
      pinned: "épinglé",
      real: "Paris : {phase}",
      ariaPinned: "Heure de Paris {time}. Le ciel est épinglé sur {pinned} ; à Paris, c’est {phase}.",
      you: "vous",
      open: "Ouvrir {app}.",
    },
    post: {
      title: "Dernier article",
      minutes: "{n} min de lecture",
      minutesShort: "{n} min",
      empty: "Le premier article arrive bientôt.",
      blog: "blog.elliotmoreau.fr",
      aria: "Dernier article : {title}, {minutes}, {ago}. Ouvrir dans Écrits.",
      ariaEmpty: "Pas encore d’article. Ouvrir Écrits.",
    },
    page: "Page de widgets {n} sur {total}",
    push: {
      title: "Dernier push",
      aria: "Dernier push sur {repo}, {ago} : {message}. Ouvrir sur GitHub.",
      empty: "Pas de push public ces temps-ci.",
      ariaEmpty: "Pas de push public ces temps-ci. Ouvrir GitHub.",
    },
  },
  icons: {
    label: "Icônes du bureau",
    readme: "LISEZ-MOI",
    search: "Recherche",
    hint: "Double-cliquez ou appuyez sur Entrée pour ouvrir. Faites glisser pour ranger.",
    hintTouch: "Touchez pour ouvrir. Maintenez le doigt pour déplacer.",
    hintPhone: "Touchez pour ouvrir.",
    selected: "{n} icônes sélectionnées",
  },
  scroll: {
    label: "Défiler",
    aria: "Faire défiler jusqu’à la suite",
  },
};

const home = { en, fr };
export default home;
