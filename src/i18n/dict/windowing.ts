// Strings for the windowing part of the shell: app window chrome and page
// transitions. Add keys to `en` and the type forces the same keys in `fr`.
const en = {
  window: {
    close: "Close window",
    minimize: "Minimize to the Dock",
    zoom: "Enter full width",
    unzoom: "Exit full width",
    sections: "Sections",
  },
};

const fr: typeof en = {
  window: {
    close: "Fermer la fenêtre",
    minimize: "Réduire dans le Dock",
    zoom: "Passer en pleine largeur",
    unzoom: "Quitter la pleine largeur",
    sections: "Rubriques",
  },
};

const windowing = { en, fr };
export default windowing;
