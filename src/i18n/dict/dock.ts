// Strings for the dock part of the shell. Owned by its builder: add keys
// to `en` and the type forces the same keys in `fr`. App names themselves
// live in shell.apps.
const en = {
  /** landmark name of the desktop dock and the mobile tab bar */
  label: "Dock",
  /** toolbar name inside the dock */
  apps: "Apps",
  more: "More",
  moreTitle: "More",
  /** names of the More sheet's two groups (read by screen readers) */
  moreApps: "Apps",
  moreTools: "Tools",
  search: "Search",
  atlasHint: "Where I’ve been, and where I’m going next",
  mailHint: "Write to me, or find my other profiles",
  nowHint: "What I’m into right now",
  terminalHint: "For the curious. Type help to start.",
  searchHint: "Apps, posts, projects, commands",
  windows: "Open windows",
  windowsHint: "Every app you opened. Or swipe up on this bar.",
  running: "open",
};

const fr: typeof en = {
  label: "Dock",
  apps: "Applications",
  more: "Plus",
  moreTitle: "Plus",
  moreApps: "Apps",
  moreTools: "Outils",
  search: "Rechercher",
  atlasHint: "Où je suis allé, et où je vais ensuite",
  mailHint: "M’écrire, ou trouver mes autres profils",
  nowHint: "Ce qui m’occupe en ce moment",
  terminalHint: "Pour les curieux. Tapez help pour commencer.",
  searchHint: "Apps, articles, projets, commandes",
  windows: "Fenêtres ouvertes",
  windowsHint: "Toutes les apps ouvertes. Ou balayez cette barre vers le haut.",
  running: "ouvert",
};

const dock = { en, fr };
export default dock;
