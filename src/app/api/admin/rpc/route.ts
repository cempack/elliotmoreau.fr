import {
  audit,
  listAudit,
  listPasskeys,
  listSessions,
  recoveryLeft,
  regenerateRecovery,
  renamePasskey,
  requireAdmin,
  revokePasskey,
  revokeSession,
  type AdminCtx,
} from "@/server/auth";
import {
  ContentError,
  deletePlace,
  getCopy,
  getSiteContent,
  reorderPlaces,
  revalidateContent,
  setCopy,
  setLive,
  setNowContent,
  setProjects,
  setStatus,
  upsertPlace,
  type CopyContent,
  type LiveOverrides,
  type NowContent,
  type PlaceRow,
  type ProjectsContent,
  type Status,
} from "@/server/content";
import { getStats, type StatsRange } from "@/server/stats";
import { flatStrings } from "@/i18n/base";
import {
  adminReply,
  getThread,
  listThreads,
  mailAddresses,
  mailHealth,
  markThreadRead,
  sendTestEmail,
  setThreadStatus,
  type ThreadStatus,
} from "@/server/mail";
import { syncOnce } from "@/server/mail/sync";
import { json } from "@/server/mail/http";
import { db } from "@/server/db";
import { env, imapReady, smtpReady } from "@/server/env";
import { getRepos } from "@/lib/github";
import { getLatestPosts } from "@/lib/ghost";
import { FIXTURE_POSTS, FIXTURE_REPOS } from "@/lib/fixtures";

/**
 * POST /api/admin/rpc: everything the admin panel reads and writes.
 * { op, …args } → { ok: true, … } | { ok: false, error, message?, field? }.
 * Only from a signed-in session (requireAdmin); every write is audited and
 * marks the site stale so the change is live on the next visit.
 */

type Handler = (ctx: AdminCtx) => unknown | Promise<unknown>;

const str = (v: unknown) => (typeof v === "string" ? v : "");

/** a content write: audited, then the whole site re-renders from the database */
function write(action: string, detail: string, ctx: AdminCtx, fn: () => void) {
  fn();
  revalidateContent();
  audit(action, true, detail, ctx.ip);
  return { saved: true };
}

function overview(ctx: AdminCtx) {
  const content = getSiteContent();
  const inbox = listThreads({ status: "inbox" });
  return {
    ...content,
    mail: {
      unread: inbox.reduce((n, t) => n + (t.adminUnread > 0 ? 1 : 0), 0),
      health: mailHealth(),
      addresses: mailAddresses(),
    },
    system: {
      passkeys: listPasskeys(),
      sessions: listSessions(ctx.session.idHash),
      recoveryLeft: recoveryLeft(),
      session: { createdAt: ctx.session.createdAt, expiresAt: ctx.session.expiresAt, hardExpiresAt: ctx.session.hardExpiresAt },
      integrations: {
        database: env.databasePath.startsWith("/data/") ? "volume" : "local",
        smtp: smtpReady(),
        imap: imapReady(),
        github: Boolean(process.env.GITHUB_TOKEN),
        ghost: Boolean(process.env.GHOST_API_URL && process.env.GHOST_CONTENT_KEY),
        spotify: Boolean(process.env.SPOTIFY_REFRESH_TOKEN),
        siteUrl: env.siteUrl,
      },
    },
  };
}

const sample = () => process.env.RAILWAY_ENVIRONMENT_NAME !== "production";

