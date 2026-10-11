import type { MetadataRoute } from "next";
import { LOCALES, SITE_URL, localePath, type Locale } from "@/i18n/config";
import { getSiteData } from "@/lib/data";
import { NOW } from "@/content/now";

/**
 * Every app in both languages, each entry carrying its hreflang
 * alternates (en, fr, x-default → en). `lastModified` is only set where
 * there's a real date behind it: the newest post (Writing), the latest
 * push (Projects), the hand-edited /now date, and the newest of those for
 * the Desktop, which shows them all. Atlas and Mail carry none.
 */

const ROUTES = ["/", "/work", "/writing", "/atlas", "/now", "/contact"] as const;
type Route = (typeof ROUTES)[number];

export const revalidate = 3600;

const url = (lang: Locale, route: Route) => new URL(localePath(lang, route), SITE_URL).toString();

function newest(dates: (string | undefined | null)[]) {
  let best: Date | undefined;
  for (const d of dates) {
    if (!d) continue;
    const t = new Date(d);
    if (!Number.isNaN(+t) && (!best || t > best)) best = t;
  }
  return best;
}

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const data = await getSiteData().catch(() => null);
  const writing = newest((data?.posts ?? []).map((p) => p.published_at));
  const work = newest((data?.repos ?? []).map((r) => r.pushedAt));
  const now = newest([NOW.updated]);
  const lastModified: Partial<Record<Route, Date>> = {
    "/": newest([writing?.toISOString(), work?.toISOString(), now?.toISOString(), data?.activity?.createdAt]),
    "/work": work,
    "/writing": writing,
    "/now": now,
  };
  return ROUTES.flatMap((route) =>
    LOCALES.map((lang) => ({
      url: url(lang, route),
      ...(lastModified[route] && { lastModified: lastModified[route] }),
      alternates: {
        languages: { en: url("en", route), fr: url("fr", route), "x-default": url("en", route) },
      },
    }))
  );
}
