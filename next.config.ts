import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  experimental: {
    // the root layout lives under [lang], so a 404 can't be composed from
    // layout + not-found: app/global-not-found.tsx renders it, server-side
    globalNotFound: true,
  },
};

export default nextConfig;
