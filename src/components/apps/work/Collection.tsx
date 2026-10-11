"use client";

import { useRef } from "react";
import { AnimatePresence, m } from "motion/react";
import type { RepoInfo } from "@/lib/github";
import { useI18n } from "@/i18n/client";
import { spring } from "@/lib/motion";
import { timeAgo } from "@/lib/format";
import { lenisRef } from "@/lib/lenisRef";
import { RepoArt } from "./RepoArt";
import { GLYPH_STAR, PixelGlyph } from "@/components/glyphs";
import { G_CHEVRON } from "./glyphs";
import { Marked } from "./Parts";
import { type SortKey, type ViewMode, compact, fmt, itemId, langColor, normalize } from "./model";

type View = "icons" | "list";

/**
 * Scroll an item into the band between the sticky chrome and the Dock. The
 * band comes from the item's own scroll-margin (work.css), so it follows
 * the window's sticky offset and the Dock height without measuring them.
 */
export function revealItem(el: HTMLElement | null, immediate = false) {
  if (!el) return;
  const r = el.getBoundingClientRect();
  const cs = getComputedStyle(el);
  const topSafe = parseFloat(cs.scrollMarginTop) || 0;
  const bottomSafe = window.innerHeight - (parseFloat(cs.scrollMarginBottom) || 0);
  let delta = 0;
  if (r.top < topSafe) delta = r.top - topSafe;
  else if (r.bottom > bottomSafe) delta = Math.min(r.bottom - bottomSafe, r.top - topSafe);
  if (Math.abs(delta) < 1) return;
  const lenis = lenisRef.current;
  if (lenis) lenis.scrollTo(window.scrollY + delta, immediate ? { immediate: true, force: true } : { duration: 0.45 });
  else window.scrollBy({ top: delta, behavior: "auto" });
}

/**
 * The repos as a listbox, in one of two shapes that share the same DOM:
 * an icon grid or list rows. Switching morphs every item between the two
 * (motion layout on each part). Keyboard: arrows move the selection
 * (↑/↓ jump rows by geometry, so they work in both shapes), Home/End,
 * typing a name jumps to it, Space or Enter opens Quick Look.
 * Mouse: press selects, double-click opens. Touch: a tap opens.
 */
