"use client";

import { useEffect } from "react";
import { useIntroFinish } from "@/components/ui/IntroGate";
import { PixelLabel } from "@/components/PixelLabel";

/**
 * Boot log for IntroGate. The whole sequence is CSS (staggered line
 * reveals + a stepped pixel progress bar), so it plays from the very first
 * server-rendered paint, before hydration. JS only ends it on time,
 * measured from first paint, so a slow hydrate never stretches it.
 */
const LINES: [string, string][] = [
  ["", "Linux 6.18.4-dosmoos #1 SMP PREEMPT_DYNAMIC x86_64"],
  ["", "Loading initial ramdisk… ok"],
  ["OK", "Mounted /home/elliot"],
  ["OK", "Started Network Manager"],
  ["OK", "Reached target Graphical Interface"],
  ["OK", "Started Hyprland compositor"],
  ["OK", "Started hyprpaper · wallpaper painted"],
  ["OK", "Started Waybar status bar"],
  ["OK", "Started spotifyd · now playing"],
  ["OK", "Synced github.com/cempack"],
  ["OK", "Started elliotmoreau.fr"],
];

export const BOOT_MS = 1750;

export function Boot() {
  const finish = useIntroFinish();
  useEffect(() => {
    // measure from first paint: that's when the CSS sequence started
    const fcp = performance.getEntriesByName("first-contentful-paint")[0]?.startTime;
    const elapsed = performance.now() - (fcp ?? performance.now());
    const t = window.setTimeout(finish, Math.max(0, BOOT_MS - elapsed));
    return () => window.clearTimeout(t);
  }, [finish]);

  return (
    <div className="rice-boot">
      <div className="rice-boot-log">
        {LINES.map(([tag, text], i) => (
          <p key={text} style={{ "--i": i } as React.CSSProperties}>
            {tag ? (
              <span className="rice-boot-ok">[&nbsp;&nbsp;OK&nbsp;&nbsp;]</span>
            ) : (
              <span className="rice-boot-ts">[{(i * 0.21).toFixed(6).padStart(11, " ")}]</span>
            )}{" "}
            {text}
          </p>
        ))}
      </div>
      <div className="rice-boot-foot">
        <PixelLabel text="DOS MOOS" cell={6} className="rice-boot-logo" />
        <div className="rice-boot-bar" aria-hidden>
          <span />
        </div>
        <p className="rice-boot-cap">elliotmoreau.fr</p>
      </div>
    </div>
  );
}
