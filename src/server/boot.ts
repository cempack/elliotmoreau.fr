import "server-only";
import path from "node:path";
import { db } from "./db";
import { env } from "./env";

/**
 * Start-up work, run once per server process by src/instrumentation.ts
 * (Node runtime only, after Next has bound its port and before it serves).
 *
 * This list is the one registration point: a module with something to
 * start adds an entry, and a failing entry is logged without stopping the
 * others or the server. Entries must return quickly; long-running work
 * (a poller) is started here and runs in the background. The mail module's
 * entry is:
 *
 *   import { startMailSync } from "./mail";
 *   { name: "mail", run: startMailSync },
 */
export type BootTask = { name: string; run: () => void | Promise<void> };

const TASKS: BootTask[] = [
  { name: "database", run: openDatabase },
  { name: "content", run: refreshPagesFromDatabase },
];

const g = globalThis as unknown as { __emosBooted?: boolean };

export function boot() {
  if (g.__emosBooted) return;
  g.__emosBooted = true;
  for (const task of TASKS) {
    const fail = (err: unknown) => console.error(`[boot] ${task.name} failed:`, err);
    try {
      const out = task.run();
      if (out instanceof Promise) out.catch(fail);
    } catch (err) {
      fail(err);
    }
  }
}

/* ───────────────────────────── database ───────────────────────────── */

/** Open (and migrate, and seed) now, so a broken volume shows at boot. */
function openDatabase() {
  const volume = process.env.RAILWAY_VOLUME_MOUNT_PATH;
  const file = path.resolve(env.databasePath);
  if (process.env.RAILWAY_ENVIRONMENT_NAME && !(volume && file.startsWith(path.resolve(volume) + path.sep))) {
    console.warn(
      `[boot] DATABASE_PATH (${file}) is not on a Railway volume: every deploy would start from an empty database. ` +
        `Attach a volume at /data and set DATABASE_PATH=/data/emos.db (docs/RAILWAY.md).`
    );
  }
  db();
  console.log(`[boot] database ready (${file})`);
}

/* ───────────────────────────── content ───────────────────────────── */

/**
 * The build prerenders every page from the seed (the volume isn't mounted
 * while building), so once the server is up, mark them stale: each page's
 * next visit renders from the database. revalidatePath only works inside a
 * request, hence the call to our own route. Not needed in development,
 * which renders every request.
 */
function refreshPagesFromDatabase() {
  if (process.env.NODE_ENV !== "production") return;
  const secret = env.internalSecret;
  if (!secret) {
    console.warn("[boot] INTERNAL_SECRET (or SESSION_SECRET) isn't set: pages will pick up the database on their 5-minute refresh instead of now.");
    return;
  }
  // not awaited: the request waits until Next is ready to serve
  void kick(secret, 1);
}

const ATTEMPTS = 8;

async function kick(secret: string, attempt: number): Promise<void> {
  const port = process.env.PORT || "3000";
  try {
    const res = await fetch(`http://127.0.0.1:${port}/api/internal/revalidate`, {
      method: "POST",
      headers: { authorization: `Bearer ${secret}` },
      cache: "no-store",
      signal: AbortSignal.timeout(20_000),
    });
    if (res.ok) {
      console.log("[boot] pages marked stale: they now render from the database");
      return;
    }
    if (res.status === 401) {
      console.error("[boot] the revalidate route refused our secret; pages will refresh on their own schedule");
      return;
    }
    throw new Error(`HTTP ${res.status}`);
  } catch (err) {
    if (attempt >= ATTEMPTS) {
      console.error("[boot] couldn't mark pages stale; they will refresh on their own schedule:", err);
      return;
    }
    setTimeout(() => void kick(secret, attempt + 1), Math.min(30_000, 500 * 2 ** attempt)).unref();
  }
}