export function Collection({
  repos,
  view,
  effView,
  phone,
  selected,
  onSelect,
  onOpen,
  terms,
  stagger,
  hydrated,
  sort,
  onSort,
}: {
  repos: RepoInfo[];
  view: ViewMode;
  effView: View | null;
  phone: boolean;
  selected: string | null;
  onSelect: (name: string | null) => void;
  onOpen: (name: string) => void;
  terms: string[];
  stagger: boolean;
  hydrated: boolean;
  sort: SortKey;
  onSort: (s: SortKey) => void;
}) {
  const { t } = useI18n();
  const w = t.work;
  const pointer = useRef<string>("mouse");
  const typeahead = useRef({ buf: "", at: 0 });
  const names = repos.map((r) => r.name);

  const go = (name: string | undefined) => {
    if (!name) return;
    onSelect(name);
    const el = document.getElementById(itemId(name));
    el?.focus({ preventScroll: true });
    revealItem(el);
  };

  const vertical = (from: number, dir: 1 | -1) => {
    const els = names.map((n) => document.getElementById(itemId(n)));
    const cur = els[from];
    if (!cur) return names[0];
    const top = cur.offsetTop;
    const cx = cur.offsetLeft + cur.offsetWidth / 2;
    const cands = els.filter(
      (e): e is HTMLElement => !!e && (dir > 0 ? e.offsetTop > top + 4 : e.offsetTop < top - 4)
    );
    if (!cands.length) return undefined;
    const rowTop = dir > 0 ? Math.min(...cands.map((e) => e.offsetTop)) : Math.max(...cands.map((e) => e.offsetTop));
    const row = cands.filter((e) => Math.abs(e.offsetTop - rowTop) < 4);
    let best = row[0];
    for (const e of row) {
      if (Math.abs(e.offsetLeft + e.offsetWidth / 2 - cx) < Math.abs(best.offsetLeft + best.offsetWidth / 2 - cx)) best = e;
    }
    return best.dataset.workItem;
  };

  const onKeyDown = (e: React.KeyboardEvent<HTMLUListElement>) => {
    if (e.metaKey || e.ctrlKey || e.altKey || !names.length) return;
    const i = selected ? names.indexOf(selected) : -1;
    const last = names.length - 1;
    let next: string | undefined;
    switch (e.key) {
      case "ArrowRight":
        next = names[i < 0 ? 0 : Math.min(i + 1, last)];
        break;
      case "ArrowLeft":
        next = names[i < 0 ? 0 : Math.max(i - 1, 0)];
        break;
      case "ArrowDown":
        next = i < 0 ? names[0] : vertical(i, 1);
        break;
      case "ArrowUp":
        next = i < 0 ? names[0] : vertical(i, -1);
        break;
      case "Home":
        next = names[0];
        break;
      case "End":
        next = names[last];
        break;
      case " ":
      case "Enter":
        e.preventDefault();
        if (selected && i >= 0) onOpen(selected);
        else go(names[0]);
        return;
      default: {
        // type-select, like Finder: letters jump to the first matching name
        if (e.key.length !== 1 || !/\p{L}/u.test(e.key)) return;
        const now = e.timeStamp;
        const ta = typeahead.current;
        ta.buf = now - ta.at > 800 ? e.key.toLowerCase() : ta.buf + e.key.toLowerCase();
        ta.at = now;
        const hit = names.find((n) => normalize(n).startsWith(ta.buf));
        if (hit) {
          e.preventDefault();
          go(hit);
        }
        return;
      }
    }
    e.preventDefault();
    if (next && next !== selected) go(next);
    else if (next) revealItem(document.getElementById(itemId(next)));
  };

  const tabbable = selected && names.includes(selected) ? selected : names[0];

  return (
    <div className="app-work-coll" data-view={view} data-stagger={stagger || undefined}>
      {effView === "list" && <ListHeader sort={sort} onSort={onSort} />}
      <ul
        role="listbox"
        aria-label={w.item.listbox}
        aria-orientation={effView === "list" ? "vertical" : undefined}
        className="app-work-items"
        onKeyDown={onKeyDown}
        onPointerDown={(e) => {
          // pressing the empty desktop between items clears the selection
          if (e.button === 0 && !(e.target as Element).closest("[role=option]")) onSelect(null);
        }}
      >
        <AnimatePresence initial={false} mode="popLayout">
          {repos.map((repo, i) => (
            <Item
              key={repo.name}
              repo={repo}
              index={i}
              view={effView}
              phone={phone}
              selected={repo.name === selected}
              tabbable={repo.name === tabbable}
              terms={terms}
              stagger={stagger}
              hydrated={hydrated}
              onPointerDown={(e) => {
                pointer.current = e.pointerType;
                if (e.button === 0 && e.pointerType !== "touch") onSelect(repo.name);
              }}
              onClick={() => {
                if (pointer.current === "touch") {
                  onSelect(repo.name);
                  onOpen(repo.name);
                }
              }}
              onDoubleClick={() => {
                if (pointer.current !== "touch") onOpen(repo.name);
              }}
            />
          ))}
        </AnimatePresence>
      </ul>
    </div>
  );
}

