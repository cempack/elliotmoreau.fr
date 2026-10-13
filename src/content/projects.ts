/**
 * ─────────────────────────────── Projects, in plain words ───────────────────────────────
 *
 *  SEED ONLY. The notes live in the database and are edited (with the order
 *  Projects lists them in) from the admin panel's Projects section; this
 *  fills an empty database on first boot and stands in if it can't be
 *  opened.
 *
 *  GitHub descriptions are written for developers. This says what each
 *  project is for someone who has never opened a terminal, and which shelf
 *  it sits on in Projects. Keyed by the repo's name (case doesn't matter).
 *
 *  - `kind`: app (opens and gets used), game, desktop (an add-on or look for
 *    the Omarchy desktop), tool (sets up or fixes things on a computer),
 *    lab (an experiment).
 *  - `title`: a readable name when the repo's own is a slug. Optional.
 *  - `plain`: one sentence, no jargon. Optional: without it the GitHub
 *    description is shown.
 *
 *  A repo missing from here still shows up: its shelf is guessed from its
 *  description, topics and website (see apps/work/kind.ts).
 */

import type { ProjectKind, ProjectNote } from "@/lib/content";

export type { ProjectKind, ProjectNote };

export const PROJECTS: Record<string, ProjectNote> = {
  euclide: {
    kind: "app",
    title: "Euclide",
    plain: {
      en: "A teaching desk for a maths and computer science teacher, kept on their own computer.",
      fr: "Un bureau d’enseignement pour un professeur de maths et de NSI, gardé sur son propre ordinateur.",
    },
  },
  "2026_1584_stratus": {
    kind: "app",
    title: "Stratus",
    plain: {
      en: "Live air traffic on a 3D globe: the planes flying right now, and where they are.",
      fr: "Le trafic aérien en direct sur un globe en 3D : les avions en vol, et où ils sont.",
    },
  },
  "cai-monitoring": {
    kind: "app",
    title: "CAI Monitoring",
    plain: {
      en: "A web page to watch over and manage HPE servers.",
      fr: "Une page web pour surveiller et gérer des serveurs HPE.",
    },
  },
  "jeu-du-dragon": {
    kind: "game",
    title: "Jeu du Dragon",
    plain: {
      en: "A retro platformer: explore levels, collect coins, answer quizzes and face a legendary dragon.",
      fr: "Un jeu de plateforme rétro : explorez des niveaux, ramassez des pièces, répondez aux quiz et affrontez un dragon légendaire.",
    },
  },
  "omarchy-dos-moos-theme": {
    kind: "desktop",
    title: "Dos Moos",
    plain: {
      en: "A soft sage green look for the whole desktop, with a wallpaper of dark hills. This site wears it too.",
      fr: "Un vert sauge tout doux pour tout le bureau, avec un fond d’écran de collines sombres. Ce site le porte aussi.",
    },
  },
  omapods: {
    kind: "desktop",
    title: "OmaPods",
    plain: {
      en: "Shows your AirPods or Powerbeats Pro in the bar at the top of the screen.",
      fr: "Affiche vos AirPods ou Powerbeats Pro dans la barre en haut de l’écran.",
    },
  },
  protonpassplugin: {
    kind: "desktop",
    title: "Proton Pass",
    plain: {
      en: "Find a saved password in Proton Pass and copy it, straight from the top bar.",
      fr: "Trouvez un mot de passe enregistré dans Proton Pass et copiez-le, depuis la barre du haut.",
    },
  },
  songrec: {
    kind: "desktop",
    title: "SongRec",
    plain: {
      en: "Tells you which song is playing, on your computer or in the room, from the top bar.",
      fr: "Vous dit quelle chanson passe, sur l’ordinateur ou dans la pièce, depuis la barre du haut.",
    },
  },
  hearth: {
    kind: "desktop",
    title: "Hearth",
    plain: {
      en: "Mix background sounds from the Blanket app, like rain or a crackling fire, from the top bar.",
      fr: "Mélangez des sons d’ambiance de l’app Blanket, comme la pluie ou un feu de cheminée, depuis la barre du haut.",
    },
  },
  "omarchy-arch-extra": {
    kind: "desktop",
    title: "Arch Extra",
    plain: {
      en: "Install extra apps from Arch Linux’s official catalogue, from the top bar.",
      fr: "Installez des apps du catalogue officiel d’Arch Linux, depuis la barre du haut.",
    },
  },
  archloom: {
    kind: "tool",
    title: "Archloom",
    plain: {
      en: "Turns one Linux app into the installers other Linux computers use: DEB, RPM, AppImage, Flatpak.",
      fr: "Transforme une app Linux en installateurs pour les autres ordinateurs Linux : DEB, RPM, AppImage, Flatpak.",
    },
  },
  "epitech-dump-arch": {
    kind: "tool",
    title: "Epitech setup for Arch",
    plain: {
      en: "Installs the software Epitech students need on an Arch Linux computer, in one go. Unofficial.",
      fr: "Installe d’un coup les logiciels dont les étudiants d’Epitech ont besoin sur un ordinateur Arch Linux. Non officiel.",
    },
  },
  "standard-notes-project": {
    kind: "tool",
    title: "Standard Notes server",
    plain: {
      en: "Sets up your own Standard Notes server on Ubuntu, so your notes stay on a machine you own.",
      fr: "Installe votre propre serveur Standard Notes sur Ubuntu, pour que vos notes restent sur une machine à vous.",
    },
  },
  codego: {
    kind: "tool",
    title: "CodeGo",
    plain: {
      en: "Runs the Claude Code assistant through OpenCode Go, with a small bridge on your computer.",
      fr: "Fait passer l’assistant Claude Code par OpenCode Go, avec un petit relais sur l’ordinateur.",
    },
  },
};
