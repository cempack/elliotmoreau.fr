import "server-only";
import path from "node:path";
import { db } from "./db";
import { env } from "./env";
import { databaseKept, isLive } from "@/lib/deploy";
import { startMailSync } from "./mail";
import { startOutbox } from "./mail/outbox";

/**
 * Start-up work, run once per server process by src/instrumentation.ts
 * (Node runtime only, after Next has bound its port and before it serves).
 *
 * This list is the one registration point: a module with something to
 * start adds an entry, and a failing entry is logged without stopping the
 * others or the server. Entries must return quickly; long-running work
 * (a poller) is started here and runs in the background.
 */
export type BootTask = { name: string; run: () => void | Promise<void> };

const TASKS: BootTask[] = [
  { name: "database", run: openDatabase },
  { name: "content", run: refreshPagesFromDatabase },
  // replies to visitors, read back from Elliot's mailbox (no-op until IMAP is set up)
  { name: "mail", run: startMailSync },
  // letters stored but not yet emailed (a restart mid-send, Bridge down): sent now, then retried until they go
  { name: "outbox", run: startOutbox },
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
  const file = path.resolve(env.databasePath);
  if (isLive() && !databaseKept(file)) {
    console.warn(
      `[boot] DATABASE_PATH (${file}) is inside the app's folder: every deploy would start from an empty database. ` +
        `In Coolify, add Persistent Storage mounted at /data and set DATABASE_PATH=/data/emos.db.`
    );
  }
  db();
  console.log(`[boot] database ready (${file})`);
}

/* ───────────────────────────── content ───────────────────────────── */

/**
 * The build prerenders every page from the seed (the volume isn't mounted
 * while building), so once the server is up, mark them stale and render
 * them again from the database before visitors ask for them (the route
 * calls revalidateContent, which warms them: ./warm.ts). revalidatePath
 * only works inside a request, hence the call to our own route. Not needed
 * in development, which renders every request.
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
      console.log("[boot] pages marked stale: they render again from the database");
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
