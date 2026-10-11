"use client";

import { useEffect, useRef } from "react";
import Link from "next/link";
import { m } from "motion/react";
import { spring } from "@/lib/motion";

/**
 * Sidebar navigation for an AppWindow's `sidebar` slot. One component,
 * two shapes: a vertical source list on ≥lg, and a horizontal, scrollable
 * segmented strip at the top of the window below that. The active item
 * carries a thumb that springs between items (shared layout).
 *
 *   <AppWindow app="writing" sidebar={
 *     <WinNav label={t.writing.filters}>
 *       <WinNavItem href="#all" active={tag === "all"} count={12}>All</WinNavItem>
 *       <WinNavItem onClick={() => setTag("linux")} active={tag === "linux"}>Linux</WinNavItem>
 *     </WinNav>
 *   }>
 *
 * Anything else in the sidebar marked `data-win-hide-compact` is hidden in
 * the strip.
 */
export function WinNav({
  label,
  children,
  className = "",
}: {
  label: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <nav aria-label={label} className={`os-win-nav ${className}`}>
      <ul className="os-win-nav-list" role="list">
        {children}
      </ul>
    </nav>
  );
}

export function WinNavItem({
  href,
  onClick,
  active = false,
  icon,
  count,
  children,
  transitionTypes,
}: {
  /** a route (use path()) or an in-page anchor ("#section") */
  href?: string;
  onClick?: () => void;
  active?: boolean;
  icon?: React.ReactNode;
  count?: number | string;
  children: React.ReactNode;
  transitionTypes?: string[];
}) {
  const ref = useRef<HTMLLIElement>(null);

  // keep the active segment in view when the strip scrolls sideways
  useEffect(() => {
    // only the compact strip (<1024px) scrolls sideways; the rect reads wait for the
    // next frame so they never force a layout inside the commit
    if (!active || !window.matchMedia("(max-width: 1023px)").matches) return;
    const raf = requestAnimationFrame(() => {
      const li = ref.current;
      const strip = li?.closest<HTMLElement>(".os-win-side");
      if (!li || !strip || strip.scrollWidth <= strip.clientWidth) return;
      const a = li.getBoundingClientRect();
      const b = strip.getBoundingClientRect();
      if (a.left >= b.left + 12 && a.right <= b.right - 12) return;
      const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
      strip.scrollBy({ left: a.left - b.left - (b.width - a.width) / 2, behavior: reduced ? "auto" : "smooth" });
    });
    return () => cancelAnimationFrame(raf);
  }, [active]);

  const body = (
    <>
      {active && (
        <m.span layoutId="os-win-nav-thumb" className="os-win-nav-thumb" transition={spring.snappy} aria-hidden />
      )}
      {icon && (
        <span className="os-win-nav-icon" aria-hidden>
          {icon}
        </span>
      )}
      <span className="os-win-nav-label">{children}</span>
      {count != null && <span className="os-win-nav-count tabular">{count}</span>}
    </>
  );

  return (
    <li ref={ref} className="os-win-nav-li">
      {href ? (
        <Link
          href={href}
          onClick={onClick}
          transitionTypes={transitionTypes}
          aria-current={active ? (href.startsWith("#") ? "location" : "page") : undefined}
          data-active={active || undefined}
          className="os-win-nav-item"
        >
          {body}
        </Link>
      ) : (
        <button
          type="button"
          onClick={onClick}
          aria-pressed={active}
          data-active={active || undefined}
          className="os-win-nav-item"
        >
          {body}
        </button>
      )}
    </li>
  );
}
