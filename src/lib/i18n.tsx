"use client";

import { createContext, useContext, useEffect, useMemo, useState } from "react";

export type Lang = "en" | "fr";

const STRINGS = {
  en: {
    "meta.title": "Elliot Moreau — builds things",
    "meta.description":
      "Elliot Moreau. Code, travel and music. Live from France.",
    "nav.home": "Home",
    "nav.work": "Work",
    "nav.contact": "Contact",
    "nav.cta": "Say hello",
    "nav.soundOn": "Sound on",
    "nav.soundOff": "Muted",
        "hero.line1": "Elliot",
    "hero.line2": "Moreau",
    "hero.replay": "replay the effect",
    "live.now": "now playing",
    "live.last": "last played",
    "nowplaying.artists": "top artists",
        "travel.title": "Footprints",
    "travel.label": "02 / ATLAS",
    "travel.hint": "drag to spin · click a place",
    "travel.been": "been",
    "travel.want": "want",
    "travel.home": "home",
    "travel.coords": "coords",
    "travel.empty": "pick a place on the globe",
        "links.label": "03 / MORE",
    "links.workTitle": "Work",
    "links.workSub": "live from github",
    "links.contactTitle": "Contact",
    "links.contactSub": "say hello",
    "links.contactMeta": "replies fast · pgp ready",
    "blog.label": "01 / BLOG",
    "blog.title": "From the blog",
    "blog.how": "fresh off blog.elliotmoreau.fr",
    "blog.all": "all posts",
    "blog.min": "min read",
    "blog.empty": "nothing here yet — the first posts are brewing",
    "blog.offline": "the blog is unreachable right now — read it directly",
    "blog.newsletterTitle": "Never miss a post",
    "blog.newsletterSub": "one email per article, nothing else. no spam, ever.",
    "blog.emailPh": "you@somewhere.fr",
    "blog.subscribe": "subscribe",
    "blog.sending": "sending…",
    "blog.done": "you're in — see you in your inbox",
    "blog.exists": "already aboard — see you soon",
    "blog.invalid": "that email looks off — try again",
    "blog.error": "couldn't subscribe — try again in a bit",
    "blog.support": "Become a member",
    "blog.supportSub": "support the blog, unlock everything",
    "blog.featured": "featured",
        "work.pixelKicker": "LIVE FROM GITHUB",
    "work.featured": "FEATURED",
    "work.sortRecent": "recent",
    "work.sortStars": "top stars",
    "work.rest": "THE REST",
    "work.title": "Work",
    "work.note": "not forks, not archived, with a description",
    "work.stars": "stars",
    "work.updated": "updated",
    "work.visit": "open repo",
    "work.empty": "github is unreachable — the code still lives here:",
    "work.openGithub": "open github profile",
    "contact.kicker": "no forms, just write",
    "contact.title": "Say hello",
    "contact.fun": "the inbox is open — bring cool stuff",
    "contact.email": "email",
    "contact.copy": "copy",
    "contact.copied": "copied",
    "contact.pgp": "pgp",
    "contact.pgpNote": "prefer encrypted mail — grab the key",
    "contact.download": "download .asc",
    "contact.show": "show key",
    "contact.hide": "hide key",
    "contact.socials": "elsewhere",
    "footer.rights": "made with ♥",
    "github.pushed": "pushed to",
    "time.now": "just now",
    "time.min": "min ago",
    "time.hours": "h ago",
    "time.days": "d ago",
  },
  fr: {
    "meta.title": "Elliot Moreau — fabrique des trucs",
    "meta.description":
      "Elliot Moreau. Code, voyages et musique. En direct de France.",
    "nav.home": "Accueil",
    "nav.work": "Projets",
    "nav.contact": "Contact",
    "nav.cta": "Dire bonjour",
    "nav.soundOn": "Son activé",
    "nav.soundOff": "Muet",
        "hero.line1": "Elliot",
    "hero.line2": "Moreau",
    "hero.replay": "rejouer l'effet",
    "live.now": "en écoute",
    "live.last": "dernière écoute",
    "nowplaying.artists": "top artistes",
        "travel.title": "Traces",
    "travel.label": "02 / ATLAS",
    "travel.hint": "glisser pour tourner · cliquer un lieu",
    "travel.been": "visités",
    "travel.want": "envies",
    "travel.home": "base",
    "travel.coords": "coords",
    "travel.empty": "choisis un lieu sur le globe",
        "links.label": "03 / SUITE",
    "links.workTitle": "Projets",
    "links.workSub": "en direct de github",
    "links.contactTitle": "Contact",
    "links.contactSub": "dire bonjour",
    "links.contactMeta": "répond vite · pgp dispo",
    "blog.label": "01 / BLOG",
    "blog.title": "Depuis le blog",
    "blog.how": "frais de blog.elliotmoreau.fr",
    "blog.all": "tous les articles",
    "blog.min": "min de lecture",
    "blog.empty": "rien ici pour l'instant — les premiers articles mijotent",
    "blog.offline": "le blog est injoignable — lis-le directement",
    "blog.newsletterTitle": "Ne rate aucun article",
    "blog.newsletterSub": "un e-mail par article, rien d'autre. jamais de spam.",
    "blog.emailPh": "toi@quelque-part.fr",
    "blog.subscribe": "s'abonner",
    "blog.sending": "envoi…",
    "blog.done": "c'est noté — à bientôt dans ta boîte mail",
    "blog.exists": "déjà à bord — à bientôt",
    "blog.invalid": "cet e-mail semble invalide — réessaie",
    "blog.error": "inscription impossible — réessaie dans un moment",
    "blog.support": "Devenir membre",
    "blog.supportSub": "soutiens le blog, débloque tout",
    "blog.featured": "à la une",
        "work.pixelKicker": "EN DIRECT DE GITHUB",
    "work.featured": "EN VEDETTE",
    "work.sortRecent": "recents",
    "work.sortStars": "top stars",
    "work.rest": "LA SUITE",
    "work.title": "Projets",
    "work.note": "ni forks, ni archivés, avec une description",
    "work.stars": "stars",
    "work.updated": "mis à jour",
    "work.visit": "ouvrir le dépôt",
    "work.empty": "github est injoignable — le code vit toujours ici :",
    "work.openGithub": "ouvrir le profil github",
    "contact.kicker": "pas de formulaire, écris-moi",
    "contact.title": "Dire bonjour",
    "contact.fun": "la boîte est ouverte — viens avec des trucs cools",
    "contact.email": "e-mail",
    "contact.copy": "copier",
    "contact.copied": "copié",
    "contact.pgp": "pgp",
    "contact.pgpNote": "mail chiffré préféré — récupère la clé",
    "contact.download": "télécharger .asc",
    "contact.show": "voir la clé",
    "contact.hide": "masquer la clé",
    "contact.socials": "ailleurs",
    "footer.rights": "fait avec ♥",
    "github.pushed": "push sur",
    "time.now": "à l'instant",
    "time.min": "il y a",
    "time.hours": "il y a",
    "time.days": "il y a",
  },
} as const;

