"use client";

import { createElement, useMemo } from "react";
import { usePathname, useRouter } from "next/navigation";
import type { Command } from "@/components/ui/CommandPalette";
import { useToast } from "@/components/Toasts";
import { rememberLocale, switchLocaleHref, useI18n } from "@/i18n/client";
import { useSound } from "@/lib/sound";
import { scrollToY } from "@/lib/scroller";
import { SITE_MAILTO, SOCIALS } from "@/lib/socials";
import { PixelGlyph, type Cells } from "@/components/glyphs";
import { G_COMMIT, G_PEN } from "@/components/apps/home/desktop/icons";
import { APPS } from "./apps";
import { AppGlyph, type IconId } from "./icons";
import { G_EXTERNAL } from "./window/glyphs";
import { useSiteData } from "./SiteData";
import { useSky, type SkyMode } from "./sky";
import { useTerminal } from "./Terminal";
import type { PanelId } from "./menubar/Panel";
import { BLOG_URL, fill, restartOS } from "./menubar/util";
import { lockOS } from "./Intro";
import { useMedia } from "@/hooks/env";
import { useSpotifyStatus } from "@/hooks/useSpotifyStatus";
import { DeadLetter } from "./DeadLetter";
import { PlaceArt } from "./PlaceArt";
import { loadDraft, saveDraft } from "@/components/apps/contact/mail";
import { suggest } from "@/components/apps/notfound/suggest";
import { PlateThumb } from "@/components/apps/writing/PlateThumb";
import { RepoArt } from "@/components/apps/work/RepoArt";
import { loc } from "@/lib/content";
import { trail } from "./trail";
import { useSyncExternalStore } from "react";

/* Intl formatters are costly to build: build them once */
let FMTS: { day: (d: Date) => string; dm: (d: Date) => string; hm: (d: Date) => string } | null = null;
function fmts() {
  if (FMTS) return FMTS;
  const tz = { timeZone: "Europe/Paris" } as const;
  const a = new Intl.DateTimeFormat("en-CA", { ...tz, dateStyle: "short" });
  const b = new Intl.DateTimeFormat("en-GB", { ...tz, day: "2-digit", month: "2-digit" });
  const c = new Intl.DateTimeFormat("en-GB", { ...tz, hour: "2-digit", minute: "2-digit", hour12: false });
  return (FMTS = { day: (d) => a.format(d), dm: (d) => b.format(d), hm: (d) => c.format(d) });
}
const SKY_MODES: SkyMode[] = ["auto", "dawn", "day", "dusk", "night"];
/** 7×7 chevron prompt, for actions */
const G_ACTION: Cells = [[1, 1], [2, 2], [3, 3], [2, 4], [1, 5]];

