/**
 * Crash reports. When something breaks in a visitor's browser, the error,
 * the first lines of its stack, the page, the last navigation and the
 * browser go to /api/oops, which writes them to the server log: a crash
 * that only happens on someone's phone can then be read and fixed. Nothing
 * else is sent (no address, no identifier); each different message once,
 * five at most per page load.
 */

let sent = 0;
const seen = new Set<string>();
let lastNav = "";

/** the navigation in flight (instrumentation-client.ts): "opening /blog" says more than the page alone */
export function noteNavigation(url: string) {
  lastNav = url.slice(0, 200);
}

export function reportCrash(err: unknown, where: string) {
  try {
    if (sent >= 5) return;
    const e = err instanceof Error ? err : null;
    const message = (e ? `${e.name}: ${e.message}` : String(err ?? "unknown")).slice(0, 300);
    if (seen.has(message)) return;
    seen.add(message);
    sent++;
    const body = JSON.stringify({
      m: message,
      s: e?.stack?.split("\n").slice(0, 12).join("\n").slice(0, 1800) ?? "",
      d: (e as { digest?: string } | null)?.digest,
      w: where,
      p: location.pathname,
      n: lastNav,
      u: navigator.userAgent.slice(0, 200),
    });
    const blob = new Blob([body], { type: "text/plain" });
    if (!navigator.sendBeacon?.("/api/oops", blob))
      void fetch("/api/oops", { method: "POST", body, keepalive: true, headers: { "content-type": "text/plain" } }).catch(() => {});
  } catch {}
}

/** a piece of the app that failed to load: a new version shipped while this page was open */
export function isChunkError(err: unknown) {
  return (
    err instanceof Error &&
    (err.name === "ChunkLoadError" || /loading (css )?chunk|failed to (load|fetch)( dynamically imported module| chunk)?|importing a module script failed/i.test(err.message))
  );
}

/** reload once to pick the new version up (never twice in a row: no loops) */
export function reloadOnce() {
  try {
    const at = Number(sessionStorage.getItem("em-reloaded") || 0);
    if (Date.now() - at < 30_000) return false;
    sessionStorage.setItem("em-reloaded", String(Date.now()));
  } catch {
    return false;
  }
  window.location.reload();
  return true;
}
