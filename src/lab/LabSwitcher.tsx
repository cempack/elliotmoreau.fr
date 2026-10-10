"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { m } from "motion/react";
import { spring } from "@/lib/motion";
import type { HomeData } from "@/lib/data";
import { useCopy } from "./copy";

const DIRS = [
  { href: "/lab/glass", key: "A", name: "Glass" },
  { href: "/lab/journal", key: "B", name: "Journal" },
  { href: "/lab/rice", key: "C", name: "Rice" },
];

/**
 * Floating A/B/C switch so the directions can be compared back to back.
 * Lab-only chrome; shows a chip when any section runs on sample data.
 */
export function LabSwitcher({ data }: { data: HomeData }) {
  const pathname = usePathname();
  const c = useCopy();
  const sample = Object.values(data.sources).some((s) => s === "sample");
  return (
    <div className="lab-switcher" style={{ viewTransitionName: "lab-switcher" }}>
      <Link href="/lab" className="lab-switcher-home" aria-label="Lab index">
        lab
      </Link>
      {DIRS.map((d) => {
        const on = pathname === d.href;
        return (
          <Link
            key={d.href}
            href={d.href}
            aria-current={on ? "page" : undefined}
            className="lab-switcher-item"
            title={d.name}
            transitionTypes={["lab-switch"]}
          >
            {on && <m.span layoutId="lab-switcher-thumb" className="lab-switcher-thumb" transition={spring.snappy} />}
            <span className="relative">{d.key}</span>
          </Link>
        );
      })}
      {sample && <span className="lab-switcher-chip">{c.sample}</span>}
    </div>
  );
}
