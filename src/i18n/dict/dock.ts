// Strings for the dock part of the shell. Owned by its builder: add keys
// to `en` and the type forces the same keys in `fr`. App names themselves
// live in shell.apps.
const en = {
  /** landmark name of the desktop dock and the mobile tab bar */
  label: "Dock",
  /** toolbar name inside the dock */
  apps: "Apps",
  more: "More",
  moreTitle: "More apps",
  search: "Search",
  nowHint: "What I'm into right now",
  terminalHint: "A real shell. Type help.",
  searchHint: "Apps, posts, projects, commands",
  running: "open",
};

const fr: typeof en = {
  label: "Dock",
  apps: "Applications",
  more: "Plus",
  moreTitle: "Plus d’apps",
  search: "Rechercher",
  nowHint: "Ce qui m’occupe en ce moment",
  terminalHint: "Un vrai shell. Tapez help.",
  searchHint: "Apps, articles, projets, commandes",
  running: "ouvert",
};

const dock = { en, fr };
export default dock;
