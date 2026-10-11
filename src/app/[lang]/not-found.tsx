"use client";

import dynamic from "next/dynamic";

// Real 404s render through app/global-not-found.tsx; this segment-level
// fallback only shows for an explicit notFound() inside a route. Loaded
// lazily so its stylesheet isn't preloaded on every page ("CSS preloaded
// but not used" warnings).
const NotFoundApp = dynamic(() => import("@/components/apps/notfound/NotFoundApp").then((m) => m.NotFoundApp));

export default function NotFound() {
  return <NotFoundApp />;
}
