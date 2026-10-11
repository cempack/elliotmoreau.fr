import { getNamespaces, LOCALES, type Locale } from "@/i18n";
import { I18nScopeByLang } from "@/i18n/client";
import { NotFoundLazy } from "@/components/apps/notfound/Lazy";

// Real 404s render through app/global-not-found.tsx; this segment-level
// fallback only shows for an explicit notFound() inside a route. It gets no
// params, so it sends its strings in both languages and the client picks.
export default function NotFound() {
  const dicts = Object.fromEntries(LOCALES.map((l) => [l, getNamespaces(l, "notfound")])) as Record<Locale, ReturnType<typeof getNamespaces<"notfound">>>;
  return (
    <I18nScopeByLang dicts={dicts}>
      <NotFoundLazy />
    </I18nScopeByLang>
  );
}
