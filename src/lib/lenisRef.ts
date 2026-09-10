import type Lenis from "lenis";

/**
 * Handle to the site-wide Lenis instance owned by <SmoothScroll />.
 * Null on the server and under prefers-reduced-motion (no Lenis there).
 * Lets overlays pause scrolling and buttons glide through Lenis instead
 * of fighting it with native smooth scrolls.
 */
export const lenisRef: { current: Lenis | null } = { current: null };
