"use client";

import { useEffect } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { AnimatePresence, frame, m, useMotionValue } from "motion/react";
import { useI18n } from "@/i18n/client";
import { spring } from "@/lib/motion";
import { useHydrated, useIsMac } from "@/hooks/env";
import { useSpotifyStatus } from "@/hooks/useSpotifyStatus";
import { useHomeTime } from "@/hooks/useHomeTime";
import { usePalette } from "@/components/ui/palette";
import { APPS, appForPath, type AppDef } from "./apps";
import { AppGlyph } from "./icons";
import { deskOf, getHomeDesk, openWorkspace, useDesks, useWorkspaces } from "./workspaces";
import { useSiteData } from "./SiteData";
import { MenuItem, MenuProvider, useMenu, type Align, type PanelId } from "./menubar/Panel";
import dynamic from "next/dynamic";
import { ClockTrigger, MusicTrigger } from "./menubar/triggers";
import { useElliotsDay } from "./menubar/day";
import { ControlIcon, EmosMark, SearchIcon } from "./menubar/glyphs";
import { fill } from "./menubar/util";
import "./menubar.css";

const AboutPanel = dynamic(() => import("./menubar/About").then((m) => m.AboutPanel));
const MusicPanel = dynamic(() => import("./menubar/Music").then((m) => m.MusicPanel));
const ControlCenterPanel = dynamic(() => import("./menubar/ControlCenter").then((m) => m.ControlCenterPanel));
const NotificationPanel = dynamic(() => import("./menubar/Notifications").then((m) => m.NotificationPanel));

/**
 * emOS top bar, waybar-style. Left: the emOS mark (About, Restart, Lock)
 * and the workspaces: like Hyprland's, one exists only while an app is
 * open in it (see workspaces.ts), drawn with the app's glyph.
 * Centre: date and Toulouse time (Notification Center). Right: now playing,
 * Control Center and Spotlight. Every panel grows out of its trigger,
 * only one is open at a time, and Spotlight commands can open them too
 * (window event "em:menubar" with a PanelId detail). Under 768px the
 * workspaces give way to the app's name (the tab bar switches apps) and
 * panels become sheets from the top.
 */

const PANELS: Record<PanelId, { width: number; align: Align }> = {
  about: { width: 520, align: "start" },
  music: { width: 380, align: "center" },
  control: { width: 344, align: "end" },
  notifications: { width: 372, align: "center" },
};

export function MenuBar() {
  return (
    <MenuProvider>
      <Bar />
    </MenuProvider>
  );
}

