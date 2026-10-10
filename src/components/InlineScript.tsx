"use client";

/**
 * Pre-paint inline script that runs on the initial HTML parse only. On the
 * client (soft navigations) it renders as inert text/plain so React doesn't
 * warn about script tags; suppressHydrationWarning covers the type swap.
 * Pattern from Next's "preventing flash before hydration" guide.
 */
export function InlineScript({ html }: { html: string }) {
  return (
    <script
      type={typeof window === "undefined" ? "text/javascript" : "text/plain"}
      suppressHydrationWarning
      dangerouslySetInnerHTML={{ __html: html }}
    />
  );
}
