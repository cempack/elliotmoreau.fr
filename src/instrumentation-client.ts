import { noteNavigation, reportCrash } from "@/lib/oops";

/**
 * Runs before the app is interactive. What breaks outside React's render
 * (event handlers, timers, promises, and anything React couldn't catch)
 * reaches the server log; the error boundaries (app/[lang]/error.tsx,
 * app/global-error.tsx) report what they catch themselves.
 */
try {
  window.addEventListener("error", (e) => {
    // another origin's script: an opaque "Script error." with nothing to go on
    if (!e.error && /^Script error\.?$/.test(e.message)) return;
    if (/ResizeObserver loop/.test(e.message)) return;
    reportCrash(e.error ?? e.message, "window");
  });
  window.addEventListener("unhandledrejection", (e) => {
    const r: unknown = e.reason;
    // a page transition cut short by the next one, a request the page gave up on: not breakage
    if (r instanceof DOMException && (r.name === "AbortError" || r.name === "InvalidStateError")) return;
    reportCrash(r, "promise");
  });
} catch {}

export function onRouterTransitionStart(url: string) {
  noteNavigation(url);
}