const OPS: Record<string, Handler> = {
  overview,

  /* ── status ── */
  "status.set": (ctx) => {
    const patch = (ctx.body.patch ?? {}) as Partial<Status>;
    const what = Object.keys(patch).join(", ");
    return write("status.set", what, ctx, () => setStatus(patch));
  },
  /** quick away from the terminal or the Status pane: a place id or a free city */
  "away.set": (ctx) => {
    const away = ctx.body.away as Status["away"];
    const detail = away ? (away.placeId ?? away.city ?? "?") + (away.to ? ` until ${away.to}` : "") : "home";
    return write("status.away", detail, ctx, () => setStatus({ away }));
  },

  /* ── places ── */
  "place.upsert": (ctx) => {
    const place = ctx.body.place as PlaceRow;
    return write("place.save", str(place?.id), ctx, () => upsertPlace(place));
  },
  "place.delete": (ctx) => write("place.delete", str(ctx.body.id), ctx, () => deletePlace(str(ctx.body.id))),
  "place.reorder": (ctx) => {
    const ids = Array.isArray(ctx.body.ids) ? ctx.body.ids.map(str) : [];
    return write("place.reorder", `${ids.length} places`, ctx, () => reorderPlaces(ids));
  },

  /* ── now, live ── */
  "now.set": (ctx) => write("now.set", "", ctx, () => setNowContent(ctx.body.now as NowContent)),
  "live.set": (ctx) => {
    const patch = (ctx.body.patch ?? {}) as Partial<LiveOverrides>;
    return write("live.set", Object.keys(patch).join(", "), ctx, () => setLive(patch));
  },
  "live.options": async () => {
    const [repos, posts] = await Promise.all([getRepos(), getLatestPosts(30)]);
    const r = repos?.length ? repos : sample() ? FIXTURE_REPOS : [];
    const p = posts?.length ? posts : sample() ? FIXTURE_POSTS : [];
    return {
      repos: r.map((x) => ({ name: x.name, language: x.language, pushedAt: x.pushedAt })),
      posts: p.map((x) => ({ slug: x.slug, title: x.title, published: x.published_at })),
    };
  },

  /* ── projects: every repo GitHub lists (hidden ones too), and their notes, order, visibility ── */
  "projects.options": async () => {
    const repos = await getRepos();
    const r = repos?.length ? repos : sample() ? FIXTURE_REPOS : [];
    return {
      repos: r.map((x) => ({
        name: x.name,
        description: x.description,
        homepage: x.homepage,
        topics: x.topics,
        language: x.language,
        pushedAt: x.pushedAt,
        url: x.url,
      })),
    };
  },
  "projects.save": (ctx) => {
    const projects = ctx.body.projects as ProjectsContent;
    const hiddenRepos = ctx.body.hiddenRepos as string[] | undefined;
    const featuredRepo = typeof ctx.body.featuredRepo === "string" ? ctx.body.featuredRepo : undefined;
    return write("projects.save", `${Object.keys(projects?.notes ?? {}).length} notes`, ctx, () => {
      setProjects(projects);
      if (hiddenRepos !== undefined || featuredRepo !== undefined) setLive({ hiddenRepos, featuredRepo });
    });
  },

  /* ── settings: hours and replies, with the post Writing opens on and the music, in one save ── */
  "settings.save": (ctx) => {
    const status = ctx.body.status as Partial<Status> | undefined;
    const live = ctx.body.live as Partial<LiveOverrides> | undefined;
    const what = [...Object.keys(status ?? {}), ...Object.keys(live ?? {})].join(", ");
    return write("settings.save", what, ctx, () => {
      if (status && Object.keys(status).length) setStatus(status);
      if (live && Object.keys(live).length) setLive(live);
    });
  },

  /* ── texts: every string on the site as written, and the edits laid over them ── */
  "copy.options": () => ({ base: { en: flatStrings("en"), fr: flatStrings("fr") }, copy: getCopy() }),
  "copy.save": (ctx) => {
    const copy = ctx.body.copy as CopyContent;
    const n = Object.keys(copy?.en ?? {}).length + Object.keys(copy?.fr ?? {}).length;
    return write("copy.save", `${n} edits`, ctx, () => setCopy(copy));
  },

  /* ── stats ── */
  stats: (ctx) => {
    const n = Number(ctx.body.range);
    const range = ([1, 7, 30, 90, 365] as const).includes(n as StatsRange) ? (n as StatsRange) : 30;
    return { stats: getStats(range) };
  },

  /* ── mail ── */
  "mail.list": (ctx) => ({ threads: listThreads({ status: str(ctx.body.status) as ThreadStatus | "inbox" }) }),
  "mail.get": (ctx) => {
    const id = str(ctx.body.id);
    const thread = getThread(id);
    if (!thread) return { error: "notfound" };
    if (thread.adminUnread) markThreadRead(id);
    return { thread };
  },
  "mail.status": (ctx) => {
    const id = str(ctx.body.id);
    const status = str(ctx.body.status) as ThreadStatus;
    if (!getThread(id)) return { error: "notfound" };
    setThreadStatus(id, status);
    audit("mail.status", true, `${id} → ${status}`, ctx.ip);
    return { saved: true };
  },
  "mail.reply": async (ctx) => {
    const id = str(ctx.body.id);
    const res = await adminReply(id, str(ctx.body.body));
    audit("mail.reply", res.ok, res.ok ? id : `${id}: ${res.error}`, ctx.ip);
    return res.ok ? { sent: true } : { error: res.error };
  },
  "mail.test": async (ctx) => {
    const res = await sendTestEmail();
    audit("mail.test", res.ok, res.error ?? "", ctx.ip);
    return res.ok ? { sent: true } : { error: "failed", message: res.error };
  },
  "mail.sync": async () => {
    const ran = await syncOnce();
    return { ran, health: mailHealth() };
  },

  /* ── system ── */
  "passkey.rename": (ctx) => {
    const ok = renamePasskey(str(ctx.body.id), str(ctx.body.name));
    if (ok) audit("passkey.rename", true, str(ctx.body.name), ctx.ip);
    return ok ? { saved: true, passkeys: listPasskeys() } : { error: "invalid" };
  },
  "passkey.revoke": (ctx) => {
    const id = str(ctx.body.id);
    const name = listPasskeys().find((p) => p.id === id)?.name ?? id;
    const res = revokePasskey(id);
    audit("passkey.revoke", res === "ok", res === "ok" ? name : `${name}: ${res}`, ctx.ip);
    return res === "ok" ? { saved: true, passkeys: listPasskeys() } : { error: res === "last" ? "last" : "notfound" };
  },
  "session.revoke": (ctx) => {
    const n = revokeSession(str(ctx.body.id));
    audit("session.revoke", n > 0, str(ctx.body.id), ctx.ip);
    return { saved: n > 0, sessions: listSessions(ctx.session.idHash) };
  },
  "session.revokeOthers": (ctx) => {
    const n = db().prepare(`DELETE FROM admin_sessions WHERE id_hash != ?`).run(ctx.session.idHash).changes;
    audit("session.revoke", true, `${n} other sessions`, ctx.ip);
    return { saved: true, sessions: listSessions(ctx.session.idHash) };
  },
  "recovery.regenerate": (ctx) => {
    const codes = regenerateRecovery();
    audit("recovery.regenerate", true, "", ctx.ip);
    return { codes };
  },
  "audit.list": (ctx) => ({
    entries: listAudit(100, typeof ctx.body.before === "number" ? ctx.body.before : undefined),
  }),
  "site.refresh": (ctx) => {
    revalidateContent();
    audit("site.refresh", true, "", ctx.ip);
    return { saved: true };
  },
  /** a JSON backup of everything editable, plus the mail */
  export: (ctx) => {
    const content = getSiteContent();
    const threads = listThreads({}).map((t) => getThread(t.id));
    const spam = listThreads({ status: "spam" }).map((t) => getThread(t.id));
    audit("export", true, "", ctx.ip);
    return {
      backup: {
        exportedAt: new Date().toISOString(),
        site: env.siteUrl,
        places: content.places,
        status: content.status,
        now: content.now,
        live: content.live,
        mail: [...threads, ...spam].filter(Boolean),
        audit: listAudit(500),
      },
    };
  },
};

export async function POST(req: Request) {
  const ctx = await requireAdmin(req);
  if (ctx instanceof Response) return ctx;
  const op = OPS[str(ctx.body.op)];
  if (!op) return json({ ok: false, error: "invalid" }, 400);
  try {
    const out = (await op(ctx)) as Record<string, unknown>;
    if (out && typeof out.error === "string") {
      const status = out.error === "notfound" ? 404 : out.error === "unavailable" ? 503 : 400;
      return json({ ok: false, ...out }, status);
    }
    return json({ ok: true, ...out });
  } catch (err) {
    if (err instanceof ContentError) {
      audit(str(ctx.body.op), false, `${err.field ?? ""}: ${err.message}`, ctx.ip);
      return json({ ok: false, error: "invalid", message: err.message, field: err.field }, 400);
    }
    console.error("[admin] rpc failed", str(ctx.body.op), err instanceof Error ? err.message : err);
    audit(str(ctx.body.op), false, err instanceof Error ? err.message : "failed", ctx.ip);
    return json({ ok: false, error: "failed" }, 500);
  }
}
