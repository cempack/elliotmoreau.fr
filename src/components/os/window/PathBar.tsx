"use client";

import Link from "next/link";
import { useI18n } from "@/i18n/client";

export type Crumb = {
  label: string;
  /** a route (localized) or an in-page target */
  href?: string;
  /** an in-app step up (clear a filter, back to a mailbox) */
  onClick?: () => void;
  /** joined without a slash ("?q=go") */
  suffix?: boolean;
};

/**
 * The mono path in a window's title bar, as Finder's path bar: "~" goes to
 * the Desktop, each segment up to its level, the last one is where you
 * are. Phones keep it decorative (hidden with the other title-bar extras).
 */
export function PathBar({ crumbs }: { crumbs: Crumb[] }) {
  const { t, path } = useI18n();
  const all: Crumb[] = [{ label: "~", href: path("/") }, ...crumbs];
  const last = all.length - 1;
  return (
    // a span (it sits inside the title bar's inline subtitle), as a landmark
    <span role="navigation" className="os-win-sub os-win-sub--path os-path" aria-label={t.windowing.window.path}>
      {all.map((c, i) => {
        const current = i === last;
        const sep = i > 0 && !c.suffix ? (
          <span className="os-path-sep" aria-hidden>
            /
          </span>
        ) : null;
        const body = current ? (
          <span className="os-path-seg" aria-current="location">
            {c.label}
          </span>
        ) : c.onClick ? (
          <button type="button" className="os-path-seg os-path-link" onClick={c.onClick}>
            {c.label}
          </button>
        ) : c.href ? (
          <Link prefetch={false} href={c.href} className="os-path-seg os-path-link" transitionTypes={i === 0 ? ["app-close"] : undefined}>
            {c.label}
          </Link>
        ) : (
          <span className="os-path-seg">{c.label}</span>
        );
        return (
          <span key={`${i}-${c.label}`} className="os-path-item">
            {sep}
            {body}
          </span>
        );
      })}
    </span>
  );
}
