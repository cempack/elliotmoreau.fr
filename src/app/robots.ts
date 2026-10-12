import type { MetadataRoute } from "next";
import { SITE_URL } from "@/i18n/config";

export default function robots(): MetadataRoute.Robots {
  return {
    rules: { userAgent: "*", allow: "/", disallow: ["/api/", "/admin", "/fr/admin"] },
    sitemap: `${SITE_URL}/sitemap.xml`,
  };
}