export type StringKey = keyof (typeof STRINGS)["en"];

type LangCtx = { lang: Lang; setLang: (l: Lang) => void; t: (k: StringKey) => string };

const Ctx = createContext<LangCtx>({ lang: "en", setLang: () => {}, t: (k) => k });

export function detectLang(): Lang {
  if (typeof navigator !== "undefined" && /fr/i.test(navigator.language || "")) return "fr";
  return "en";
}

function initialLang(): Lang {
  try {
    const saved = localStorage.getItem("em-lang");
    if (saved === "fr" || saved === "en") return saved;
  } catch {}
  return detectLang();
}

export function LanguageProvider({ children }: { children: React.ReactNode }) {
  // Always render "en" on the first pass (server HTML must match),
  // then sync from storage/browser after paint.
  const [lang, setLangState] = useState<Lang>("en");

  useEffect(() => {
    const id = requestAnimationFrame(() => setLangState(initialLang()));
    return () => cancelAnimationFrame(id);
  }, []);

  // keep <html lang>, title and description in sync (metadata in both languages)
  useEffect(() => {
    document.documentElement.lang = lang;
    document.title = STRINGS[lang]["meta.title"];
    const desc = document.querySelector('meta[name="description"]');
    if (desc) desc.setAttribute("content", STRINGS[lang]["meta.description"]);
    const ogTitle = document.querySelector('meta[property="og:title"]');
    if (ogTitle) ogTitle.setAttribute("content", STRINGS[lang]["meta.title"]);
    const ogDesc = document.querySelector('meta[property="og:description"]');
    if (ogDesc) ogDesc.setAttribute("content", STRINGS[lang]["meta.description"]);
  }, [lang]);

  const setLang = (l: Lang) => {
    setLangState(l);
    try {
      localStorage.setItem("em-lang", l);
    } catch {}
  };

  const value = useMemo<LangCtx>(
    () => ({ lang, setLang, t: (k) => STRINGS[lang][k] ?? k }),
    [lang]
  );
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useLang() {
  return useContext(Ctx);
}
