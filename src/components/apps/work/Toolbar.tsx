"use client";

import { useEffect, useId, useLayoutEffect, useRef, useState } from "react";
import { AnimatePresence, LayoutGroup, m } from "motion/react";
import { useI18n } from "@/i18n/client";
import { spring } from "@/lib/motion";
import { useSound } from "@/lib/sound";
import { PixelGlyph } from "@/components/glyphs";
import { G_ALL, G_CHECK, G_CHEVRON, G_CLOSE, G_LIST, G_PEAKS, G_SEARCH, G_SORT } from "./glyphs";
import { SORTS, fmt, type SortKey } from "./model";

type View = "icons" | "list" | "years";

/**
 * Search, view switch and sort, in two shapes: `bar` lives in the window's
 * title bar (≥768px), `inline` is a sticky row at the top of the content
 * on phones. Only one is ever displayed; both drive the same state.
 */
export function Toolbar({
  variant,
  query,
  onQuery,
  view,
  onView,
  sort,
  onSort,
  onSubmit,
  disabled = false,
}: {
  variant: "bar" | "inline";
  query: string;
  onQuery: (q: string) => void;
  /** effective view, null until hydrated (CSS decides before that) */
  view: View | null;
  onView: (v: View) => void;
  sort: SortKey;
  onSort: (s: SortKey) => void;
  /** Enter / ↓ in the field: hand focus to the results */
  onSubmit: () => void;
  disabled?: boolean;
}) {
  const { t } = useI18n();
  const tb = t.work.toolbar;
  const id = useId();
  const inputRef = useRef<HTMLInputElement>(null);

  return (
    <div className={`app-work-tb app-work-tb--${variant}`} data-no-drag>
      <label className="app-work-search" htmlFor={`${id}-q`}>
        <PixelGlyph cells={G_SEARCH} size={11} className="app-work-search-glyph" />
        <input
          ref={inputRef}
          id={`${id}-q`}
          type="search"
          inputMode="search"
          enterKeyHint="search"
          autoComplete="off"
          autoCorrect="off"
          spellCheck={false}
          data-work-search
          disabled={disabled}
          value={query}
          placeholder={tb.search}
          aria-label={tb.searchLabel}
          onChange={(e) => onQuery(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Escape") {
              e.preventDefault();
              e.stopPropagation();
              if (query) onQuery("");
              else inputRef.current?.blur();
            } else if (e.key === "Enter" || e.key === "ArrowDown") {
              e.preventDefault();
              onSubmit();
            }
          }}
          className="app-work-search-input"
        />
        {query ? (
          <button
            type="button"
            className="app-work-search-clear"
            aria-label={tb.clear}
            onClick={() => {
              onQuery("");
              inputRef.current?.focus();
            }}
          >
            <PixelGlyph cells={G_CLOSE} size={7} />
          </button>
        ) : (
          variant === "bar" && (
            <kbd className="app-work-kbd" aria-hidden>
              /
            </kbd>
          )
        )}
      </label>

      <LayoutGroup id={`app-work-view-${variant}`}>
        <div className="app-work-seg" role="group" aria-label={tb.view}>
          {(["icons", "list", "years"] as const).map((v) => (
            <button
              key={v}
              type="button"
              className="app-work-seg-btn"
              aria-pressed={view === null ? undefined : view === v}
              aria-label={tb[v]}
              title={tb[v]}
              data-active={view === v || undefined}
              onClick={() => onView(v)}
              disabled={disabled}
            >
              {view === v && (
                <m.span layoutId="thumb" className="app-work-seg-thumb" transition={spring.snappy} aria-hidden />
              )}
              <PixelGlyph cells={v === "icons" ? G_ALL : v === "list" ? G_LIST : G_PEAKS} size={11} />
            </button>
          ))}
        </div>
      </LayoutGroup>

      {/* the lid lays its stickers out by size, the years by work: an order only means something in the list */}
      {view !== "icons" && view !== "years" && <SortMenu sort={sort} onSort={onSort} disabled={disabled} />}
    </div>
  );
}

/**
 * Sort as a pull-down: opens on pointer-down like a native menu, grows
 * from its trigger, arrow keys move between the three choices, Esc or a
 * click outside closes and hands focus back to the trigger.
 */
