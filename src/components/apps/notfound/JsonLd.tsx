import { getDict, type Locale } from "@/i18n";
import { SITE_URL, localePath } from "@/i18n/config";
import { SOCIALS } from "@/lib/socials";
import { homeOf } from "@/lib/content";
import { getPlaces } from "@/server/content";
import { BLOG_URL } from "@/components/apps/writing/util";

/**
 * Structured data for the home page (server component: render it from a
 * page or layout, never from a client component). One graph: Elliot as a
 * Person, with his profiles as sameAs, and the site as a WebSite he
 * publishes, in the page's language; his country is the home place's.
 * Sanitized per Next's JSON-LD guide (`<` escaped so no string can close
 * the script).
 */
export function PersonJsonLd({ lang }: { lang: Locale }) {
  const t = getDict(lang);
  const country = homeOf(getPlaces())?.iso ?? "FR";
  const person = `${SITE_URL}/#person`;
  const data = {
    "@context": "https://schema.org",
    "@graph": [
      {
        "@type": "Person",
        "@id": person,
        name: "Elliot Moreau",
        url: SITE_URL,
        // a student: his school, not a job title
        affiliation: { "@type": "EducationalOrganization", name: "Epitech", url: "https://www.epitech.eu" },
        description: t.meta.description,
        address: { "@type": "PostalAddress", addressCountry: country },
        knowsLanguage: ["fr", "en"],
        sameAs: [SOCIALS.github, SOCIALS.mastodon, SOCIALS.youtube, SOCIALS.x, SOCIALS.spotifyUser, BLOG_URL],
      },
      {
        "@type": "WebSite",
        "@id": `${SITE_URL}/#website`,
        url: new URL(localePath(lang, "/"), SITE_URL).toString(),
        name: t.meta.siteName,
        description: t.meta.description,
        inLanguage: lang === "fr" ? "fr-FR" : "en-US",
        author: { "@id": person },
        publisher: { "@id": person },
      },
    ],
  };
  return (
    <script
      type="application/ld+json"
      dangerouslySetInnerHTML={{ __html: JSON.stringify(data).replace(/</g, "\\u003c") }}
    />
  );
}
