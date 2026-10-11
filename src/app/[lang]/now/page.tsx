import { notFound } from "next/navigation";
import { getNamespaces, hasLocale } from "@/i18n";
import { I18nScope } from "@/i18n/client";
import { appMetadata } from "@/i18n/metadata";
import { NowApp } from "@/components/apps/now/NowApp";

export const revalidate = 300;

export function generateMetadata({ params }: PageProps<"/[lang]/now">) {
  return appMetadata(params, "now", "/now");
}

export default async function NowPage({ params }: PageProps<"/[lang]/now">) {
  const { lang } = await params;
  if (!hasLocale(lang)) notFound();
  // the app reads live data from the shell's SiteData; the page sends only its strings
  return (
    <I18nScope dict={getNamespaces(lang, "now")}>
      <NowApp />
    </I18nScope>
  );
}
