/**
 * This visit, as the browser saw it: the site it came from, the page it
 * landed on, the pages since, and when it began. Kept in the tab only
 * (sessionStorage, so a reload doesn't lose where the visit came from),
 * and never sent anywhere on its own: it travels with a letter the visitor
 * sends from the Mail app, for Elliot to see who wrote (src/server/mail/senders).
 */

export type Visit = { ref: string; landing: string; at: number; pages: string[] };

const KEY = "em-visit";
const MAX_PAGES = 30;
let visit: Visit | null = null;

function read(): Visit | null {
  try {
    const v = JSON.parse(sessionStorage.getItem(KEY) ?? "null") as Visit | null;
    return v && typeof v.at === "number" && Array.isArray(v.pages) ? v : null;
  } catch {
    return null;
  }
}

/** a page of the visit (the Beacon calls it on every navigation) */
export function noteVisit(path: string) {
  if (typeof window === "undefined") return;
  visit ??= read() ?? { ref: document.referrer.slice(0, 500), landing: (location.pathname + location.search).slice(0, 300), at: Date.now(), pages: [] };
  if (visit.pages[visit.pages.length - 1] !== path) visit.pages = [...visit.pages, path.slice(0, 200)].slice(-MAX_PAGES);
  try {
    sessionStorage.setItem(KEY, JSON.stringify(visit));
  } catch {}
}

export function currentVisit(): Visit | null {
  if (typeof window === "undefined") return null;
  return visit ?? read();
}
