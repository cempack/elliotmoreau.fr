"use client";

import { useMemo } from "react";
import { useRouter } from "next/navigation";
import { useLang } from "@/lib/i18n";
import { useSound } from "@/lib/sound";
import { useToast } from "@/components/Toasts";
import { SOCIALS } from "@/lib/places";
import { lenisRef } from "@/lib/lenisRef";
import type { Command } from "@/components/ui/CommandPalette";
import type { HomeData } from "@/lib/data";
import { useCopy } from "./copy";

const toTop = () => {
  if (lenisRef.current) lenisRef.current.scrollTo(0);
  else window.scrollTo({ top: 0 });
};

/** The ⌘K command set every direction shares. */
export function useLabCommands(data: HomeData, extra: Command[] = []): Command[] {
  const router = useRouter();
  const c = useCopy();
  const { lang, setLang } = useLang();
  const { toggle, blip } = useSound();
  const { notify } = useToast();

  return useMemo(() => {
    const go = (href: string) => () => router.push(href);
    const ext = (href: string) => () => window.open(href, "_blank", "noopener,noreferrer");
    const cmds: Command[] = [
      { id: "go-glass", group: c.palette.go, label: "Lab · A — Liquid Glass", hint: "/lab/glass", perform: go("/lab/glass") },
      { id: "go-journal", group: c.palette.go, label: "Lab · B — Kinetic Journal", hint: "/lab/journal", perform: go("/lab/journal") },
      { id: "go-rice", group: c.palette.go, label: "Lab · C — Rice OS", hint: "/lab/rice", perform: go("/lab/rice") },
      { id: "go-lab", group: c.palette.go, label: "Lab index", hint: "/lab", perform: go("/lab") },
      ...extra,
      {
        id: "copy-email",
        group: c.palette.actions,
        label: c.palette.copyEmail,
        hint: SOCIALS.email,
        keywords: "mail contact",
        perform: () => {
          navigator.clipboard?.writeText(SOCIALS.email).catch(() => {});
          notify(c.copied);
          blip("success");
        },
      },
      {
        id: "lang",
        group: c.palette.actions,
        label: c.palette.lang,
        keywords: "language langue english français",
        perform: () => {
          setLang(lang === "en" ? "fr" : "en");
          blip("toggle");
        },
      },
      { id: "sound", group: c.palette.actions, label: c.palette.sound, keywords: "mute audio", perform: toggle },
      {
        id: "replay",
        group: c.palette.actions,
        label: c.palette.replay,
        keywords: "hero animation",
        perform: () => {
          toTop();
          window.dispatchEvent(new CustomEvent("em:replay"));
        },
      },
      {
        id: "top",
        group: c.palette.actions,
        label: c.palette.top,
        perform: toTop,
      },
      ...data.posts.map((p) => ({
        id: `post-${p.slug}`,
        group: c.palette.posts,
        label: p.title,
        hint: `${p.reading_time} ${c.minRead}`,
        perform: ext(p.url),
      })),
      ...data.repos.slice(0, 8).map((r) => ({
        id: `repo-${r.name}`,
        group: c.palette.repos,
        label: r.name,
        hint: r.language,
        keywords: r.description,
        perform: ext(r.url),
      })),
      { id: "gh", group: c.palette.go, label: "GitHub", hint: "@cempack", perform: ext(SOCIALS.github) },
      { id: "yt", group: c.palette.go, label: "YouTube", hint: "@cempack", perform: ext(SOCIALS.youtube) },
      { id: "masto", group: c.palette.go, label: "Mastodon", hint: "@cempack", perform: ext(SOCIALS.mastodon) },
    ];
    return cmds;
  }, [router, c, lang, setLang, toggle, blip, notify, data.posts, data.repos, extra]);
}
