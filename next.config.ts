import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  experimental: {
    // the root layout lives under [lang], so a 404 can't be composed from
    // layout + not-found: app/global-not-found.tsx renders it, server-side
    globalNotFound: true,
  },
  async rewrites() {
    return {
      beforeFiles: [],
      // Only a locale may reach the [lang] routes. Paths the proxy lets
      // through untouched (anything with a dot, /_vercel, /apiary…) would
      // otherwise render a 404 for an unknown "lang" and cache it on disk
      // under their own name, one file per stray URL. Moved under /en they
      // match no route and get the ordinary, uncached 404 page. Files and
      // static routes are served before afterFiles rewrites are tried;
      // dynamic routes are not, so every top-level folder with dynamic
      // routes besides [lang] (api/) must be excluded here; bare /api,
      // a favourite of scanners, is caught on its own.
      afterFiles: [
        { source: "/:first((?!(?:en|fr|api|_next)(?:/|$))[^/]+)/:rest*", destination: "/en/:first/:rest*" },
        { source: "/api", destination: "/en/api" },
      ],
      fallback: [],
    };
  },
};

export default nextConfig;
