"use client";

import "./work.css";
import { AnimatePresence, LayoutGroup, m } from "motion/react";
import type { SiteData } from "@/lib/data";
import { AppWindow } from "@/components/os/AppWindow";
import { Sheet } from "@/components/ui/Sheet";
import { useI18n } from "@/i18n/client";
import { spring } from "@/lib/motion";
import { Collection } from "./Collection";
import { Featured } from "./Featured";
import { EmptyState, StatusBar } from "./Parts";
import { QuickLook, QuickLookSheetBody } from "./QuickLook";
import { Sidebar } from "./Sidebar";
import { Toolbar } from "./Toolbar";
import { WorkProvider, useWork, visibleSearch } from "./store";
import { fmt, pathFor } from "./model";

/**
 * Projects: a Finder for Elliot's GitHub repos. Source list of smart
 * folders, languages and tags; live search (⌘F or /); an icon grid and a
 * list that morph into each other; a featured hero; a status bar; and
 * Quick Look, which zooms out of an item and can be flung back into it.
 *
 * State lives in WorkProvider above the window; the window's slots are
 * small components that read it, so the window frame stays still.
 */
export function ProjectsApp({ data }: { data: SiteData }) {
  const hasRepos = data.repos.length > 0;
  return (
    <WorkProvider data={data}>
      <AppWindow
        app="work"
        className="app-work-win"
        subtitle={<WorkPath />}
        toolbar={hasRepos ? <WorkToolbar variant="bar" /> : undefined}
        sidebar={<WorkSidebar />}
      >
        <WorkContent />
      </AppWindow>
    </WorkProvider>
  );
}

function WorkPath() {
  const { filter, query } = useWork();
  return (
    <span className="app-work-path" aria-hidden>
      {pathFor(filter, query)}
    </span>
  );
}

function WorkSidebar() {
  const { repos, filter, setFilter, source } = useWork();
  return <Sidebar repos={repos} filter={filter} onFilter={setFilter} source={source} />;
}

function WorkToolbar({ variant }: { variant: "bar" | "inline" }) {
  const w = useWork();
  return (
    <Toolbar
      variant={variant}
      query={w.query}
      onQuery={w.setQuery}
      view={w.effView}
      onView={w.setView}
      sort={w.sort}
      onSort={w.setSort}
      onSubmit={() => {
        const first = w.selected ?? w.visible[0]?.name;
        if (!first) return;
        w.setSelected(first);
        w.focusItem(first);
      }}
      disabled={w.repos.length === 0}
    />
  );
}

function WorkContent() {
  const { t } = useI18n();
  const h = t.work.heading;
  const w = useWork();
  const { filter, terms, query, visible } = w;

  const short = (s: string, n: number) => (s.length > n ? s.slice(0, n - 1) + "…" : s);
  const folder =
    filter.kind === "starred"
      ? t.work.side.starred
      : filter.kind === "recent"
        ? t.work.side.recent
        : filter.kind === "lang"
          ? filter.value
          : filter.kind === "tag"
            ? `#${filter.value}`
            : "";
  const heading = terms.length
    ? fmt(h.results, { q: short(query.trim(), 28) })
    : filter.kind === "all"
      ? h.all
      : filter.kind === "starred"
        ? h.starred
        : filter.kind === "recent"
          ? h.recent
          : filter.kind === "lang"
            ? fmt(h.lang, { lang: filter.value })
            : fmt(h.tag, { tag: filter.value });

  return (
    <div className="app-work">
      {w.repos.length > 0 && <WorkToolbar variant="inline" />}

      {w.repos.length === 0 ? (
        <EmptyState kind="offline" />
      ) : (
        <LayoutGroup id="app-work">
          <AnimatePresence initial={false} mode="popLayout">
            {w.showHero && w.featured && (
              <m.div
                key="hero"
                className="app-work-hero-wrap"
                initial={{ opacity: 0, y: -10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -10 }}
                transition={spring.default}
              >
                <Featured
                  repo={w.featured}
                  hydrated={w.hydrated}
                  onQuickLook={() => w.featured && w.openQL(w.featured.name, "hero")}
                />
              </m.div>
            )}
          </AnimatePresence>

          {visible.length > 0 && (
            <m.div layout="position" transition={{ layout: spring.default }} className="app-work-head">
              <h2 className="app-work-head-title">{heading}</h2>
              <span className="app-work-head-count tabular" aria-hidden>
                {visible.length}
              </span>
            </m.div>
          )}

          {visible.length > 0 ? (
            <Collection
              repos={visible}
              view={w.view}
              effView={w.effView}
              phone={w.phone}
              selected={w.selected}
              onSelect={w.setSelected}
              onOpen={(name) => w.openQL(name)}
              terms={terms}
              stagger={w.stagger}
              hydrated={w.hydrated}
              sort={w.sort}
              onSort={w.setSort}
            />
          ) : terms.length > 0 ? (
            <EmptyState
              kind="search"
              query={query}
              folder={folder}
              wider={w.widerHits}
              onClear={() => {
                w.setQuery("");
                visibleSearch()?.focus();
              }}
              onWiden={() => w.setFilter({ kind: "all" })}
            />
          ) : (
            <EmptyState kind="folder" onShowAll={() => w.setFilter({ kind: "all" })} />
          )}
        </LayoutGroup>
      )}

      <div className="app-work-pip-room" aria-hidden />
      <StatusBar shown={visible.length} total={w.repos.length} stars={w.stars} source={w.source} />

      {w.ql?.mode === "panel" && w.qlRepo && (
        <QuickLook
          key={w.ql.id}
          repo={w.qlRepo}
          terms={terms}
          hydrated={w.hydrated}
          getOrigin={w.getOrigin}
          onStep={w.stepQL}
          onTag={w.applyTag}
          onClosed={w.onPanelClosed}
        />
      )}
      <Sheet
        open={w.ql?.mode === "sheet" && !!w.qlRepo}
        onClose={w.onSheetClosed}
        label={fmt(t.work.ql.label, { name: w.qlRepo?.name ?? "" })}
        className="app-work-sheet"
      >
        {w.qlRepo && (
          <QuickLookSheetBody
            repo={w.qlRepo}
            terms={terms}
            hydrated={w.hydrated}
            onTag={(tag, dismiss) => {
              w.afterSheet(() => w.applyTag(tag));
              dismiss();
            }}
          />
        )}
      </Sheet>
    </div>
  );
}
