/**
 * The boot is out of the way: it has played, or it isn't up (it only ever
 * plays on the Desktop, so a 404 reached by a link, a visitor's first
 * page, doesn't wait for one), or motion is reduced (it never shows).
 */
export const introOver = () => {
  const d = document.documentElement.dataset;
  return d.intro === "done" || d.introUp == null || window.matchMedia("(prefers-reduced-motion: reduce)").matches;
};
