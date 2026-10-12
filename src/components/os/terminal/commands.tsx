"use client";

import type { Dict, Locale } from "@/i18n";
import type { SiteData } from "@/lib/data";
import type { TrackInfo } from "@/lib/spotify";
import type { SoundKind } from "@/lib/sound";
import { timeAgo } from "@/lib/format";
import { LANG_COLORS, LANG_FALLBACK } from "@/lib/langColors";
import { SOCIALS } from "@/lib/socials";
import { fmtCoords } from "@/lib/content";
import { APPS, type AppDef, type AppId } from "../apps";
import { type SkyMode, type SkyPhase } from "../sky";
import { phaseOf, sunAt } from "@/lib/sun";
import { EmosLogo } from "../EmosLogo";
import { Cmd, Ext, Swatch, fill, nodes } from "./ui";
import { GitLog, GitShow } from "./Git";

/**
 * The Terminal's commands. Each one takes its arguments and a context of
 * live OS handles (router, sky, sound, data, toasts…) and returns what to
 * print as React. Side effects happen here, inside the Enter keypress
 * that ran them, never during render, so printed output is a snapshot.
 */

export type RunCtx = {
  lang: Locale;
  d: Dict;
  path: (p: string) => string;
  cwd: AppDef;
  data: SiteData;
  track: TrackInfo | null;
  playing: boolean;
  sky: { phase: SkyPhase; mode: SkyMode; setMode: (m: SkyMode) => void };
  sound: { muted: boolean; toggle: () => void; blip: (k: SoundKind) => void };
  notify: (text: string) => void;
  history: string[];
  navigate: (href: string) => void;
  close: () => void;
  exit: () => void;
  clear: () => void;
  shake: () => void;
  switchLang: (to: Locale) => void;
  reboot: () => void;
};

/** Returned by commands that print nothing at all (clear, exit). */
export const SILENT = Symbol("silent");
export type Output = React.ReactNode | typeof SILENT;

type Command = {
  name: string;
  aliases?: string[];
  /** Tab-completion candidates for everything after the command name */
  args?: (ctx: RunCtx) => string[];
  hidden?: boolean;
  run: (args: string[], ctx: RunCtx, rest: string, name: string) => Output;
};

export const cwdLabel = (app: AppDef) => (app.id === "home" ? "~" : `~${app.path}`);

const locale = (lang: Locale) => (lang === "fr" ? "fr-FR" : "en-GB");

/* ───────────── small output pieces ───────────── */

const Dim = ({ children }: { children: React.ReactNode }) => <span className="os-term-dim">{children}</span>;
const Line = ({ children, tone }: { children: React.ReactNode; tone?: "dim" | "err" | "ok" | "warn" }) => (
  <p className={tone ? `os-term-${tone}` : undefined}>{children}</p>
);
const Head = ({ children }: { children: React.ReactNode }) => <p className="os-term-head">{children}</p>;

/* ───────────── apps, files and places ───────────── */

const APP_WORDS: Record<string, AppId> = {
  home: "home",
  desktop: "home",
  bureau: "home",
  work: "work",
  projects: "work",
  projets: "work",
  repos: "work",
  writing: "writing",
  blog: "writing",
  posts: "writing",
  ecrits: "writing",
  atlas: "atlas",
  map: "atlas",
  travel: "atlas",
  voyages: "atlas",
  now: "now",
  contact: "contact",
  mail: "contact",
};

const EXTERNAL: Record<string, string> = {
  github: SOCIALS.github,
  mastodon: SOCIALS.mastodon,
  youtube: SOCIALS.youtube,
  x: SOCIALS.x,
  spotify: SOCIALS.spotifyUser,
};

/** "~/work/", "./Writing", "/home/elliot/atlas", "écrits" → an app id. */
function resolveApp(arg: string): AppId | null {
  const a = arg
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .replace(/^\/home\/elliot/, "~")
    .replace(/^(\.\/|~\/|\/)/, "")
    .replace(/\/+$/, "");
  if (a === "" || a === "~" || a === ".." || a === "~/" || a === "/") return "home";
  return APP_WORDS[a] ?? null;
}

const appDirs = () => APPS.filter((a) => a.id !== "home").map((a) => a.path.slice(1));
const topRepos = (data: SiteData, n: number) => [...data.repos].sort((a, b) => b.stars - a.stars).slice(0, n);

/** What `ls` sees in each app directory. */
function filesIn(ctx: RunCtx, all = false): { name: string; dir?: boolean; dim?: boolean }[] {
  switch (ctx.cwd.id) {
    case "home":
      return [
        ...appDirs().map((name) => ({ name, dir: true })),
        { name: ctx.d.system.term.cat.readme },
        ...(all ? [{ name: ".secrets" }, { name: ".zshrc" }] : []),
      ];
    case "work":
      return topRepos(ctx.data, 12).map((r) => ({ name: r.name }));
    case "writing":
      return ctx.data.posts.slice(0, 12).map((p) => ({ name: `${p.slug}.md` }));
    case "atlas":
      return ctx.data.places.map((p) => ({ name: p.id, dim: p.status === "want" }));
    case "now":
      return [{ name: "now.md" }];
    case "contact":
      return [{ name: "hello.eml" }];
    case "admin":
      return [{ name: "sudoers", dim: true }];
  }
}

