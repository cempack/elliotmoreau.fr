"use client";

import { useCopy } from "@/lab/copy";
import type { Lang } from "@/lib/i18n";

/** Strings this direction needs beyond the shared lab copy. */
const S = {
  eyebrow: { en: "Right now", fr: "En ce moment" },
  bentoTitleA: { en: "Everything I'm up to.", fr: "Tout ce que je fais." },
  bentoTitleB: { en: "At a glance.", fr: "En un coup d'œil." },
  bentoSub: {
    en: "Tap any panel to open it. Pull it down to put it back.",
    fr: "Touche un panneau pour l'ouvrir. Tire-le vers le bas pour le ranger.",
  },
  latest: { en: "Latest post", fr: "Dernier article" },
  also: { en: "Also on the blog", fr: "Aussi sur le blog" },
  featured: { en: "Featured", fr: "À la une" },
  projects: { en: "public projects", fr: "projets publics" },
  starsTotal: { en: "stars across them", fr: "étoiles au total" },
  close: { en: "Close", fr: "Fermer" },
  expand: { en: "Open", fr: "Ouvrir" },
  openSpotify: { en: "Open in Spotify", fr: "Ouvrir dans Spotify" },
  nothingPlaying: { en: "Nothing playing", fr: "Rien en cours" },
  paused: { en: "Paused", fr: "En pause" },
  sending: { en: "Sending…", fr: "Envoi…" },
  nlDone: { en: "You're in. See you at the next post.", fr: "C'est noté. À très vite pour le prochain article." },
  nlExists: { en: "You're already subscribed.", fr: "Tu es déjà abonné·e." },
  nlInvalid: { en: "That email doesn't look right.", fr: "Cet e-mail n'a pas l'air valide." },
  nlError: { en: "Something broke. Try again?", fr: "Quelque chose a cassé. On réessaie ?" },
  placesBeen: { en: "places visited", fr: "endroits visités" },
  placesNext: { en: "on the list", fr: "sur la liste" },
  homeBase: { en: "Home base", fr: "Camp de base" },
  probably: { en: "Probably", fr: "Sans doute" },
  bestTime: { en: "Best time to reach me", fr: "Le meilleur moment pour m'écrire" },
  bestTimeVal: { en: "09:00 to 19:00, Paris time", fr: "De 9 h à 19 h, heure de Paris" },
  pushed: { en: "pushed", fr: "push" },
  repoCount: { en: "repositories", fr: "dépôts" },
  socials: { en: "Elsewhere", fr: "Ailleurs" },
  top: { en: "Back to top", fr: "Haut de page" },
  loupe: { en: "Loupe", fr: "Loupe" },
  readOn: { en: "Read on the blog", fr: "Lire sur le blog" },
  openRepo: { en: "Open on GitHub", fr: "Voir sur GitHub" },
  recentTrack: { en: "Before that", fr: "Juste avant" },
  menu: { en: "Search", fr: "Chercher" },
  pickPlace: { en: "Pick a place", fr: "Choisis un endroit" },
} satisfies Record<string, Record<Lang, string>>;

export type GlassKey = keyof typeof S;

/** Shared copy plus `t(key)` for this direction's own strings. */
export function useGlassCopy() {
  const c = useCopy();
  const t = (k: GlassKey) => S[k][c.lang];
  return { ...c, t };
}

/** Part of the day in France, from the hour. */
export function phaseOf(hour: number, lang: Lang) {
  const P = [
    { until: 6, en: "Night", fr: "Nuit" },
    { until: 8, en: "Dawn", fr: "Aube" },
    { until: 12, en: "Morning", fr: "Matin" },
    { until: 14, en: "Midday", fr: "Midi" },
    { until: 18, en: "Afternoon", fr: "Après-midi" },
    { until: 21, en: "Evening", fr: "Soirée" },
    { until: 24, en: "Night", fr: "Nuit" },
  ];
  const p = P.find((x) => hour < x.until) ?? P[P.length - 1];
  return p[lang];
}

/** What Elliot is likely doing at this hour. Playful, not a promise. */
export function doingAt(hour: number, lang: Lang) {
  const D = [
    { until: 7, en: "asleep, dreaming in springs", fr: "en train de dormir, à rêver de ressorts" },
    { until: 9, en: "coffee and the inbox", fr: "café et boîte mail" },
    { until: 12, en: "deep in the code", fr: "plongé dans le code" },
    { until: 14, en: "out for lunch", fr: "parti déjeuner" },
    { until: 19, en: "building things", fr: "en train de fabriquer des trucs" },
    { until: 21, en: "dinner, music on", fr: "à table, musique allumée" },
    { until: 24, en: "writing, or ricing a desktop", fr: "en train d'écrire, ou de peaufiner un bureau" },
  ];
  const d = D.find((x) => hour < x.until) ?? D[D.length - 1];
  return d[lang];
}
