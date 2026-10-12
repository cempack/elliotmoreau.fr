"use client";

import { useEffect, type RefObject } from "react";

/**
 * The right-click menu's registry. Any element can say what a right-click
 * inside it offers: `useContextMenu(ref, build)`. On a right-click the menu
 * walks from the element under the pointer up to the page, asking each
 * registered element in turn, so the most specific thing comes first (a
 * project row, then its window, then the OS). ContextMenu.tsx adds what
 * every page gets (the link or the selection under the pointer, and
 * Search) and draws it.
 */
export type MenuItem = {
  label: string;
  onSelect?: () => void;
  /** shown on the right, the way a menu shows a key: "⌘K" */
  shortcut?: string;
  /** a setting: undefined is not one, true shows the check */
  checked?: boolean;
  disabled?: boolean;
  /** opens beside the item instead of acting */
  submenu?: MenuItem[];
};

export type MenuSection = {
  items: MenuItem[];
  /** this section already covers the link under the pointer (no generic Open / Copy link) */
  coversLink?: boolean;
  /** nothing from further out: the element is the whole story (an icon, not the desk under it) */
  final?: boolean;
};

export type MenuContext = {
  /** the element under the pointer */
  target: Element;
  /** the link under the pointer, if any */
  link: HTMLAnchorElement | null;
  /** opened from the keyboard (the menu key, Shift+F10) */
  keyboard: boolean;
};

export type MenuBuilder = (ctx: MenuContext) => MenuSection | MenuSection[] | null | undefined | false;

const builders = new WeakMap<Element, MenuBuilder>();

/**
 * What a right-click inside `ref` offers. `build` runs at the moment of the
 * click (so it reads the state of that moment) and returns its sections, or
 * nothing to leave it to the elements around it.
 */
export function useContextMenu(ref: RefObject<Element | null>, build: MenuBuilder) {
  // every render: the element can change, and the builder closes over the
  // latest state (a WeakMap write is all it costs)
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    builders.set(el, build);
    return () => {
      if (builders.get(el) === build) builders.delete(el);
    };
  });
}

/** Every registered section from `target` out to the page, innermost first. */
export function collect(ctx: MenuContext): { sections: MenuSection[]; coversLink: boolean; final: boolean } {
  const sections: MenuSection[] = [];
  let coversLink = false;
  let final = false;
  for (let el: Element | null = ctx.target; el && !final; el = el.parentElement) {
    const build = builders.get(el);
    if (!build) continue;
    const got = build(ctx);
    if (!got) continue;
    for (const s of Array.isArray(got) ? got : [got]) {
      const items = s.items.filter(Boolean);
      if (!items.length) continue;
      sections.push({ ...s, items });
      if (s.coversLink) coversLink = true;
      if (s.final) final = true;
    }
  }
  return { sections, coversLink, final };
}

/** The platform's way of writing a shortcut: "⌘K" / "⌃↑" on a Mac, "Ctrl K" elsewhere. */
export function shortcut(key: string, mod: "cmd" | "ctrl" = "cmd") {
  const mac = typeof navigator !== "undefined" && /Mac|iPhone|iPad/.test(navigator.platform || navigator.userAgent);
  if (!mac) return `Ctrl ${key}`;
  return `${mod === "cmd" ? "⌘" : "⌃"}${key}`;
}