/** `sudo -i`, `admin`, `login`: the admin panel, behind its passkey */
function openAdmin(ctx: RunCtx) {
  const t = ctx.d.system.term.sudo;
  window.setTimeout(() => ctx.navigate(ctx.path("/admin")), 700);
  return (
    <div className="os-term-block os-term-stagger">
      <p style={{ "--i": 0 } as React.CSSProperties}>{t.passkey}</p>
      <p style={{ "--i": 1 } as React.CSSProperties} className="os-term-dim">
        {t.openingAdmin}
      </p>
    </div>
  );
}

/* ───────────── the commands ───────────── */

const HELP: { cmd: string; label: string; key: keyof Dict["system"]["term"]["help"]["cmds"]; fill?: boolean }[] = [
  { cmd: "help", label: "help", key: "help" },
  { cmd: "whoami", label: "whoami", key: "whoami" },
  { cmd: "ls", label: "ls", key: "ls" },
  { cmd: "open", label: "open <app>", key: "open", fill: true },
  { cmd: "projects", label: "projects", key: "projects" },
  { cmd: "posts", label: "posts", key: "posts" },
  { cmd: "now", label: "now", key: "now" },
  { cmd: "neofetch", label: "neofetch", key: "neofetch" },
  { cmd: "git log --oneline", label: "git log", key: "git" },
  { cmd: "contact", label: "contact", key: "contact" },
  { cmd: "sky", label: "sky <phase>", key: "sky", fill: true },
  { cmd: "lang", label: "lang <en|fr>", key: "lang", fill: true },
  { cmd: "sound", label: "sound <on|off>", key: "sound", fill: true },
  { cmd: "theme", label: "theme", key: "theme" },
  { cmd: "date", label: "date", key: "date" },
  { cmd: "echo", label: "echo <text>", key: "echo", fill: true },
  { cmd: "history", label: "history", key: "history" },
  { cmd: "lock", label: "lock", key: "lock" },
  { cmd: "clear", label: "clear", key: "clear" },
  { cmd: "exit", label: "exit", key: "exit" },
  { cmd: "sudo hire elliot", label: "sudo hire elliot", key: "hire" },
];

const PALETTE: { name: string; hex: string; key: keyof Dict["system"]["term"]["theme"] }[] = [
  { name: "ink", hex: "#0a0c0b", key: "ink" },
  { name: "paper", hex: "#ebe9e1", key: "paper" },
  { name: "signal", hex: "#b0cc86", key: "signal" },
  { name: "ion", hex: "#89b4a8", key: "ion" },
  { name: "lilac", hex: "#aea3c8", key: "lilac" },
  { name: "ember", hex: "#e0bd6e", key: "ember" },
  { name: "flare", hex: "#e2786b", key: "flare" },
];

const FETCH_SWATCHES = ["#0a0c0b", "#161a17", "#2b322d", "#8f988f", "#ebe9e1", "#b0cc86", "#89b4a8", "#aea3c8", "#e0bd6e", "#e2786b"];

const SKY_WORDS: Record<string, SkyMode> = {
  live: "auto",
  auto: "auto",
  direct: "auto",
  dawn: "dawn",
  aube: "dawn",
  day: "day",
  jour: "day",
  dusk: "dusk",
  crepuscule: "dusk",
  soir: "dusk",
  night: "night",
  nuit: "night",
};

const LANG_WORDS: Record<string, Locale> = {
  en: "en",
  english: "en",
  anglais: "en",
  fr: "fr",
  french: "fr",
  francais: "fr",
};

const fold = (s: string) =>
  s
    .toLowerCase()
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "");

const phaseName = (ctx: RunCtx, p: SkyPhase) => ctx.d.shell.control[p];

function whoami(ctx: RunCtx) {
  const [first, ...rest] = ctx.d.system.term.whoami;
  return (
    <div className="os-term-block">
      <p className="os-term-strong">{first}</p>
      {rest.map((l) => (
        <p key={l}>{l}</p>
      ))}
    </div>
  );
}

