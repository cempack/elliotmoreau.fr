import type { MetadataRoute } from "next";
import { getDict } from "@/i18n";

/**
 * emOS as an installable app. The icons are generated under [lang] (the
 * locale proxy sends extension-less paths there), so they're listed by
 * their English URLs; the 512 is maskable-safe (the mark sits inside the
 * centre 80%).
 */
export default function manifest(): MetadataRoute.Manifest {
  const t = getDict("en").meta;
  return {
    id: "/",
    name: `emOS — ${t.siteName}`,
    short_name: "emOS",
    description: t.description,
    lang: "en",
    dir: "ltr",
    start_url: "/",
    scope: "/",
    display: "standalone",
    background_color: "#05060a",
    theme_color: "#05060a",
    icons: [
      { src: "/en/icon", sizes: "32x32", type: "image/png" },
      { src: "/en/apple-icon", sizes: "180x180", type: "image/png" },
      { src: "/en/icon1", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/en/icon2", sizes: "512x512", type: "image/png", purpose: "any" },
      { src: "/en/icon2", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  };
}
