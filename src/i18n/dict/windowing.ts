// Strings for the windowing part of the shell: app window chrome, page
// transitions and the picture-in-picture mini player. Owned by its
// builder: add keys to `en` and the type forces the same keys in `fr`.
const en = {
  window: {
    close: "Close window",
    minimize: "Minimize to the Dock",
    zoom: "Enter full width",
    unzoom: "Exit full width",
    sections: "Sections",
  },
  player: {
    region: "Now playing",
    nowPlaying: "Now playing",
    paused: "Paused",
    lastPlayed: "Last played",
    openSpotify: "Open in Spotify",
    collapse: "Shrink the player",
    expand: "Expand the player",
    /** read after the track: "Midnight City by M83" */
    by: "by",
    progress: "Elapsed",
    moveHint: "Drag or throw it into any corner. Arrow keys move it too.",
    corner: {
      tl: "Moved to the top left corner",
      tr: "Moved to the top right corner",
      bl: "Moved to the bottom left corner",
      br: "Moved to the bottom right corner",
    },
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
  player: {
    region: "En écoute",
    nowPlaying: "En écoute",
    paused: "En pause",
    lastPlayed: "Dernière écoute",
    openSpotify: "Ouvrir dans Spotify",
    collapse: "Réduire le lecteur",
    expand: "Agrandir le lecteur",
    by: "par",
    progress: "Écoulé",
    moveHint: "Faites-le glisser ou lancez-le dans un coin. Les flèches du clavier le déplacent aussi.",
    corner: {
      tl: "Déplacé en haut à gauche",
      tr: "Déplacé en haut à droite",
      bl: "Déplacé en bas à gauche",
      br: "Déplacé en bas à droite",
    },
  },
};

const windowing = { en, fr };
export default windowing;
