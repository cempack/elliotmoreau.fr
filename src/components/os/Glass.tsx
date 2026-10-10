"use client";

/**
 * CONTRACT (owner: shell/visual agent)
 * Liquid Glass surface. `thickness` maps to the glass-thin/glass/
 * glass-thick materials; in Chromium a refracting SVG displacement map is
 * layered in (on an inset child, so outer shadows/overflow never shift
 * the filter origin); frosted elsewhere; opaque under
 * prefers-reduced-transparency. Polymorphic via `as`.
 */
export function Glass({
  as: As = "div",
  thickness = "regular",
  className = "",
  children,
  ...rest
}: {
  as?: "div" | "section" | "aside" | "header" | "nav" | "footer" | "article";
  thickness?: "thin" | "regular" | "thick";
  className?: string;
  children?: React.ReactNode;
} & React.HTMLAttributes<HTMLElement>) {
  const mat = thickness === "thin" ? "glass-thin" : thickness === "thick" ? "glass-thick" : "glass";
  return (
    <As className={`${mat} ${className}`} {...rest}>
      {children}
    </As>
  );
}
