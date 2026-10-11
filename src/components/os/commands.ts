"use client";

import { useMemo } from "react";
import { usePathname, useRouter } from "next/navigation";
import type { Command } from "@/components/ui/CommandPalette";
import { useToast } from "@/components/Toasts";
import { rememberLocale, switchLocaleHref, useI18n } from "@/i18n/client";
import { useSound } from "@/lib/sound";
import { scrollToY } from "@/lib/scroller";
import { SOCIALS } from "@/lib/places";
import { APPS } from "./apps";
import { useSiteData } from "./SiteData";
import { useSky, type SkyMode } from "./sky";
import { useTerminal } from "./Terminal";
import type { PanelId } from "./menubar/Panel";
import { BLOG_URL, fill, restartOS } from "./menubar/util";
import { lockOS } from "./Intro";

const SKY_MODES: SkyMode[] = ["auto", "dawn", "day", "dusk", "night"];

const toTop = () => scrollToY(0, true);
const ext = (href: string) => () => window.open(href, "_blank", "noopener,noreferrer");
const openPanel = (id: PanelId) => () => window.dispatchEvent(new CustomEvent<PanelId>("em:menubar", { detail: id }));
const host = (url: string) => url.replace(/^https?:\/\//, "").replace(/\/$/, "");

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
  const { t, other, path } = useI18n();
  const { muted, toggle, blip } = useSound();
  const { notify } = useToast();
  const { mode, setMode } = useSky();
  const { setOpen: setTerminal } = useTerminal();
  const { posts, repos } = useSiteData();

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
      perform: () => router.push(path(app.path), { transitionTypes: ["app-open"] }),
    }));
    apps.push({
      id: "app-terminal",
      group: sp.apps,
      label: s.apps.terminal,
      hint: sp.app,
      keywords: "terminal shell console cli bash",
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

    const writing: Command[] = posts.map((p) => ({
      id: `post-${p.slug}`,
      group: sp.posts,
      label: p.title,
      hint: p.reading_time ? fill(sp.minRead, { n: p.reading_time }) : undefined,
      keywords: `${p.excerpt} ${p.tags.map((x) => x.name).join(" ")} blog post article`,
      perform: ext(p.url),
    }));

    const projects: Command[] = repos.slice(0, 10).map((r) => ({
      id: `repo-${r.name}`,
      group: sp.repos,
      label: r.name,
      hint: [r.language, r.stars ? `★ ${r.stars}` : ""].filter(Boolean).join(" · ") || undefined,
      keywords: `${r.description} ${r.topics.join(" ")} repo github`,
      perform: ext(r.url),
    }));

    const links: Command[] = [
      { id: "ln-github", label: "GitHub", hint: "@cempack", href: SOCIALS.github, k: "code repos" },
      { id: "ln-blog", label: sp.blog, hint: host(BLOG_URL), href: BLOG_URL, k: "ghost writing articles" },
      { id: "ln-mastodon", label: "Mastodon", hint: "@cempack", href: SOCIALS.mastodon, k: "fediverse" },
      { id: "ln-youtube", label: "YouTube", hint: "@cempack", href: SOCIALS.youtube, k: "video" },
      { id: "ln-x", label: "X", hint: "@cempack_", href: SOCIALS.x, k: "twitter" },
      { id: "ln-spotify", label: "Spotify", hint: "elliot", href: SOCIALS.spotifyUser, k: "music musique playlists" },
    ].map(({ id, label, hint, href, k }) => ({ id, group: sp.links, label, hint, keywords: k, perform: ext(href) }));
    links.push({
      id: "ln-email",
      group: sp.links,
      label: sp.email,
      hint: SOCIALS.email,
      keywords: "mail email contact",
      perform: () => {
        window.location.href = `mailto:${SOCIALS.email}`;
      },
    });

    return [...apps, ...actions, ...writing, ...projects, ...links];
  }, [t, other, path, router, pathname, muted, toggle, blip, notify, mode, setMode, setTerminal, posts, repos]);
}
