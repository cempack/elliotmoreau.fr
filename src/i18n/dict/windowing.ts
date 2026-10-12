// Strings for the windowing part of the shell: app window chrome and page
// transitions. Add keys to `en` and the type forces the same keys in `fr`.
const en = {
  window: {
    close: "Close window",
    zoom: "Enter full width",
    unzoom: "Exit full width",
    sections: "Sections",
    path: "Path",
  },
};

const fr: typeof en = {
  window: {
    close: "Fermer la fenêtre",
    zoom: "Passer en pleine largeur",
    unzoom: "Quitter la pleine largeur",
    sections: "Rubriques",
    path: "Chemin",
  },
};

const windowing = { en, fr };
export default windowing;
