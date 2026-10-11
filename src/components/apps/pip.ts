/**
 * The mini player's resting rect, as the shell publishes it on <html>
 * (contract B: data-os-pip and --os-pip-x/y/w/h, in px). Where it rests,
 * not where a fling has it mid-flight, so placements computed from it
 * don't chase the gesture. Null when it is hidden or not published yet.
 * Apps read this instead of the player's DOM (.os-pip / .os-pip-safe).
 */
export type PipRect = {
  corner: "tl" | "tr" | "bl" | "br";
  left: number;
  top: number;
  right: number;
  bottom: number;
  width: number;
  height: number;
};

export function readPip(): PipRect | null {
  if (typeof document === "undefined") return null;
  const root = document.documentElement;
  const corner = root.dataset.osPip;
  if (corner !== "tl" && corner !== "tr" && corner !== "bl" && corner !== "br") return null;
  const css = getComputedStyle(root);
  const px = (k: string) => parseFloat(css.getPropertyValue(`--os-pip-${k}`)) || 0;
  const width = px("w");
  const height = px("h");
  if (!width || !height) return null;
  const left = px("x");
  const top = px("y");
  return { corner, left, top, width, height, right: left + width, bottom: top + height };
}

/** Attributes on <html> that change whenever the player republishes. */
export const PIP_ATTRS = ["data-os-pip", "data-os-pip-size", "style"];
