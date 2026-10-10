import type { ReactNode } from "react";

/**
 * Route changes pop in like a fresh Hyprland window (popin + fade,
 * the distro's easeOutQuint). Template remounts on every navigation,
 * so the entrance replays for free. Pure CSS: SSR-safe, and the
 * reduced-motion block switches it off.
 */
export default function Template({ children }: { children: ReactNode }) {
  return <div className="os-route">{children}</div>;
}
