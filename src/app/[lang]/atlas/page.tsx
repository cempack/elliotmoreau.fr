import { notFound } from "next/navigation";
import { getNamespaces, hasLocale } from "@/i18n";
import { I18nScope } from "@/i18n/client";
import { appMetadata } from "@/i18n/metadata";
import { AtlasApp } from "@/components/apps/atlas/AtlasApp";

export const revalidate = 300;

export function generateMetadata({ params }: PageProps<"/[lang]/atlas">) {
  return appMetadata(params, "atlas", "/atlas");
}

export default async function AtlasPage({ params }: PageProps<"/[lang]/atlas">) {
  const { lang } = await params;
  if (!hasLocale(lang)) notFound();
  // the app reads live data from the shell's SiteData; the page sends only its strings
  return (
    <I18nScope dict={getNamespaces(lang, "atlas")}>
      <AtlasApp />
    </I18nScope>
  );
}
