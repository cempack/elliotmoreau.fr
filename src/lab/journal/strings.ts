"use client";

import type { Lang } from "@/lib/i18n";
import { useCopy } from "@/lab/copy";

/**
 * Strings only the Journal direction needs. Shared copy (intro, CTAs,
 * section names…) still comes from `useCopy()`; this fills the editorial
 * gaps: chapter titles, colophon, postcard lines.
 */
const J = {
  en: {
    seasons: ["Winter", "Spring", "Summer", "Autumn"],
    vol: "Vol.",
    no: "No.",
    masthead: "The journal of Elliot Moreau",
    chapter: "Chapter",
    search: "Search",
    signals: "Live signals",
    signalsNote: "Updated as it happens",
    writingFrom: "Writing from France",
    placesLine: (n: number, w: number) => `${n} places, ${w} still on the list`,
    pushedTo: "to",
    fieldNotes: "Field notes",
    storiesN: (n: number) => `${n} ${n === 1 ? "story" : "stories"}`,
    reposN: (n: number) => `${n} repositories`,
    leadStory: "Lead story",
    by: "By Elliot Moreau",
    readStory: "Read the story",
    plate: "Plate",
    plateCaption: "Painted from the story's slug. Same words, same sky.",
    alsoIn: "Also in this issue",
    atlasHint: "Scroll or drag",
    swipeHint: "Swipe",
    postcard: "Postcard",
    lineBeen: "Wish you were here.",
    lineWant: "Not yet. Soon.",
    lineHome: "Home, for now.",
    stampHome: "Home",
    markBeen: "Been",
    markNext: "Next",
    to: "To",
    addressee: "Whoever reads this",
    pullQuoteBy: "Last commit",
    project: "Project",
    language: "Language",
    currently: "Currently",
    from: "from",
    listen: "Listen on Spotify",
    paused: "Paused",
    colophon: "Colophon",
    colophonText:
      "Set in Fraunces and Inter, with JetBrains Mono for the small print. Pixel planets painted on canvas, each one seeded by a name. Published from France.",
    elsewhere: "Elsewhere",
    subscribed: "You're in. See you in your inbox.",
    invalid: "That email looks off.",
    rights: "Elliot Moreau",
    introSub: "Code, places & sound",
    journal: "Journal",
    chapters: {
      cover: "Cover",
      signals: "Signals",
      writing: "Field notes",
      atlas: "Atlas",
      work: "Work",
      listening: "Listening",
      contact: "Colophon",
    },
  },
  fr: {
    seasons: ["Hiver", "Printemps", "Été", "Automne"],
    vol: "Vol.",
    no: "N°",
    masthead: "Le journal d'Elliot Moreau",
    chapter: "Chapitre",
    search: "Chercher",
    signals: "Signaux en direct",
    signalsNote: "Mis à jour en continu",
    writingFrom: "Écrit depuis la France",
    placesLine: (n: number, w: number) => `${n} endroits, dont ${w} encore sur la liste`,
    pushedTo: "sur",
    fieldNotes: "Carnets",
    storiesN: (n: number) => `${n} article${n === 1 ? "" : "s"}`,
    reposN: (n: number) => `${n} dépôts`,
    leadStory: "À la une",
    by: "Par Elliot Moreau",
    readStory: "Lire l'article",
    plate: "Planche",
    plateCaption: "Peinte à partir du titre de l'article. Mêmes mots, même ciel.",
    alsoIn: "Aussi dans ce numéro",
    atlasHint: "Défiler ou glisser",
    swipeHint: "Balayer",
    postcard: "Carte postale",
    lineBeen: "J'aurais aimé que tu sois là.",
    lineWant: "Pas encore. Bientôt.",
    lineHome: "Chez moi, pour l'instant.",
    stampHome: "Maison",
    markBeen: "Visité",
    markNext: "Bientôt",
    to: "À",
    addressee: "Qui lira ceci",
    pullQuoteBy: "Dernier commit",
    project: "Projet",
    language: "Langage",
    currently: "En ce moment",
    from: "extrait de",
    listen: "Écouter sur Spotify",
    paused: "En pause",
    colophon: "Colophon",
    colophonText:
      "Composé en Fraunces et Inter, avec JetBrains Mono pour les petits caractères. Planètes en pixels peintes sur canvas, chacune née d'un nom. Publié depuis la France.",
    elsewhere: "Ailleurs",
    subscribed: "C'est noté. À bientôt dans ta boîte.",
    invalid: "Cette adresse a l'air bizarre.",
    rights: "Elliot Moreau",
    introSub: "Code, voyages & musique",
    journal: "Journal",
    chapters: {
      cover: "Couverture",
      signals: "Signaux",
      writing: "Carnets",
      atlas: "Atlas",
      work: "Projets",
      listening: "En écoute",
      contact: "Colophon",
    },
  },
} satisfies Record<Lang, unknown>;

export type JStrings = (typeof J)["en"];

/** Shared copy plus the Journal's own strings, in the current language. */
export function useJ() {
  const c = useCopy();
  return { c, j: J[c.lang] as JStrings };
}

export const CHAPTERS = [
  { id: "cover", n: "00" },
  { id: "signals", n: "01" },
  { id: "writing", n: "02" },
  { id: "atlas", n: "03" },
  { id: "work", n: "04" },
  { id: "listening", n: "05" },
  { id: "contact", n: "06" },
] as const;

export type ChapterId = (typeof CHAPTERS)[number]["id"];