/** cat README.md: who, what's on this machine (each a command), where else */
function readme(ctx: RunCtx) {
  const t = ctx.d.system.term;
  const r = t.readme;
  const [first, ...rest] = t.whoami;
  const apps = (["work", "writing", "atlas", "now", "contact"] as const).map((id) => ({ id, label: ctx.d.shell.apps[id], about: r.apps[id] }));
  const elsewhere: [string, string, string][] = [
    ["GitHub", SOCIALS.github, "github.com/cempack"],
    ["Mastodon", SOCIALS.mastodon, "mastodon.social/@cempack"],
    ["YouTube", SOCIALS.youtube, "youtube.com/@cempack"],
  ];
  return (
    <div className="os-term-block os-term-readme">
      <p className="os-term-strong">
        <span className="os-term-ok"># </span>
        {first}
      </p>
      {rest.map((l) => (
        <p key={l}>{l}</p>
      ))}
      <p className="os-term-strong os-term-readme-h">
        <span className="os-term-ok">## </span>
        {r.here}
      </p>
      <dl className="os-term-help">
        {apps.map((a) => (
          <div key={a.id}>
            <dt>
              <Cmd value={`open ${a.id}`}>{a.label}</Cmd>
            </dt>
            <dd>{a.about}</dd>
          </div>
        ))}
      </dl>
      <p className="os-term-strong os-term-readme-h">
        <span className="os-term-ok">## </span>
        {r.elsewhere}
      </p>
      <dl className="os-term-kv">
        {elsewhere.map(([k, href, label]) => (
          <div key={k}>
            <dt>{k}</dt>
            <dd>
              <Ext href={href}>{label}</Ext>
            </dd>
          </div>
        ))}
        <div>
          <dt>{r.email}</dt>
          <dd>
            <Ext href={`mailto:${SOCIALS.email}`}>{SOCIALS.email}</Ext>
          </dd>
        </div>
      </dl>
      <Line tone="dim">{r.foot}</Line>
    </div>
  );
}

function contact(ctx: RunCtx) {
  const t = ctx.d.system.term.contact;
  const email = SOCIALS.email;
  const canCopy = typeof navigator !== "undefined" && !!navigator.clipboard;
  if (canCopy) {
    navigator.clipboard.writeText(email).then(
      () => {
        ctx.notify(ctx.d.shell.toast.copied);
        ctx.sound.blip("success");
      },
      () => ctx.notify(t.failed)
    );
  }
  return (
    <div className="os-term-block">
      <p>
        <Ext href={`mailto:${email}`} className="os-term-email">
          {email}
        </Ext>{" "}
        {canCopy ? <span className="os-term-ok">✓ {t.copied}</span> : <Dim>{t.failed}</Dim>}
      </p>
      <Line tone="dim">{nodes(t.or, { cmd: <Cmd value="open contact" /> })}</Line>
    </div>
  );
}

