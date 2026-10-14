"use client";

import "./work.css";
import { useEffect, useMemo, useRef, useState } from "react";
import { AppWindow } from "@/components/os/AppWindow";
import { useLive, useSiteData } from "@/components/os/SiteData";
import { Sheet } from "@/components/ui/Sheet";
import { useI18n } from "@/i18n/client";
import { useMedia } from "@/hooks/env";
import { useSound } from "@/lib/sound";
import { SOCIALS } from "@/lib/socials";
import { PixelGlyph } from "@/components/glyphs";
import { ART_OFFLINE, G_ARROW, PixelArt } from "./glyphs";
import { actionOf, kindOf, shelves as toShelves, siteOf, titleOf } from "./kind";
import { useContextMenu, useCopy, type MenuItem } from "@/components/os/context/ContextMenu";
import { pickFeatured } from "./model";
import { ProjectCard } from "./ProjectCard";
import { ProjectList } from "./ProjectList";
import { Machine } from "./machine/Machine";

/** The card beside the list from here up; a sheet over the list below.
    Must match work.css. */
const BESIDE = "(min-width: 768px)";
/** The stage between them from here up. Must match work.css. */
const STAGE = "(min-width: 1200px)";

/**
 * Projects, for anyone. What Elliot has made, on shelves a visitor
 * understands (apps and websites, games, add-ons for his desktop, tools),
 * each with its name, what it does in a sentence and one clear button.
 *
 * Like Atlas: on wide screens the list sits on the left, the machine the
 * project runs on fills the middle and its card stands on the right;
 * tablets keep the list and the card (the machine on top); phones show the
 * list and open a project in a sheet (the machine on top there too).
 * `?repo=name` (Spotlight, the Desktop's pushes) opens on that project.
 */
export function ProjectsApp() {
  const { repos } = useSiteData();
  const { featuredRepo } = useLive();
  const { t, path } = useI18n();
  const w = t.work;
  const { blip } = useSound();
  const copy = useCopy();
  const rootRef = useRef<HTMLDivElement>(null);
  const beside = useMedia(BESIDE, true);
  const wide = useMedia(STAGE, false);
  const shelves = useMemo(() => toShelves(repos), [repos]);
  const ordered = useMemo(() => shelves.flatMap((s) => s.repos), [shelves]);
  const [picked, setPicked] = useState<string | null>(null);
  const [sheet, setSheet] = useState<string | null>(null);
  const current = ordered.find((r) => r.name === picked) ?? pickFeatured(ordered, featuredRepo);
  const sheetRepo = sheet ? ordered.find((r) => r.name === sheet) : undefined;

  // ?repo=name: open on it (a sheet on phones), then tidy the address
  useEffect(() => {
    const url = new URL(window.location.href);
    const want = url.searchParams.get("repo");
    if (!want) return;
    const id = window.setTimeout(() => {
      const hit = ordered.find((r) => r.name.toLowerCase() === want.toLowerCase());
      if (hit) {
        setPicked(hit.name);
        if (!window.matchMedia(BESIDE).matches) setSheet(hit.name);
      }
      url.searchParams.delete("repo");
      window.history.replaceState(window.history.state, "", url);
    }, 0);
    return () => window.clearTimeout(id);
    // once, on arrival
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const pick = (name: string) => {
    blip("select");
    setPicked(name);
    if (!window.matchMedia(BESIDE).matches) setSheet(name);
  };

  // right-click a project: show it, open what it is, its code, or a link to it
  useContextMenu(rootRef, ({ target }) => {
    const name = target.closest<HTMLElement>("button[data-repo]")?.dataset.repo;
    const repo = name ? ordered.find((r) => r.name === name) : undefined;
    if (!repo) return null;
    const c = t.shell.context;
    const action = actionOf(repo, kindOf(repo));
    const tab = (href: string) => () => window.open(href, "_blank", "noopener,noreferrer");
    const items: MenuItem[] = [
      { label: c.showProject, onSelect: () => pick(repo.name) },
      { label: w.actions[action], onSelect: tab(action === "code" ? repo.url : siteOf(repo)) },
    ];
    if (action !== "code") items.push({ label: w.actions.code, onSelect: tab(repo.url) });
    items.push({
      label: c.copyLink,
      onSelect: () => copy(`${window.location.origin}${path("/work")}?repo=${encodeURIComponent(repo.name)}`, c.linkCopied),
    });
    return { items };
  });

  /** one project's card; `machine` (only where it shows: each machine paints) puts its machine on top */
  const card = (name: string | undefined, titleId: string, machine: boolean) => {
    const repo = ordered.find((r) => r.name === name);
    if (!repo) return null;
    const i = ordered.indexOf(repo);
    const step = (to: string) => {
      blip("select");
      setPicked(to);
      if (sheet) setSheet(to);
    };
    return (
      <ProjectCard
        repo={repo}
        kind={kindOf(repo)}
        machine={machine}
        prev={ordered[(i - 1 + ordered.length) % ordered.length]}
        next={ordered[(i + 1) % ordered.length]}
        index={i}
        total={ordered.length}
        onStep={step}
        titleId={titleId}
      />
    );
  };

  if (!current) {
    return (
      <AppWindow app="work">
        <div className="app-work app-work--empty">
          <div className="app-work-offline">
            <PixelArt rows={ART_OFFLINE} palette={{ a: "var(--color-ink-500)", b: "var(--color-ink-700)", c: "var(--color-label-3)", d: "var(--color-label-3)" }} cell={6} />
            <h2 className="app-work-offline-title">{w.offlineTitle}</h2>
            <p className="app-work-offline-body">{w.offlineBody}</p>
            <a className="app-work-btn" href={SOCIALS.github} target="_blank" rel="noopener noreferrer">
              {w.openProfile}
              <PixelGlyph cells={G_ARROW} size={10} />
            </a>
          </div>
        </div>
      </AppWindow>
    );
  }

  const kind = kindOf(current);

  return (
    <AppWindow app="work">
      <div ref={rootRef} className="app-work">
        <section className="app-work-panel app-work-panel--list" aria-labelledby="app-work-title">
          <div className="app-work-panel-scroll" data-lenis-prevent>
            <header className="app-work-intro">
              <h2 id="app-work-title" className="app-work-title">
                {w.title}
              </h2>
              <p className="app-work-lede">{w.lede}</p>
            </header>
            <ProjectList shelves={shelves} selected={current.name} onPick={pick} select={beside} thumbId="app-work-thumb" />
            <a className="app-work-all" href={SOCIALS.github} target="_blank" rel="noopener noreferrer" aria-label={w.allLabel}>
              {w.all}
              <PixelGlyph cells={G_ARROW} size={9} />
            </a>
          </div>
        </section>

        {/* wide screens: the project on the machine it runs on, between the list and the card */}
        <div className="app-work-stage">
          {wide ? <Machine repo={current} kind={kind} /> : null}
        </div>

        <aside className="app-work-panel app-work-panel--card" aria-label={titleOf(current)}>
          <div className="app-work-panel-scroll" data-lenis-prevent>
            {card(current.name, "app-work-card-title", beside && !wide)}
          </div>
        </aside>

        <Sheet open={!!sheetRepo} onClose={() => setSheet(null)} label={sheetRepo ? titleOf(sheetRepo) : ""} className="app-work-sheet">
          {card(sheet ?? undefined, "app-work-sheet-title", !beside)}
        </Sheet>
      </div>
    </AppWindow>
  );
}