const toTop = () => scrollToY(0, true);
const ext = (href: string) => () => window.open(href, "_blank", "noopener,noreferrer");
const openPanel = (id: PanelId) => () => window.dispatchEvent(new CustomEvent<PanelId>("em:menubar", { detail: id }));
const host = (url: string) => url.replace(/^https?:\/\//, "").replace(/\/$/, "");

const glyph = (cells: Cells) => createElement(PixelGlyph, { cells, size: 14 });
const appGlyph = (app: IconId) => createElement(AppGlyph, { app, size: 18 });

/**
 * Spotlight command set: apps (localized paths, opened with the
 * "app-open" view transition), actions (copy email, language, sound, sky
 * phases, restart, Terminal, back to top, the menu bar's panels), posts,
 * repos and elsewhere-links. Everything localized; returns Command[] for
 * <CommandPalette>.
 */
export function useSpotlightCommands(): Command[] {
  const router = useRouter();
  const pathname = usePathname();
  const { t, other, path, lang } = useI18n();
  const { muted, toggle, blip } = useSound();
  const { notify } = useToast();
  const { mode, setMode } = useSky();
  const { setOpen: setTerminal } = useTerminal();
  const { posts, repos, activity, spotify, now, places } = useSiteData();
  const stops = useSyncExternalStore(trail.subscribe, trail.get, trail.server);
  const music = useSpotifyStatus(spotify);
  const phone = useMedia("(max-width: 767px)");

  return useMemo(() => {
    const s = t.shell;
    const sp = s.spotlight;
    const c = s.control;

    const apps: Command[] = APPS.map((app) => ({
      id: `app-${app.id}`,
      group: sp.apps,
      label: s.apps[app.label],
      hint: sp.app,
      keywords: `${app.id} ${app.path} open app`,
      icon: appGlyph(app.id),
      perform: () => router.push(path(app.path), { transitionTypes: ["app-open"] }),
    }));
    apps.push({
      id: "app-terminal",
      group: sp.apps,
      label: s.apps.terminal,
      hint: sp.app,
      keywords: "terminal shell console cli bash",
      icon: appGlyph("terminal"),
      perform: () => setTerminal(true),
    });

    const actions: Command[] = [
      {
        id: "copy-email",
        group: sp.actions,
        label: sp.copyEmail,
        hint: SOCIALS.email,
        keywords: "mail email contact clipboard copy",
        perform: () => {
          navigator.clipboard?.writeText(SOCIALS.email).catch(() => {});
          blip("success");
          notify(SOCIALS.email, s.toast.copied);
        },
      },
      {
        id: "switch-lang",
        group: sp.actions,
        label: sp.switchLang,
        hint: other.toUpperCase(),
        keywords: "language langue english français french anglais",
        perform: () => {
          rememberLocale(other);
          blip("toggle");
          router.push(switchLocaleHref(pathname, other));
        },
      },
      {
        id: "toggle-sound",
        group: sp.actions,
        label: muted ? sp.soundOn : sp.soundOff,
        keywords: `${sp.toggleSound} sound son audio mute muet`,
        perform: () => {
          toggle();
          if (muted) window.setTimeout(() => blip("toggle"), 0);
          notify(muted ? s.toast.soundOn : s.toast.soundOff, s.toast.sound);
        },
      },
      ...SKY_MODES.map<Command>((md) => ({
        id: `sky-${md}`,
        group: sp.actions,
        label: fill(sp.sky, { phase: c[md] }),
        hint: md === mode ? sp.current : undefined,
        keywords: `sky ciel theme phase ${md} ${c.short[md]}`,
        perform: () => {
          setMode(md);
          blip("toggle");
          notify(md === "auto" ? s.toast.skySet : fill(s.toast.skyPinned, { phase: c[md] }), s.toast.sky);
        },
      })),
      {
        id: "terminal",
        group: sp.actions,
        label: sp.openTerminal,
        hint: "`",
        keywords: "terminal shell console",
        perform: () => setTerminal(true),
      },
      { id: "top", group: sp.actions, label: sp.top, keywords: "scroll top haut", perform: toTop },
      { id: "about", group: sp.actions, label: sp.about, keywords: "about emos version system info fastfetch", perform: openPanel("about") },
      {
        id: "control-center",
        group: sp.actions,
        label: sp.controlCenter,
        keywords: "control center settings réglages",
        perform: openPanel("control"),
      },
      {
        id: "notification-center",
        group: sp.actions,
        label: sp.notifications,
        keywords: "notifications calendar calendrier clock horloge time heure",
        perform: openPanel("notifications"),
      },
      { id: "lock", group: sp.actions, label: sp.lock, keywords: "lock screen verrouiller écran", perform: lockOS },
      { id: "restart", group: sp.actions, label: sp.restart, keywords: "restart reboot boot redémarrer", perform: restartOS },
    ];

    const fm = fmts();
    // each result shows its real picture: a post's sky, a repo's minimap, a place's postcard
    const writing: Command[] = posts.map((p) => ({
      id: `post-${p.slug}`,
      group: sp.posts,
      label: p.title,
      hint: p.reading_time ? fill(sp.minRead, { n: p.reading_time }) : undefined,
      keywords: `${p.excerpt} ${p.tags.map((x) => x.name).join(" ")} blog post article`,
      icon: glyph(G_PEN),
      thumb: createElement(PlateThumb, { seed: p.slug, cols: 34, rows: 24 }),
      preview: {
        art: createElement(PlateThumb, { seed: p.slug, cols: 96, rows: 60 }),
        title: p.title,
        meta: [fm.dm(new Date(p.published_at)), p.reading_time ? fill(sp.minRead, { n: p.reading_time }) : "", p.tags[0]?.name ?? ""].filter(Boolean).join(" · "),
        body: p.excerpt,
      },
      // posts read in full on the site now
      perform: () => router.push(path(`/writing/${p.slug}`), { transitionTypes: ["app-open"] } as never),
    }));

    const projects: Command[] = repos.slice(0, 10).map((r) => ({
      id: `repo-${r.name}`,
      group: sp.repos,
      label: r.name,
      hint: [r.language, r.stars ? `★ ${r.stars}` : ""].filter(Boolean).join(" · ") || undefined,
      keywords: `${r.description} ${r.topics.join(" ")} repo github`,
      icon: glyph(G_COMMIT),
      thumb: createElement(RepoArt, { name: r.name, language: r.language }),
      preview: {
        art: createElement(RepoArt, { name: r.name, language: r.language, caret: true }),
        title: r.name,
        meta: [r.language, r.stars ? `★ ${r.stars}` : "", r.pushedAt ? fm.dm(new Date(r.pushedAt)) : ""].filter(Boolean).join(" · "),
        body: r.description,
      },
      perform: () => router.push(`${path("/work")}?repo=${encodeURIComponent(r.name)}`, { transitionTypes: ["app-open"] } as never),
    }));

    const atlas: Command[] = places
      .filter((pl) => !pl.home)
      .map((pl) => ({
        id: `place-${pl.id}`,
        group: sp.places,
        label: loc(pl.name, lang),
        hint: pl.status === "been" ? sp.been : sp.want,
        keywords: `${pl.id} ${pl.name.en} ${pl.name.fr} ${pl.region.en} ${pl.region.fr} ${pl.iso} atlas travel voyage`,
        thumb: createElement(PlaceArt, { place: pl }),
        preview: {
          art: createElement(PlaceArt, { place: pl, stamp: true }),
          title: loc(pl.name, lang),
          meta: [loc(pl.region, lang), pl.status === "been" ? sp.been : sp.want, pl.visited ?? ""].filter(Boolean).join(" · "),
          body: pl.note ? loc(pl.note, lang) : pl.tripFrom && pl.tripTo ? fill(sp.trip, { from: pl.tripFrom, to: pl.tripTo }) : undefined,
        },
        perform: () => router.push(`${path("/atlas")}#${pl.id}`, { transitionTypes: ["app-open"] } as never),
      }));

    const links: Command[] = [
      { id: "ln-github", label: "GitHub", hint: "@cempack", href: SOCIALS.github, k: "code repos" },
      { id: "ln-blog", label: sp.blog, hint: host(BLOG_URL), href: BLOG_URL, k: "ghost writing articles" },
      { id: "ln-mastodon", label: "Mastodon", hint: "@cempack", href: SOCIALS.mastodon, k: "fediverse" },
      { id: "ln-youtube", label: "YouTube", hint: "@cempack", href: SOCIALS.youtube, k: "video" },
      { id: "ln-x", label: "X", hint: "@cempack_", href: SOCIALS.x, k: "twitter" },
      { id: "ln-spotify", label: "Spotify", hint: "elliot", href: SOCIALS.spotifyUser, k: "music musique playlists" },
    ].map(({ id, label, hint, href, k }) => ({ id, group: sp.links, label, hint, keywords: k, icon: glyph(G_EXTERNAL), perform: ext(href) }));
    links.push({
      id: "ln-email",
      group: sp.links,
      label: sp.email,
      hint: SOCIALS.email,
      keywords: "mail email contact",
      icon: glyph(G_EXTERNAL),
      perform: () => {
        window.location.href = `mailto:${SITE_MAILTO}`;
      },
    });

    const act = actions.map((a) => ({ ...a, icon: a.icon ?? glyph(G_ACTION) }));

    // the departures board: what's new, each row opening what it shows
    const b = sp.board;
    const { day, dm, hm } = fmts();
    const today = day(new Date());
    const when = (iso: string) => {
      const d = new Date(iso);
      return day(d) === today ? hm(d) : dm(d);
    };
    const board: Command[] = [];
    const post = posts[0];
    if (post) {
      const n = Math.max(1, post.reading_time || 1);
      board.push({
        id: "board-post",
        group: b.title,
        label: fill(b.post, { title: post.title, n }),
        board: { time: dm(new Date(post.published_at)), dest: post.title, via: post.tags[0]?.name ?? "", status: fill(b.min, { n }), key: post.slug, remember: true },
        perform: () => router.push(`${path("/writing")}?p=${encodeURIComponent(post.slug)}`, { transitionTypes: ["app-open"] } as never),
      });
    }
    if (activity) {
      board.push({
        id: "board-push",
        group: b.title,
        label: fill(b.push, { repo: activity.repo, msg: activity.message }),
        board: { time: when(activity.createdAt), dest: activity.repo, via: activity.message, status: b.pushed, key: activity.createdAt, remember: true },
        perform: () => router.push(`${path("/work")}?repo=${encodeURIComponent(activity.repo)}`, { transitionTypes: ["app-open"] } as never),
      });
    }
    const track = music.track;
    if (track) {
      board.push({
        id: "board-music",
        group: b.title,
        label: fill(music.playing ? b.nowPlaying : b.lastPlayed, { title: track.title, artist: track.artist }),
        board: {
          time: music.playing ? hm(new Date()) : track.playedAt ? when(track.playedAt) : "",
          dest: track.title,
          via: track.artist,
          status: music.playing ? b.playing : b.played,
          lime: music.playing,
          key: `${track.title}|${track.artist}`,
          remember: false,
        },
        perform: track.url ? ext(track.url) : () => router.push(path("/now")),
      });
    }
    // phones keep three rows, so results stay above the keyboard
    if (!phone) {
      board.push({
        id: "board-focus",
        group: b.title,
        label: fill(b.focus, { name: now.focus.name, title: now.focus.title[lang] }),
        board: { time: dm(new Date(now.updated)), dest: now.focus.name, via: now.focus.title[lang], status: b.building, key: `${now.focus.name}|${now.focus.title.en}`, remember: true },
        perform: () => router.push(path("/now"), { transitionTypes: ["app-open"] } as never),
      });
    }

    // arrivals: where you've been this visit, newest first (not the page you're on)
    const here = typeof window === "undefined" ? "" : `${window.location.pathname}${window.location.search}${window.location.hash}`;
    const appName = (id: string) => {
      const app = APPS.find((x) => x.id === id);
      return app ? s.apps[app.label] : "";
    };
    const itemName = (st: (typeof stops)[number]) => {
      if (!st.item) return appName(st.app);
      if (st.app === "writing") return posts.find((p) => p.slug === st.item)?.title ?? st.item;
      if (st.app === "atlas") {
        const pl = places.find((x) => x.id === st.item);
        return pl ? loc(pl.name, lang) : st.item;
      }
      return st.item;
    };
    const arrivals: Command[] = stops
      .filter((st) => st.href !== here)
      .slice(0, phone ? 3 : 5)
      .map((st) => ({
        id: `arrival-${st.app}-${st.item}`,
        group: sp.arrivals,
        label: `${itemName(st)}, ${appName(st.app)}`,
        board: {
          arrival: true,
          time: fmts().hm(new Date(st.at)),
          dest: itemName(st),
          via: st.item ? appName(st.app) : "",
          status: sp.arrived,
          key: `${st.href}|${st.at}`,
          remember: false,
        },
        perform: () => router.push(st.href),
      }));

    return [...board, ...arrivals, ...apps, ...act, ...writing, ...projects, ...atlas, ...links];
  }, [t, other, path, router, pathname, muted, toggle, blip, notify, mode, setMode, setTerminal, posts, repos, activity, music, phone, lang, now, places, stops]);
}

/**
 * When nothing matches: a "did you mean" (the 404's own matcher over apps,
 * posts and repos) for a typo, and, from three characters, the dead
 * letter: the query as a letter to Elliot that opens Mail when posted.
 */
export function useSpotlightFallback() {
  const router = useRouter();
  const { t, path } = useI18n();
  const { posts, repos } = useSiteData();
  return useMemo(() => {
    const sp = t.shell.spotlight;
    return (query: string): Command[] => {
      const q = query.trim();
      if (q.length < 2) return [];
      const out: Command[] = [];
      const hit = suggest(q.replace(/\s+/g, "-").toLowerCase(), { posts, repos });
      if (hit) {
        const app = APPS.find((a) => a.id === hit.app);
        const name = hit.kind === "app" ? (app ? t.shell.apps[app.label] : hit.to) : hit.name;
        out.push({
          id: "fb-mean",
          group: sp.didYouMean,
          label: fill(sp.meant, { name }),
          icon: hit.kind === "app" ? appGlyph(hit.app) : glyph(hit.kind === "post" ? G_PEN : G_COMMIT),
          perform: () => {
            if (hit.kind === "app" && app) router.push(path(app.path), { transitionTypes: ["app-open"] } as never);
            else if (hit.kind === "repo") router.push(`${path("/work")}?repo=${encodeURIComponent(hit.name)}`, { transitionTypes: ["app-open"] } as never);
            else if (hit.kind === "post") window.open(hit.href, "_blank", "noopener,noreferrer");
          },
        });
      }
      if (q.length >= 3) {
        // the visitor's own date and time, as a postmark prints it: "11.10 19:14"
        const d = new Date();
        const two = (n: number) => String(n).padStart(2, "0");
        const when = `${two(d.getDate())}.${two(d.getMonth() + 1)} ${two(d.getHours())}:${two(d.getMinutes())}`;
        out.push({
          id: "fb-letter",
          group: sp.mail,
          label: fill(sp.letter, { query: q }),
          launch: 220,
          option: function Letter({ active, launching, post }) {
            return createElement(DeadLetter, { query: q, active, launching, post, labels: { address: sp.address, nothing: sp.nothingMail, when } });
          },
          perform: () => {
            // the search becomes the subject, unless a draft already has one
            const d = loadDraft();
            if (!d?.subject.trim()) saveDraft({ subject: q, body: d?.body ?? "" });
            try {
              sessionStorage.setItem("em-mail-focus", "body");
            } catch {}
            router.push(path("/contact"), { transitionTypes: ["app-open"] } as never);
          },
        });
      }
      return out;
    };
  }, [t, path, router, posts, repos]);
}