function now(ctx: RunCtx) {
  const t = ctx.d.system.term.now;
  const { track, playing, data, lang } = ctx;
  const latest = data.posts[0];
  const act = data.activity;
  const time = new Intl.DateTimeFormat("en-GB", { timeZone: "Europe/Paris", hour: "2-digit", minute: "2-digit" }).format(
    new Date()
  );
  const rows: [string, React.ReactNode][] = [
    [
      t.playing,
      track ? (
        <>
          {playing && <i className="os-term-live" aria-hidden />}
          <Ext href={track.url}>{track.title}</Ext> <Dim>· {track.artist}</Dim>
          {!playing && <Dim> ({t.lastPlayed})</Dim>}
        </>
      ) : (
        <Dim>{t.nothing}</Dim>
      ),
    ],
  ];
  if (act)
    rows.push([
      t.pushed,
      <>
        <Ext href={act.repoUrl}>{act.repo.replace(/^cempack\//, "")}</Ext> <Dim>· {act.message} · {timeAgo(act.createdAt, lang)}</Dim>
      </>,
    ]);
  if (latest)
    rows.push([
      t.wrote,
      <>
        <Ext href={latest.url}>{latest.title}</Ext> <Dim>· {timeAgo(latest.published_at, lang)}</Dim>
      </>,
    ]);
  rows.push([t.based, fill(t.basedValue, { time })]);
  rows.push([
    t.sky,
    <>
      {phaseName(ctx, ctx.sky.phase)}{" "}
      <Dim>({ctx.sky.mode === "auto" ? ctx.d.system.term.sky.modeLive : ctx.d.system.term.sky.modePinned})</Dim>
    </>,
  ]);
  return (
    <div className="os-term-block">
      <Head>{t.title}</Head>
      <dl className="os-term-kv">
        {rows.map(([k, v]) => (
          <div key={k}>
            <dt>{k}</dt>
            <dd>{v}</dd>
          </div>
        ))}
      </dl>
      <Line tone="dim">{nodes(t.more, { cmd: <Cmd value="open now" /> })}</Line>
    </div>
  );
}

function neofetch(ctx: RunCtx) {
  const t = ctx.d.system.term.fetch;
  const secs = Math.floor(performance.now() / 1000);
  const counts = new Map<string, number>();
  for (const r of ctx.data.repos) if (r.language) counts.set(r.language, (counts.get(r.language) ?? 0) + 1);
  const langs = [...counts.entries()].sort((a, b) => b[1] - a[1]).map(([l]) => l);
  const dpr = Math.round(Math.min(window.devicePixelRatio || 1, 3) * 10) / 10;
  const rows: [string, React.ReactNode][] = [
    [t.os, "emOS 26.10 Moss"],
    [t.host, "elliotmoreau.fr (Railway)"],
    [t.kernel, "Next.js 16.3 · React 19.2"],
    [t.shell, "zsh 5.9"],
    [t.wm, t.wmValue],
    [t.theme, "Moss"],
    [t.font, "Inter, JetBrains Mono"],
    [t.uptime, fill(t.uptimeValue, { m: Math.floor(secs / 60), s: secs % 60 })],
    [
      t.sky,
      `${phaseName(ctx, ctx.sky.phase)} (${ctx.sky.mode === "auto" ? ctx.d.system.term.sky.modeLive : ctx.d.system.term.sky.modePinned})`,
    ],
    [t.locale, ctx.lang === "fr" ? "fr_FR.UTF-8" : "en_GB.UTF-8"],
    [t.display, `${window.innerWidth}×${window.innerHeight} @${dpr}x`],
    [t.langs, langs.slice(0, 4).join(", ") || "TypeScript"],
  ];
  return (
    <div className="os-term-fetch">
      <div className="os-term-fetch-art">
        <EmosLogo className="os-term-fetch-logo" />
      </div>
      <div className="os-term-fetch-info">
        <p className="os-term-fetch-user">
          <span>elliot</span>@<span>emos</span>
        </p>
        <p className="os-term-fetch-rule" aria-hidden>
          ───────────
        </p>
        <dl className="os-term-kv os-term-kv--fetch">
          {rows.map(([k, v]) => (
            <div key={k}>
              <dt>{k}</dt>
              <dd>{v}</dd>
            </div>
          ))}
        </dl>
        <p className="os-term-fetch-pal" aria-hidden>
          {FETCH_SWATCHES.map((c) => (
            <Swatch key={c} color={c} size={14} />
          ))}
        </p>
      </div>
    </div>
  );
}

function catFile(file: string, ctx: RunCtx): Output {
  const t = ctx.d.system.term;
  const f = file.replace(/^(\.\/|~\/)/, "");
  if (/^(readme|lisezmoi)(\.md)?$/i.test(f)) return readme(ctx);
  if (f === ".secrets")
    return (
      <div className="os-term-block">
        {t.secrets.map((l) => (
          <p key={l}>{l}</p>
        ))}
      </div>
    );
  if (f === ".zshrc")
    return (
      <pre className="os-term-pre">
        {`export EDITOR=nvim\nexport THEME=nocturne\nalias please="sudo"\nalias ship="git push && open https://elliotmoreau.fr"\neval "$(starship init zsh)"`}
      </pre>
    );
  if (f === "now.md") return now(ctx);
  if (f === "hello.eml") return contact(ctx);
  if (ctx.cwd.id === "work") {
    const repo = ctx.data.repos.find((r) => r.name.toLowerCase() === f.toLowerCase());
    if (repo)
      return (
        <div className="os-term-block">
          <p className="os-term-strong">{repo.name}</p>
          {repo.description && <p>{repo.description}</p>}
          <p className="os-term-dim">
            ★ {repo.stars} · {repo.language || "-"} · <Ext href={repo.url}>{repo.url.replace(/^https?:\/\//, "")}</Ext>
          </p>
        </div>
      );
  }
  if (ctx.cwd.id === "writing") {
    const post = ctx.data.posts.find((p) => `${p.slug}.md` === f || p.slug === f);
    if (post)
      return (
        <div className="os-term-block">
          <p className="os-term-strong">{post.title}</p>
          <p className="os-term-dim">
            {new Intl.DateTimeFormat(locale(ctx.lang), { dateStyle: "long" }).format(new Date(post.published_at))} ·{" "}
            {fill(t.posts.read, { n: post.reading_time })}
          </p>
          {post.excerpt && <p className="os-term-excerpt">{post.excerpt}</p>}
          <p>
            <Ext href={post.url}>{post.url.replace(/^https?:\/\//, "")}</Ext>
          </p>
        </div>
      );
  }
  if (ctx.cwd.id === "atlas") {
    const place = ctx.data.places.find((p) => p.id === f.toLowerCase());
    if (place)
      return (
        <div className="os-term-block">
          <p className="os-term-strong">{place.name[ctx.lang]}</p>
          <p className="os-term-dim">
            {place.region[ctx.lang]} · {fmtCoords(place.lat, place.lon)} ·{" "}
            {place.status === "been" ? t.cat.been : t.cat.want}
          </p>
        </div>
      );
  }
  return <Line tone="err">{fill(t.cat.missing, { file })}</Line>;
}

const COW = (text: string) => {
  const line = text.slice(0, 48);
  const bar = "_".repeat(line.length + 2);
  const dash = "-".repeat(line.length + 2);
  return ` ${bar}\n< ${line} >\n ${dash}\n        \\   ^__^\n         \\  (oo)\\_______\n            (__)\\       )\\/\\\n                ||----w |\n                ||     ||`;
};

const ENV: Record<string, string> = {
  USER: "visitor",
  HOME: "/home/elliot",
  SHELL: "/bin/zsh",
  EDITOR: "nvim",
  OS: "emOS",
};

const COMMANDS: Command[] = [
  {
    name: "help",
    aliases: ["?", "man", "aide"],
    run: (_a, ctx) => {
      const t = ctx.d.system.term.help;
      return (
        <div className="os-term-block">
          <Head>
            {t.title} <Dim>· {t.usage}</Dim>
          </Head>
          <dl className="os-term-help">
            {HELP.map((h) => (
              <div key={h.cmd}>
                <dt>
                  <Cmd value={h.cmd} fillOnly={h.fill}>
                    {h.label}
                  </Cmd>
                </dt>
                <dd>{t.cmds[h.key]}</dd>
              </div>
            ))}
          </dl>
          <Line tone="dim">{t.hidden}</Line>
        </div>
      );
    },
  },
  { name: "whoami", aliases: ["about"], run: (_a, ctx) => whoami(ctx) },
  {
    name: "ls",
    aliases: ["dir", "ll", "la"],
    run: (args, ctx, _rest, name) => {
      const all = name === "la" || name === "ll" || args.some((a) => /^-\w*a/.test(a));
      const files = filesIn(ctx, all);
      return (
        <ul className="os-term-ls">
          {files.map((f) => (
            <li key={f.name} className={f.dir ? "is-dir" : f.dim ? "is-dim" : undefined}>
              <Cmd value={f.dir ? `cd ${f.name}` : `cat ${f.name}`}>
                {f.name}
                {f.dir ? "/" : ""}
              </Cmd>
            </li>
          ))}
        </ul>
      );
    },
  },
  {
    name: "open",
    aliases: ["cd"],
    args: (ctx) => {
      const base = [...appDirs(), "~"];
      return ctx.cwd.id === "home" ? [...base, ...Object.keys(EXTERNAL)] : [...base, "..", ...Object.keys(EXTERNAL)];
    },
    run: (args, ctx, _rest, name) => {
      const t = ctx.d.system.term.open;
      const arg = args[0];
      if (!arg && name === "open")
        return (
          <div className="os-term-block">
            <Line tone="dim">{t.usage}</Line>
            <ul className="os-term-ls">
              {appDirs().map((a) => (
                <li key={a} className="is-dir">
                  <Cmd value={`open ${a}`}>{a}/</Cmd>
                </li>
              ))}
            </ul>
          </div>
        );
      const ext = name === "open" && arg ? EXTERNAL[arg.toLowerCase()] : undefined;
      if (ext) {
        window.open(ext, "_blank", "noopener,noreferrer");
        return <Line>{fill(t.opening, { app: ext.replace(/^https?:\/\//, "") })}</Line>;
      }
      const id = resolveApp(arg ?? "~");
      if (!id) return <Line tone="err">{fill(t.unknown, { app: arg })}</Line>;
      const app = APPS.find((a) => a.id === id)!;
      const label = ctx.d.shell.apps[app.label];
      if (app.id === ctx.cwd.id) return <Line tone="dim">{fill(t.already, { app: label })}</Line>;
      ctx.navigate(ctx.path(app.path));
      return <Line>{fill(t.opening, { app: label })}</Line>;
    },
  },
  {
    name: "cat",
    aliases: ["less", "more", "bat"],
    args: (ctx) => filesIn(ctx, true).filter((f) => !f.dir).map((f) => f.name),
    run: (args, ctx) => (args[0] ? catFile(args[0], ctx) : <Line tone="dim">{ctx.d.system.term.cat.usage}</Line>),
    hidden: true,
  },
  { name: "pwd", hidden: true, run: (_a, ctx) => <Line>{`/home/elliot${ctx.cwd.id === "home" ? "" : ctx.cwd.path}`}</Line> },
  {
    name: "projects",
    aliases: ["repos", "projets", "work"],
    run: (_a, ctx) => {
      const t = ctx.d.system.term.projects;
      const repos = topRepos(ctx.data, 6);
      if (!repos.length) return <Line tone="dim">{t.empty}</Line>;
      return (
        <div className="os-term-block">
          <Head>{t.title}</Head>
          <ul className="os-term-repos">
            {repos.map((r) => (
              <li key={r.name}>
                <span className="os-term-stars tabular">★ {r.stars}</span>
                <Ext href={r.url} className="os-term-repo">
                  {r.name}
                </Ext>
                <span className="os-term-lang">
                  {r.language && <Swatch color={LANG_COLORS[r.language] ?? LANG_FALLBACK} size={8} />}
                  {r.language || "-"}
                </span>
                {r.description && <span className="os-term-desc">{r.description}</span>}
              </li>
            ))}
          </ul>
          <Line tone="dim">{nodes(t.all, { cmd: <Cmd value="open work" /> })}</Line>
        </div>
      );
    },
  },
  {
    name: "posts",
    aliases: ["blog", "articles", "writing"],
    run: (_a, ctx) => {
      const t = ctx.d.system.term.posts;
      const posts = ctx.data.posts.slice(0, 5);
      if (!posts.length) return <Line tone="dim">{t.empty}</Line>;
      const fmt = new Intl.DateTimeFormat(locale(ctx.lang), { day: "2-digit", month: "short", timeZone: "Europe/Paris" });
      return (
        <div className="os-term-block">
          <Head>{t.title}</Head>
          <ul className="os-term-posts">
            {posts.map((p) => (
              <li key={p.slug}>
                <span className="os-term-date tabular">{fmt.format(new Date(p.published_at))}</span>
                <Ext href={p.url}>{p.title}</Ext>
                <span className="os-term-dim tabular">{fill(t.read, { n: p.reading_time })}</span>
              </li>
            ))}
          </ul>
          <Line tone="dim">{nodes(t.all, { cmd: <Cmd value="open writing" /> })}</Line>
        </div>
      );
    },
  },
  { name: "now", aliases: ["status"], run: (_a, ctx) => now(ctx) },
  { name: "neofetch", aliases: ["fastfetch", "screenfetch", "uname"], run: (_a, ctx) => neofetch(ctx) },
  { name: "contact", aliases: ["email", "e-mail"], run: (_a, ctx) => contact(ctx) },
  {
    name: "sky",
    aliases: ["ciel"],
    args: () => ["live", "dawn", "day", "dusk", "night"],
    run: (args, ctx) => {
      const t = ctx.d.system.term.sky;
      if (!args[0])
        return (
          <div className="os-term-block">
            <Line>
              {fill(t.current, {
                phase: phaseName(ctx, ctx.sky.phase),
                mode: ctx.sky.mode === "auto" ? t.modeLive : t.modePinned,
              })}
            </Line>
            <Line tone="dim">{t.usage}</Line>
          </div>
        );
      const mode = SKY_WORDS[fold(args[0])];
      if (!mode) return <Line tone="err">{t.usage}</Line>;
      ctx.sky.setMode(mode);
      ctx.sound.blip("toggle");
      if (mode === "auto") return <Line>{fill(t.live, { phase: phaseName(ctx, phaseOf(sunAt(new Date()))) })}</Line>;
      return <Line>{fill(t.pinned, { phase: phaseName(ctx, mode) })}</Line>;
    },
  },
  {
    name: "lang",
    aliases: ["langue", "language"],
    args: () => ["en", "fr"],
    run: (args, ctx) => {
      const t = ctx.d.system.term.lang;
      const to = args[0] ? LANG_WORDS[fold(args[0])] : undefined;
      if (!to) return <Line tone={args[0] ? "err" : "dim"}>{t.usage}</Line>;
      if (to === ctx.lang) return <Line tone="dim">{t.already}</Line>;
      ctx.switchLang(to);
      return <Line>{fill(t.switching, { lang: t.names[to] })}</Line>;
    },
  },
  {
    name: "sound",
    aliases: ["son", "mute", "unmute"],
    args: () => ["on", "off"],
    run: (args, ctx, _rest, name) => {
      const t = ctx.d.system.term.sound;
      const want = name === "mute" ? "off" : name === "unmute" ? "on" : args[0]?.toLowerCase();
      if (want && want !== "on" && want !== "off" && want !== "toggle") return <Line tone="err">{t.usage}</Line>;
      let muted = ctx.sound.muted;
      if (want === "toggle" || (want === "on" && muted) || (want === "off" && !muted)) {
        ctx.sound.toggle();
        muted = !muted;
        if (!muted) ctx.sound.blip("toggle");
      }
      return (
        <div className="os-term-block">
          <Line>{fill(t.state, { state: muted ? t.off : t.on })}</Line>
          {!want && <Line tone="dim">{t.usage}</Line>}
        </div>
      );
    },
  },
  {
    name: "theme",
    aliases: ["palette", "colors", "colours"],
    run: (_a, ctx) => {
      const t = ctx.d.system.term.theme;
      return (
        <div className="os-term-block">
          <Head>{t.title}</Head>
          <ul className="os-term-palette">
            {PALETTE.map((p) => (
              <li key={p.name}>
                <Swatch color={p.hex} size={14} />
                <span className="os-term-pal-name" style={{ color: p.name === "ink" ? undefined : p.hex }}>
                  {p.name}
                </span>
                <span className="os-term-dim tabular">{p.hex}</span>
                <span className="os-term-pal-desc">{t[p.key]}</span>
              </li>
            ))}
          </ul>
        </div>
      );
    },
  },
  {
    name: "date",
    aliases: ["time", "heure"],
    run: (_a, ctx) => (
      <Line>
        {new Intl.DateTimeFormat(locale(ctx.lang), {
          timeZone: "Europe/Paris",
          dateStyle: "full",
          timeStyle: "long",
        }).format(new Date())}
      </Line>
    ),
  },
  {
    name: "echo",
    aliases: ["print", "say"],
    run: (_a, _ctx, rest) => (
      <p className="os-term-echo-out">{rest.replace(/\$(\w+)/g, (all, k: string) => ENV[k] ?? all) || " "}</p>
    ),
  },
  {
    name: "history",
    run: (_a, ctx) => {
      const h = ctx.history;
      if (!h.length) return <Line tone="dim">{ctx.d.system.term.history.empty}</Line>;
      const pad = String(h.length).length;
      return (
        <ol className="os-term-history">
          {h.map((c, i) => (
            <li key={i}>
              <span className="os-term-dim tabular">{String(i + 1).padStart(pad, " ")}</span>
              <Cmd value={c}>{c}</Cmd>
            </li>
          ))}
        </ol>
      );
    },
  },
  {
    name: "clear",
    aliases: ["cls"],
    run: (_a, ctx) => {
      ctx.clear();
      return SILENT;
    },
  },
  {
    name: "exit",
    aliases: ["logout", "quit"],
    run: (_a, ctx) => {
      ctx.exit();
      return SILENT;
    },
  },
  {
    name: "sudo",
    args: () => ["hire elliot", "make me a sandwich"],
    run: (args, ctx, rest) => {
      const t = ctx.d.system.term.sudo;
      const what = fold(rest).replace(/\s+/g, " ");
      if (!what) return <Line tone="dim">{t.usage}</Line>;
      // Elliot's way in: a root shell opens the admin panel (a passkey guards it)
      if (/^(-i|-s|su|admin|login)$/.test(what)) return openAdmin(ctx);
      if (/^hire( elliot( moreau)?)?$/.test(what)) {
        window.setTimeout(() => ctx.navigate(ctx.path("/contact")), 1400);
        return (
          <div className="os-term-block os-term-stagger">
            <p style={{ "--i": 0 } as React.CSSProperties}>
              {t.prompt} <span className="os-term-dim">••••••••</span>
            </p>
            <p style={{ "--i": 1 } as React.CSSProperties} className="os-term-ok">
              {t.granted}
            </p>
            <p style={{ "--i": 2 } as React.CSSProperties} className="os-term-dim">
              {t.opening}
            </p>
          </div>
        );
      }
      if (what === "make me a sandwich") return <Line>{t.sandwich}</Line>;
      if (args[0] === "rm") return COMMANDS_BY_NAME.get("rm")!.run(args.slice(1), ctx, rest, "rm");
      return (
        <div className="os-term-block">
          <p>
            {t.prompt} <span className="os-term-dim">••••••••</span>
          </p>
          <Line tone="err">{t.denied}</Line>
        </div>
      );
    },
  },
  { name: "admin", aliases: ["login", "su"], hidden: true, run: (_a, ctx) => openAdmin(ctx) },
  {
    name: "git",
    args: () => ["log --oneline", "show", "status"],
    run: (args, ctx) => {
      const g = ctx.d.system.term.git;
      const [sub, ref] = args;
      if (sub === "log" || sub === "lg") return <GitLog />;
      if (sub === "show") return <GitShow refName={ref?.replace(/^HEAD$/i, "") || "HEAD"} />;
      if (sub === "status")
        return (
          <div className="os-term-block">
            {g.status.map((l, i) => (
              <p key={i}>{l || "\u00a0"}</p>
            ))}
          </div>
        );
      return <Line tone="dim">{g.usage}</Line>;
    },
  },
  {
    name: "hire",
    hidden: true,
    run: (_a, ctx) => <Line tone="err">{ctx.d.system.term.sudo.needSudo}</Line>,
  },
  {
    name: "make",
    hidden: true,
    run: (_a, ctx, rest) =>
      fold(rest) === "me a sandwich" ? (
        <Line>{ctx.d.system.term.sudo.noSandwich}</Line>
      ) : (
        <Line tone="err">make: *** No targets specified and no makefile found. Stop.</Line>
      ),
  },
  {
    name: "rm",
    hidden: true,
    run: (_a, ctx) => {
      ctx.shake();
      return <Line tone="warn">{ctx.d.system.term.eggs.rm}</Line>;
    },
  },
  { name: "vim", aliases: ["vi", "nvim", "nano", "emacs"], hidden: true, run: (_a, ctx) => <Line>{ctx.d.system.term.eggs.vim}</Line> },
  {
    name: ":q",
    aliases: [":q!", ":wq", ":x", "zz"],
    hidden: true,
    run: (_a, ctx) => {
      window.setTimeout(ctx.close, 260);
      return <Line tone="dim">{ctx.d.system.term.eggs.quit}</Line>;
    },
  },
  {
    name: "lock",
    aliases: ["hyprlock", "loginctl"],
    run: (_a, ctx) => {
      window.setTimeout(() => {
        ctx.close();
        window.dispatchEvent(new CustomEvent("em:lock"));
      }, 200);
      return SILENT;
    },
  },
  {
    name: "reboot",
    aliases: ["restart", "shutdown"],
    hidden: true,
    run: (_a, ctx) => {
      window.setTimeout(ctx.reboot, 650);
      return <Line tone="dim">{ctx.d.system.term.eggs.reboot}</Line>;
    },
  },
  {
    name: "cowsay",
    hidden: true,
    run: (_a, ctx, rest) => <pre className="os-term-pre">{COW(rest.trim() || ctx.d.system.term.eggs.moo)}</pre>,
  },
  { name: "coffee", aliases: ["cafe", "brew"], hidden: true, run: (_a, ctx) => <Line>{ctx.d.system.term.eggs.coffee}</Line> },
  {
    name: "ping",
    hidden: true,
    run: (_a, ctx) => <Line>{fill(ctx.d.system.term.eggs.ping, { ms: 8 + Math.floor(Math.random() * 14) })}</Line>,
  },
  {
    name: "hello",
    aliases: ["hi", "hey", "bonjour", "salut", "yo"],
    hidden: true,
    run: (_a, ctx) => <Line>{nodes(ctx.d.system.term.eggs.hello, { help: <Cmd value="help" /> })}</Line>,
  },
];

const COMMANDS_BY_NAME = new Map<string, Command>();
for (const c of COMMANDS) {
  COMMANDS_BY_NAME.set(c.name, c);
  for (const a of c.aliases ?? []) COMMANDS_BY_NAME.set(a, c);
}

/** Names offered by Tab: the listed commands plus the two everyone types. */
const COMPLETABLE = [...COMMANDS.filter((c) => !c.hidden).map((c) => c.name), "cd", "cat", "email"].sort();

function distance(a: string, b: string) {
  const dp = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    let prev = dp[0];
    dp[0] = i;
    for (let j = 1; j <= b.length; j++) {
      const tmp = dp[j];
      dp[j] = Math.min(dp[j] + 1, dp[j - 1] + 1, prev + (a[i - 1] === b[j - 1] ? 0 : 1));
      prev = tmp;
    }
  }
  return dp[b.length];
}

/** Run one line of input. */
export function runCommand(raw: string, ctx: RunCtx): Output {
  const line = raw.trim();
  if (!line) return null;
  const [head, ...args] = line.split(/\s+/);
  const name = head.toLowerCase();
  const rest = line.slice(head.length).trim();
  const cmd = COMMANDS_BY_NAME.get(name);
  if (cmd) return cmd.run(args, ctx, rest, name);

  const t = ctx.d.system.term;
  const near = COMPLETABLE.map((c) => [c, distance(name, c)] as const).sort((a, b) => a[1] - b[1])[0];
  return (
    <div className="os-term-block">
      <Line tone="err">zsh: {fill(t.notFound, { cmd: head })}</Line>
      {near && near[1] <= (name.length < 4 ? 1 : 2) && <Line tone="dim">{nodes(t.didYouMean, { cmd: <Cmd value={near[0]} /> })}</Line>}
    </div>
  );
}

const commonPrefix = (xs: string[]) =>
  xs.reduce((p, x) => {
    let i = 0;
    while (i < p.length && i < x.length && p[i] === x[i]) i++;
    return p.slice(0, i);
  });

/**
 * Tab completion for the current input. `ghost` is the inline suggestion
 * (fish style), `value` the completed line, `list` the candidates to print
 * when Tab can't decide.
 */
export function complete(value: string, ctx: RunCtx): { ghost: string; value: string | null; list: string[] } {
  const none = { ghost: "", value: null, list: [] };
  if (!value || /^\s/.test(value)) return none;
  const space = value.indexOf(" ");
  let base = "";
  let token = value;
  let pool = COMPLETABLE;
  let needsArg = (name: string) => !!COMMANDS_BY_NAME.get(name)?.args;
  if (space !== -1) {
    const head = value.slice(0, space).toLowerCase();
    const cmd = COMMANDS_BY_NAME.get(head);
    if (!cmd?.args) return none;
    token = value.slice(space + 1).replace(/^\s+/, "");
    base = value.slice(0, value.length - token.length);
    pool = cmd.args(ctx);
    needsArg = () => false;
  }
  const lower = token.toLowerCase();
  const matches = pool.filter((c) => c.toLowerCase().startsWith(lower) && c.length > 0);
  if (!matches.length) return none;
  const first = matches[0];
  const ghost = first.length > token.length ? first.slice(token.length) : "";
  if (matches.length === 1) {
    const done = base + first + (needsArg(first) ? " " : "");
    return { ghost, value: done === value ? null : done, list: [] };
  }
  const prefix = commonPrefix(matches);
  if (prefix.length > token.length) return { ghost, value: base + prefix, list: [] };
  return { ghost, value: null, list: matches };
}