function AppName({ id, label }: { id: string; label: string }) {
  return (
    <span className="os-menubar-app">
      <AnimatePresence mode="popLayout" initial={false}>
        <m.span
          key={id}
          className="os-menubar-app-label"
          initial={{ y: 14, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          exit={{ y: -14, opacity: 0 }}
          transition={spring.snappy}
        >
          {label}
        </m.span>
      </AnimatePresence>
    </span>
  );
}

/** The open workspaces, in dock order: each is its app's glyph, the
    current one lit with a bar beneath. One appears when you open an app
    and leaves when you close its window. */
function Workspaces({ current }: { current: AppDef }) {
  const { t, path } = useI18n();
  const all = useWorkspaces(current.id);
  // with more than one desk (the overview's workspaces), only this desk's windows
  const desks = useDesks();
  const desk = current.id === "home" ? getHomeDesk() : deskOf(desks, current.id);
  const ids = desks.length > 1 ? all.filter((id) => id === "home" || id === current.id || deskOf(desks, id) === desk) : all;
  // the server knows only the current app; the rest come back from this
  // tab's storage on hydration. Remounting the group then shows them as
  // they were (no "just opened" entrance on every reload); only apps
  // opened after that animate in
  const hydrated = useHydrated();
  // opening an app opens its workspace for the rest of the visit
  useEffect(() => openWorkspace(current.id), [current.id]);
  return (
    <nav className="os-menubar-ws" aria-label={t.shell.menu.workspaces}>
      <AnimatePresence key={hydrated ? "client" : "server"} initial={false}>
        {ids.map((id) => {
          const a = APPS.find((x) => x.id === id)!;
          const on = id === current.id;
          const name = t.shell.apps[a.label];
          return (
            <m.span
              key={id}
              className="os-menubar-ws-slot"
              layout="position"
              layoutDependency={ids.join()}
              initial={{ opacity: 0, scale: 0.6 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.6 }}
              transition={spring.snappy}
            >
              <Link prefetch={false}
                href={path(a.path)}
                transitionTypes={["app-open"]}
                className="os-menubar-ws-btn"
                aria-current={on ? "page" : undefined}
                aria-label={name}
                aria-keyshortcuts={a.key}
                title={`${name} · ${a.key}`}
              >
                <AppGlyph app={a.id} size={14} />
              </Link>
            </m.span>
          );
        })}
      </AnimatePresence>
    </nav>
  );
}

function Bar() {
  const { t } = useI18n();
  const s = t.shell;
  const app = appForPath(usePathname());
  const menu = useMenu();
  const { show } = menu;
  const palette = usePalette();
  const isMac = useIsMac();
  const { time } = useHomeTime();
  const music = useSpotifyStatus(useSiteData().spotify);

  // the bar gains material as content scrolls beneath it: one passive
  // listener feeding a motion value, read in the frame loop's read phase
  const thick = useMotionValue(0);
  useEffect(() => {
    const read = () => thick.set(Math.min(1, Math.max(0, window.scrollY / 140)));
    const onScroll = () => frame.read(read);
    read();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, [thick]);

  useEffect(() => {
    const onOpen = (e: Event) => {
      const id = (e as CustomEvent<PanelId>).detail;
      const cfg = PANELS[id];
      // Spotlight runs its commands once its dialog has closed and handed
      // focus back, so the panel can take focus straight away
      if (cfg) show(id, cfg.width, cfg.align);
    };
    window.addEventListener("em:menubar", onOpen);
    return () => window.removeEventListener("em:menubar", onOpen);
  }, [show]);

  const elliot = useElliotsDay(music.playing);

  const musicLabel = music.track
    ? `${music.playing ? s.player.nowPlaying : s.player.lastPlayed}${s.colon}${music.track.title}, ${music.track.artist}`
    : s.player.nothing;

  return (
    // the bar's controls carry their own hover pills: the glass cursor
    // steps back to a dot here instead of blurring the labels
    <header className="os-menubar" data-open={menu.open ?? undefined} data-win={app.id !== "home" || undefined}>
      <div className="os-menubar-bg" aria-hidden />
      <m.div className="os-menubar-tint" style={{ opacity: thick }} aria-hidden />
      <m.div className="os-menubar-edge" style={{ opacity: thick }} aria-hidden />

      <div className="os-menubar-side os-menubar-left">
        <MenuItem
          id="about"
          label={s.menu.mark}
          panelLabel={s.menu.about}
          title={s.menu.about}
          className="os-menubar-mark"
          {...PANELS.about}
          trigger={<EmosMark size={18} />}
        >
          <AboutPanel />
        </MenuItem>
        <Workspaces current={app} />
        <AppName id={app.id} label={s.apps[app.label]} />
      </div>

      <div className="os-menubar-side os-menubar-center">
        <MenuItem
          id="notifications"
          label={`${fill(s.menu.clock, { time: time ?? "" })}${elliot ? `. ${elliot.sentence}` : ""}`}
          panelLabel={s.menu.notifications}
          title={elliot?.sentence}
          className="os-menubar-clock"
          {...PANELS.notifications}
          trigger={<ClockTrigger time={time} day={elliot?.day} />}
        >
          <NotificationPanel music={music} />
        </MenuItem>
      </div>

      <div className="os-menubar-side os-menubar-right">
        <MenuItem
          id="music"
          label={musicLabel}
          panelLabel={s.menu.music}
          title={music.track ? `${music.track.title} · ${music.track.artist}` : undefined}
          className="os-menubar-music-btn"
          itemClassName="os-menubar-music-item"
          {...PANELS.music}
          trigger={<MusicTrigger music={music} />}
        >
          <MusicPanel music={music} />
        </MenuItem>
        <MenuItem
          id="control"
          label={s.menu.controlCenter}
          panelLabel={s.menu.controlCenter}
          title={s.menu.controlCenter}
          className="os-menubar-icon"
          {...PANELS.control}
          trigger={<ControlIcon />}
        >
          <ControlCenterPanel />
        </MenuItem>
        <div className="os-menubar-item">
          <button
            type="button"
            className="os-menubar-btn os-menubar-search"
            aria-label={s.menu.spotlight}
            aria-keyshortcuts="Meta+K Control+K"
            title={`${s.menu.spotlight} (${isMac ? "⌘K" : "Ctrl K"})`}
            onClick={() => {
              menu.close();
              palette.open();
            }}
          >
            <SearchIcon />
            <kbd className="os-menubar-kbd os-menubar-hide-sm" suppressHydrationWarning>
              {isMac ? "⌘K" : "Ctrl K"}
            </kbd>
          </button>
        </div>
      </div>
    </header>
  );
}
