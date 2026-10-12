/**
 * Runs once when a server process starts (never during `next build`).
 * Everything that has to start with the server is listed in
 * src/server/boot.ts; it needs Node (SQLite, sockets), so the edge runtime
 * skips it.
 */
export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;
  const { boot } = await import("./server/boot");
  boot();
}
