import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  experimental: {
    // the root layout lives under [lang], so a 404 can't be composed from
    // layout + not-found: app/global-not-found.tsx renders it, server-side
    globalNotFound: true,
  },
  async headers() {
    // the admin panel: never framed (clickjacking), never indexed, never referred
    const admin = [
      { key: "X-Frame-Options", value: "DENY" },
      { key: "Content-Security-Policy", value: "frame-ancestors 'none'" },
      { key: "X-Robots-Tag", value: "noindex, nofollow" },
      { key: "Referrer-Policy", value: "no-referrer" },
    ];
    // pages and their navigation payloads: a browser may keep them, but only to ask again before using
    // them. Next marks them for CDNs (s-maxage, then a year of stale-while-revalidate), which Chrome reads
    // as leave to serve its copy from an older deploy, naming app code that no longer matches the rest
    // of the page (an app then crashes on text that has since moved)
    const fresh = [{ key: "Cache-Control", value: "private, no-cache" }];
    return [
      { source: "/:path*", has: [{ type: "header", key: "rsc" }], headers: fresh },
      { source: "/:path*", has: [{ type: "header", key: "accept", value: "(.*)text/html(.*)" }], headers: fresh },
      { source: "/admin", headers: admin },
      { source: "/:lang(en|fr)/admin", headers: admin },
      { source: "/api/admin/:path*", headers: admin },
    ];
  },
  async redirects() {
    // the Blog used to live at /writing: old links and search results land on the same post
    return [
      { source: "/writing/:path*", destination: "/blog/:path*", permanent: true },
      { source: "/:lang(en|fr)/writing/:path*", destination: "/:lang/blog/:path*", permanent: true },
    ];
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
