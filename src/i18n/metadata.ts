import "server-only";
import type { Metadata } from "next";
import { getDict, hasLocale, localePath } from "./index";

type PageKey = "work" | "writing" | "atlas" | "now" | "contact";

/** Per-app metadata: localized title/description, canonical + hreflang alternates. */
export async function appMetadata(params: Promise<{ lang: string }>, key: PageKey, path: string): Promise<Metadata> {
  const { lang } = await params;
  if (!hasLocale(lang)) return {};
  const t = getDict(lang).meta;
  const title = t.pages[key];
  const description = t.pageDescriptions[key];
  return {
    title,
    description,
    alternates: {
      canonical: localePath(lang, path),
      languages: { en: localePath("en", path), fr: localePath("fr", path), "x-default": localePath("en", path) },
    },
    // Next merges metadata shallowly per key: these replace the layout's
    // openGraph/twitter objects whole, so they restate type, site name,
    // locale and the large card
    openGraph: {
      type: "website",
      siteName: t.siteName,
      locale: lang === "fr" ? "fr_FR" : "en_US",
      title: `${title} — ${t.siteName}`,
      description,
      url: localePath(lang, path),
    },
    twitter: { card: "summary_large_image", title: `${title} — ${t.siteName}`, description },
  };
}
