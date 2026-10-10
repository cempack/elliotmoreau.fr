"use client";

import "./rice.css";
import { useCallback, useEffect, useMemo, useState } from "react";
import type { HomeData } from "@/lib/data";
import { IntroGate } from "@/components/ui/IntroGate";
import { CommandPalette, type Command } from "@/components/ui/CommandPalette";
import { Cursor } from "@/components/ui/Cursor";
import { LangToggle, SoundToggle } from "@/components/ui/Toggles";
import {
  GLYPH_BOLT,
  GLYPH_CHAT,
  GLYPH_CODE,
  GLYPH_HOME,
  GLYPH_MAIL,
  GLYPH_NOTE,
  GLYPH_PIN,
  GLYPH_PLAY,
  GLYPH_STAR,
  GLYPH_TERM,
} from "@/components/glyphs";
import { LabSwitcher } from "@/lab/LabSwitcher";
import { useLabCommands } from "@/lab/commands";
import { useSpotifyStatus } from "@/hooks/useSpotifyStatus";
import { lenisRef } from "@/lib/lenisRef";
import { useSound } from "@/lib/sound";
import { HOME, PLACES } from "@/lib/places";
import { Boot, BOOT_MS } from "./Boot";
import { Wallpaper } from "./Wallpaper";
import { WS_IDS, Waybar } from "./Waybar";
import { DeskContext, Tiles } from "./tiling";
import {
  Conky,
  GitLog,
  GlobeWin,
  HeroWin,
  Mail,
  Neofetch,
  Newsletter,
  Notes,
  NowPlayingWin,
  PlaceInfo,
  PlacesWin,
  Projects,
  Socials,
  Whoami,
} from "./apps";
import { useRiceCopy } from "./strings";

const toTop = () => {
  if (lenisRef.current) lenisRef.current.scrollTo(0);
  else window.scrollTo({ top: 0 });
};

/** Hyprland-ish keybind cheat sheet, under the first workspace. */
function Hints() {
  const { r } = useRiceCopy();
  return (
    <p className="rice-hints" aria-hidden>
      <span>
        <kbd>{r.hint.dragLabel}</kbd> {r.hint.drag} {r.hint.swap}
      </span>
      <span>
        <kbd>{r.hint.dbl}</kbd> {r.hint.max}
      </span>
      <span>
        <kbd>1–4</kbd> {r.hint.ws}
      </span>
      <span>
        <kbd>←↑↓→</kbd> {r.hint.focus}
      </span>
      <span>
        <kbd>⌘K</kbd> {r.hint.launch}
      </span>
    </p>
  );
}