function SortMenu({ sort, onSort, disabled }: { sort: SortKey; onSort: (s: SortKey) => void; disabled: boolean }) {
  const { t } = useI18n();
  const tb = t.work.toolbar;
  const { blip } = useSound();
  const [open, setOpen] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);
  const btnRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const pressed = useRef(false);
  const id = useId();
  const label = (s: SortKey) => tb[s];

  // transient: closed whenever the page is hidden (Activity) or unmounts
  useLayoutEffect(() => () => setOpen(false), []);

  useEffect(() => {
    if (!open) return;
    const menu = menuRef.current;
    const checked = menu?.querySelector<HTMLElement>('[aria-checked="true"]');
    (checked ?? menu?.querySelector<HTMLElement>("[role=menuitemradio]"))?.focus({ preventScroll: true });
    const onDown = (e: PointerEvent) => {
      if (!wrapRef.current?.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        e.stopPropagation();
        setOpen(false);
        btnRef.current?.focus({ preventScroll: true });
      }
    };
    window.addEventListener("pointerdown", onDown, true);
    window.addEventListener("keydown", onKey, true);
    return () => {
      window.removeEventListener("pointerdown", onDown, true);
      window.removeEventListener("keydown", onKey, true);
    };
  }, [open]);

  const choose = (s: SortKey) => {
    if (s !== sort) blip("select");
    onSort(s);
    setOpen(false);
    btnRef.current?.focus({ preventScroll: true });
  };

  const onMenuKey = (e: React.KeyboardEvent) => {
    const items = [...(menuRef.current?.querySelectorAll<HTMLElement>("[role=menuitemradio]") ?? [])];
    const i = items.indexOf(document.activeElement as HTMLElement);
    let next = -1;
    if (e.key === "ArrowDown") next = (i + 1) % items.length;
    else if (e.key === "ArrowUp") next = (i - 1 + items.length) % items.length;
    else if (e.key === "Home") next = 0;
    else if (e.key === "End") next = items.length - 1;
    else if (e.key === "Tab") setOpen(false);
    if (next >= 0) {
      e.preventDefault();
      items[next]?.focus();
    }
  };

  return (
    <div ref={wrapRef} className="app-work-sort">
      <button
        ref={btnRef}
        type="button"
        className="app-work-sort-btn"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={open ? `${id}-menu` : undefined}
        aria-label={fmt(tb.sortCurrent, { sort: label(sort) })}
        disabled={disabled}
        onPointerDown={(e) => {
          if (e.button !== 0 || e.pointerType !== "mouse") return;
          e.preventDefault();
          pressed.current = true;
          setOpen((o) => !o);
        }}
        onClick={() => {
          // keyboard and touch; a mouse already toggled on pointer-down
          if (pressed.current) {
            pressed.current = false;
            return;
          }
          setOpen((o) => !o);
        }}
        onKeyDown={(e) => {
          if (e.key === "ArrowDown" || e.key === "ArrowUp") {
            e.preventDefault();
            setOpen(true);
          }
        }}
      >
        <PixelGlyph cells={G_SORT} size={11} />
        <span className="app-work-sort-label">{label(sort)}</span>
        <PixelGlyph cells={G_CHEVRON} size={7} className="app-work-sort-chev" />
      </button>
      <AnimatePresence>
        {open && (
          <m.div
            ref={menuRef}
            id={`${id}-menu`}
            role="menu"
            aria-label={tb.sortMenu}
            className="app-work-menu glass-thick"
            data-no-drag
            initial={{ opacity: 0, scale: 0.92, y: -6 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.96, y: -4, transition: { duration: 0.12 } }}
            transition={spring.snappy}
            onKeyDown={onMenuKey}
          >
            <p className="app-work-menu-h" aria-hidden>
              {tb.sortBy}
            </p>
            {SORTS.map((s) => (
              <button
                key={s}
                type="button"
                role="menuitemradio"
                aria-checked={s === sort}
                tabIndex={-1}
                className="app-work-menu-item"
                onClick={() => choose(s)}
              >
                <span className="app-work-menu-check" aria-hidden>
                  {s === sort && <PixelGlyph cells={G_CHECK} size={9} />}
                </span>
                {label(s)}
              </button>
            ))}
          </m.div>
        )}
      </AnimatePresence>
    </div>
  );
}
