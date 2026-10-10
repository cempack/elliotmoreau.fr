// Strings for the home Desktop (the first screen of `/`). Owned by the
// home-desktop builder: add keys to `en` and the type forces the same keys
// in `fr`. Plain strings only (the dict crosses the server → client
// boundary); templates use {placeholders}.
const en = {
  /** the page heading (the pixel wordmark is decorative) */
  name: "Elliot Moreau",
  desktop: "Desktop",
  hero: {
    replay: "Click to replay",
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
    nowPlaying: "Now playing",
    lastPlayed: "Last played",
    /** "{time} in Paris" */
    paris: "{time} in Paris",
    /** "Pushed {ago}" */
    pushed: "pushed {ago}",
    openSpotify: "{title} by {artist}, open in Spotify",
    openRepo: "{repo} on GitHub",
  },
  widgets: {
    label: "Widgets",
    clock: {
      title: "Paris",
      phase: { dawn: "Dawn", day: "Day", dusk: "Dusk", night: "Night" },
      /** the phase that comes next and when it starts, Paris time */
      next: { dawn: "Dawn at {time}", day: "Day at {time}", dusk: "Dusk at {time}", night: "Night at {time}" },
      you: "you {offset}",
      aria: "Paris time {time}, {phase}. {next}.",
      ariaYou: "Your time {time}, {offset} from Paris.",
      open: "Open Now",
    },
    push: {
      title: "Last push",
      empty: "No public pushes lately.",
      profile: "github.com/cempack",
      aria: "Last push to {repo}, {ago}: {message}. Open Projects.",
      ariaEmpty: "No recent pushes. Open Projects.",
    },
    music: {
      nowPlaying: "Now playing",
      lastPlayed: "Last played",
      nothing: "Nothing playing",
      quiet: "The speakers are resting.",
      open: "{title} by {artist}, open in Spotify",
    },
  },
  icons: {
    label: "Desktop icons",
    readme: "README",
    hint: "Double-click or press Enter to open. Drag to rearrange.",
    hintTouch: "Tap to open.",
    selected: "{n} selected",
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
    replay: "Cliquer pour rejouer",
    cursor: "Rejouer",
  },
  hello: {
    file: "hello.txt",
    path: "~/Bureau",
    greeting: "Salut, moi c’est Elliot.",
    lead: "Développeur en France. Je construis des logiciels et de petits outils agréables à utiliser, puis je raconte comment je les ai faits. Entre deux projets, je suis souvent ailleurs, casque sur les oreilles.",
    work: "Voir mes projets",
    contact: "Dire bonjour",
    close: "Fermer hello.txt",
    minimize: "Ranger hello.txt dans le LISEZ-MOI",
    status: "En direct",
    nowPlaying: "En écoute",
    lastPlayed: "Dernière écoute",
    paris: "{time} à Paris",
    pushed: "push {ago}",
    openSpotify: "{title} par {artist}, ouvrir dans Spotify",
    openRepo: "{repo} sur GitHub",
  },
  widgets: {
    label: "Widgets",
    clock: {
      title: "Paris",
      phase: { dawn: "Aube", day: "Jour", dusk: "Crépuscule", night: "Nuit" },
      next: { dawn: "Aube à {time}", day: "Jour à {time}", dusk: "Crépuscule à {time}", night: "Nuit à {time}" },
      you: "chez vous {offset}",
      aria: "Heure de Paris {time}, {phase}. {next}.",
      ariaYou: "Chez vous {time}, {offset} par rapport à Paris.",
      open: "Ouvrir Now",
    },
    push: {
      title: "Dernier push",
      empty: "Aucun push public récemment.",
      profile: "github.com/cempack",
      aria: "Dernier push sur {repo}, {ago} : {message}. Ouvrir Projets.",
      ariaEmpty: "Aucun push récent. Ouvrir Projets.",
    },
    music: {
      nowPlaying: "En écoute",
      lastPlayed: "Dernière écoute",
      nothing: "Rien en écoute",
      quiet: "Les enceintes se reposent.",
      open: "{title} par {artist}, ouvrir dans Spotify",
    },
  },
  icons: {
    label: "Icônes du bureau",
    readme: "LISEZ-MOI",
    hint: "Double-cliquez ou appuyez sur Entrée pour ouvrir. Faites glisser pour ranger.",
    hintTouch: "Touchez pour ouvrir.",
    selected: "{n} sélectionné(s)",
  },
  scroll: {
    label: "Défiler",
    aria: "Faire défiler jusqu’à la suite",
  },
};

const home = { en, fr };
export default home;