export function RiceHome({ data }: { data: HomeData }) {
  const c = useRiceCopy();
  const { r, nav, lang } = c;
  const sp = useSpotifyStatus(data.spotify);
  const { blip } = useSound();
  const [active, setActive] = useState(0);
  const [focused, setFocused] = useState("hero");
  const [resetEpoch, setResetEpoch] = useState(0);
  const [sel, setSel] = useState(HOME.id);
  const go = useCallback((i: number) => {
    const el = document.getElementById(`ws-${WS_IDS[i]}`);
    if (!el) return;
    if (lenisRef.current) {
      lenisRef.current.scrollTo(el, { duration: 1.05, easing: (t: number) => 1 - Math.pow(1 - t, 5) });
    } else {
      window.scrollTo({ top: el.getBoundingClientRect().top + window.scrollY });
    }
    el.querySelector<HTMLElement>(".rice-win")?.focus({ preventScroll: true });
    setActive(i);
  }, []);

  // which workspace is on screen drives the waybar
  useEffect(() => {
    const els = WS_IDS.map((id) => document.getElementById(`ws-${id}`)).filter((e): e is HTMLElement => !!e);
    const io = new IntersectionObserver(
      (entries) => {
        for (const e of entries) if (e.isIntersecting) setActive(els.indexOf(e.target as HTMLElement));
      },
      { rootMargin: "-42% 0px -52% 0px" }
    );
    els.forEach((el) => io.observe(el));
    return () => io.disconnect();
  }, []);

  // 1–4 switch workspaces, unless typing or a dialog is up
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.metaKey || e.ctrlKey || e.altKey || e.repeat) return;
      const t = e.target as HTMLElement | null;
      if (t?.closest?.("input,textarea,select,[contenteditable=true]")) return;
      if (document.querySelector("dialog[open]")) return;
      const n = Number(e.key);
      if (n >= 1 && n <= 4) {
        e.preventDefault();
        go(n - 1);
        blip("tick");
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [go, blip]);

  const extra = useMemo<Command[]>(
    () => [
      ...WS_IDS.map((id, i) => ({
        id: `ws-${id}`,
        group: c.palette.go,
        label: [c.nav.home, c.nav.work, c.nav.atlas, c.nav.contact][i],
        hint: `${c.r.workspace.toLowerCase()} ${i + 1}`,
        keywords: "workspace espace",
        perform: () => go(i),
      })),
      {
        id: "reset-layout",
        group: c.palette.actions,
        label: c.r.resetLayout,
        keywords: "tiling windows layout fenêtres",
        perform: () => setResetEpoch((e) => e + 1),
      },
      {
        id: "reboot",
        group: c.palette.actions,
        label: c.r.reboot,
        keywords: "boot intro restart",
        perform: () => {
          try {
            sessionStorage.removeItem("em-intro");
          } catch {}
          window.location.reload();
        },
      },
    ],
    [c, go]
  );
  const commands = useLabCommands(data, extra);
  const desk = useMemo(() => ({ focused, setFocused, resetEpoch }), [focused, resetEpoch]);
  const place = PLACES.find((p) => p.id === sel) ?? HOME;
  const totalStars = data.repos.reduce((s, x) => s + x.stars, 0);

  return (
    <div data-dir="rice" className="rice-root">
      <CommandPalette commands={commands} placeholder={c.palette.placeholder} empty={c.palette.empty}>
        <DeskContext.Provider value={desk}>
          <Wallpaper />
          <IntroGate maxMs={BOOT_MS + 400}>
            <Boot />
          </IntroGate>

          <Waybar active={active} onGo={go} sp={sp} activity={data.activity} repos={data.repos} />

          <main className="rice-desk">
            <section id="ws-home" className="rice-ws rice-ws--home" aria-labelledby="ws-home-h">
              <h2 id="ws-home-h" className="sr-only">
                {nav.home}
              </h2>
              <Tiles
                className="rice-tiles--home"
                windows={[
                  { id: "hero", slot: "hero", title: "hello.fx — nvim", icon: GLYPH_CODE, hero: true, bodyClass: "rice-body-hero", children: <HeroWin /> },
                  { id: "fetch", slot: "fetch", title: "fastfetch", icon: GLYPH_STAR, children: <Neofetch repos={data.repos} /> },
                  { id: "term", slot: "term", title: "~ — zsh", icon: GLYPH_TERM, children: <Whoami /> },
                  {
                    id: "play",
                    slot: "play",
                    title: `cava — ${c.listening.toLowerCase()}`,
                    icon: GLYPH_PLAY,
                    children: <NowPlayingWin track={sp.track} playing={sp.playing} />,
                  },
                ]}
              />
              <Hints />
            </section>

            <section id="ws-work" className="rice-ws rice-ws--work" aria-labelledby="ws-work-h">
              <Tiles
                className="rice-tiles--work"
                extras={
                  <Conky n="02" id="ws-work-h" title={c.work} sub={c.workSub}>
                    <p className="rice-conky-stats">
                      <span>
                        <b>{data.repos.length}</b> {r.reposCount}
                      </span>
                      <span>
                        <b>{data.posts.length}</b> {r.postsCount}
                      </span>
                      <span>
                        <b>{totalStars}</b> {r.totalStars}
                      </span>
                    </p>
                  </Conky>
                }
                windows={[
                  { id: "projects", slot: "projects", title: "~/projects — ls", icon: GLYPH_CODE, children: <Projects repos={data.repos} /> },
                  { id: "notes", slot: "notes", title: `notes — ${c.writing.toLowerCase()}`, icon: GLYPH_NOTE, children: <Notes posts={data.posts} /> },
                  { id: "git", slot: "git", title: `git — ${c.lastPush.toLowerCase()}`, icon: GLYPH_BOLT, children: <GitLog activity={data.activity} repos={data.repos} /> },
                ]}
              />
            </section>

            <section id="ws-atlas" className="rice-ws rice-ws--atlas" aria-labelledby="ws-atlas-h">
              <Tiles
                className="rice-tiles--atlas"
                extras={<Conky n="03" id="ws-atlas-h" title={c.atlas} sub={c.atlasSub} />}
                windows={[
                  { id: "globe", slot: "globe", title: "atlas — globe", icon: GLYPH_PIN, bodyClass: "rice-body-flush", children: <GlobeWin sel={sel} onSelect={setSel} /> },
                  { id: "places", slot: "places", title: `${r.places}.md`, icon: GLYPH_HOME, children: <PlacesWin sel={sel} onSelect={setSel} /> },
                  { id: "pin", slot: "pin", title: `pin — ${place.name[lang].toLowerCase()}`, icon: GLYPH_PIN, children: <PlaceInfo sel={sel} /> },
                ]}
              />
            </section>

            <section id="ws-contact" className="rice-ws rice-ws--contact" aria-labelledby="ws-contact-h">
              <Tiles
                className="rice-tiles--contact"
                extras={<Conky n="04" id="ws-contact-h" title={c.hello} sub={c.helloSub} />}
                windows={[
                  { id: "mail", slot: "mail", title: `aerc — ${c.nav.contact.toLowerCase()}`, icon: GLYPH_MAIL, children: <Mail /> },
                  { id: "news", slot: "news", title: "newsletter", icon: GLYPH_NOTE, children: <Newsletter latest={data.posts[0]} /> },
                  { id: "links", slot: "links", title: `~/.links — ${r.links.toLowerCase()}`, icon: GLYPH_CHAT, children: <Socials /> },
                ]}
              />
              <footer className="rice-foot">
                <p className="rice-foot-made">
                  <span className="rice-g">elliotmoreau.fr</span> · {c.madeIn}
                </p>
                <div className="rice-foot-set">
                  <LangToggle id="rice-lang-foot" className="rice-seg" />
                  <SoundToggle className="rice-iconbtn" labels={{ on: c.soundOn, off: c.soundOff }} />
                  <button type="button" className="rice-iconbtn rice-foot-top" onClick={toTop} aria-label={r.top} title={r.top}>
                    ↑
                  </button>
                </div>
              </footer>
            </section>
          </main>

          <LabSwitcher data={data} />
          <Cursor variant="block" />
        </DeskContext.Provider>
      </CommandPalette>
    </div>
  );
}