function ListHeader({ sort, onSort }: { sort: SortKey; onSort: (s: SortKey) => void }) {
  const { t } = useI18n();
  const c = t.work.columns;
  const col = (key: SortKey, label: string, cls: string) => (
    <button
      type="button"
      className={`app-work-col ${cls}`}
      aria-pressed={sort === key}
      aria-label={fmt(c.sortByColumn, { column: label })}
      data-active={sort === key || undefined}
      onClick={() => onSort(key)}
    >
      {label}
      {sort === key && <PixelGlyph cells={G_CHEVRON} size={7} className="app-work-col-chev" />}
    </button>
  );
  return (
    <div className="app-work-cols" data-work-sticky>
      <span className="app-work-col app-work-col--plate" aria-hidden />
      {col("name", c.name, "app-work-col--name")}
      <span className="app-work-col app-work-col--lang">{c.language}</span>
      {col("stars", c.stars, "app-work-col--stars")}
      {col("recent", c.updated, "app-work-col--date")}
    </div>
  );
}

function Item({
  repo,
  index,
  view,
  phone,
  selected,
  tabbable,
  terms,
  stagger,
  hydrated,
  onPointerDown,
  onClick,
  onDoubleClick,
}: {
  repo: RepoInfo;
  index: number;
  view: View | null;
  phone: boolean;
  selected: boolean;
  tabbable: boolean;
  terms: string[];
  stagger: boolean;
  hydrated: boolean;
  onPointerDown: (e: React.PointerEvent) => void;
  onClick: () => void;
  onDoubleClick: () => void;
}) {
  const { t, lang } = useI18n();
  const id = itemId(repo.name);
  // the grid ↔ list morph ripples through the items; filtering doesn't
  const lt = { ...spring.default, delay: stagger ? Math.min(index * 0.014, 0.2) : 0 };
  const radius = view ? (view === "icons" ? (phone ? 22 : 30) : phone ? 12 : 9) : undefined;
  // the plate glows faintly in the repo's language colour
  const plateStyle = { "--lang": langColor(repo.language), borderRadius: radius } as React.CSSProperties;

  return (
    <m.li
      id={id}
      role="option"
      aria-selected={selected}
      aria-label={repo.name}
      aria-describedby={`${id}-d`}
      tabIndex={tabbable ? 0 : -1}
      data-work-item={repo.name}
      data-selected={selected || undefined}
      className="app-work-item"
      style={{ "--i": Math.min(index, 14) } as React.CSSProperties}
      initial={{ opacity: 0, scale: 0.94 }}
      animate={{ opacity: 1, scale: 1 }}
      exit={{ opacity: 0, scale: 0.94 }}
      transition={spring.snappy}
      onPointerDown={onPointerDown}
      onClick={onClick}
      onDoubleClick={onDoubleClick}
    >
      {selected && view !== "icons" && <span className="app-work-hl" aria-hidden />}
      <m.span
        layout
        transition={{ layout: lt }}
        className="app-work-plate"
        style={plateStyle}
        data-ql-origin
      >
        <RepoArt name={repo.name} language={repo.language} className="app-work-planet" />
      </m.span>
      <m.span layout="position" transition={{ layout: lt }} className="app-work-name">
        <span className="app-work-name-text">
          <Marked text={repo.name} terms={terms} />
        </span>
      </m.span>
      <m.span
        layout="position"
        transition={{ layout: lt }}
        className="app-work-desc"
        id={`${id}-d`}
        lang={lang === "en" ? undefined : "en"}
      >
        <Marked text={repo.description} terms={terms} />
      </m.span>
      <m.span layout="position" transition={{ layout: lt }} className="app-work-lang">
        {repo.language && <span className="app-work-dot" style={{ background: langColor(repo.language) }} aria-hidden />}
        <span className="app-work-lang-name">{repo.language || t.work.item.noLanguage}</span>
      </m.span>
      <m.span layout="position" transition={{ layout: lt }} className="app-work-stars tabular">
        <PixelGlyph cells={GLYPH_STAR} size={9} />
        {compact(repo.stars, lang)}
      </m.span>
      <m.span layout="position" transition={{ layout: lt }} className="app-work-date tabular">
        {hydrated && repo.pushedAt ? timeAgo(repo.pushedAt, lang) : " "}
      </m.span>
    </m.li>
  );
}
