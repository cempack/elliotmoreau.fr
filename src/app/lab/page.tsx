import Link from "next/link";
import { ViewTransition } from "react";
import { PixelPlanet } from "@/components/PixelPlanet";

const DIRS = [
  {
    href: "/lab/glass",
    key: "A",
    name: "Liquid Glass",
    line: "Spatial and physical. Refracting glass over a still pixel night; widgets that open into sheets you can fling away.",
    seed: "glass",
  },
  {
    href: "/lab/journal",
    key: "B",
    name: "Kinetic Journal",
    line: "Editorial and scroll-driven. Type that assembles as you read, a pinned run of travel postcards, a paper chapter.",
    seed: "journal",
  },
  {
    href: "/lab/rice",
    key: "C",
    name: "Rice OS",
    line: "An immersive tiny desktop. Boot sequence, draggable tiling windows, a waybar, workspaces on 1–4.",
    seed: "rice-os",
  },
];

export default function LabIndex() {
  return (
    <ViewTransition enter="lab-fade" exit="lab-fade" default="none">
      <main className="mx-auto flex min-h-svh w-full max-w-5xl flex-col justify-center px-4 py-20 font-[family-name:var(--font-inter)] sm:px-6">
        <p className="font-mono text-xs tracking-wide text-sage">elliotmoreau.fr / lab</p>
        <h1 className="mt-4 text-[clamp(2.5rem,7vw,5rem)] font-semibold leading-[1.02] tracking-[-0.035em] text-bone">
          Three directions.
          <br />
          <span className="text-sage">Pick one, or a mix.</span>
        </h1>
        <p className="mt-6 max-w-xl text-[17px] leading-relaxed text-sage">
          Each is a working home page with the same content, the same hero and the same ⌘K palette — only the design
          language changes. Press <kbd className="em-kbd">⌘K</kbd> anywhere inside one.
        </p>
        <ul className="mt-12 grid gap-3 sm:grid-cols-3">
          {DIRS.map((d) => (
            <li key={d.href}>
              <Link
                href={d.href}
                transitionTypes={["lab-switch"]}
                className="group flex h-full flex-col rounded-[22px] border border-white/10 bg-white/[0.03] p-5 transition-colors hover:border-ember/50 hover:bg-white/[0.05] active:scale-[0.98]"
              >
                <span className="flex items-center justify-between">
                  <span className="grid h-8 w-8 place-items-center rounded-full bg-ember text-sm font-semibold text-ink">
                    {d.key}
                  </span>
                  <PixelPlanet seed={d.seed} className="h-14 w-14" />
                </span>
                <span className="mt-8 text-xl font-semibold tracking-[-0.02em] text-bone">{d.name}</span>
                <span className="mt-2 text-[14px] leading-relaxed text-sage">{d.line}</span>
                <span className="mt-6 text-[13px] font-medium text-ember">Open prototype →</span>
              </Link>
            </li>
          ))}
        </ul>
      </main>
    </ViewTransition>
  );
}
