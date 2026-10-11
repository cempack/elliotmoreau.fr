import { notFound } from "next/navigation";
import { getNamespaces, hasLocale } from "@/i18n";
import { I18nScope } from "@/i18n/client";
import { appMetadata } from "@/i18n/metadata";
import { WritingApp } from "@/components/apps/writing/WritingApp";

export const revalidate = 300;

export function generateMetadata({ params }: PageProps<"/[lang]/writing">) {
  return appMetadata(params, "writing", "/writing");
}

export default async function WritingPage({ params }: PageProps<"/[lang]/writing">) {
  const { lang } = await params;
  if (!hasLocale(lang)) notFound();
  // the app reads live data from the shell's SiteData; the page sends only its strings
  return (
    <I18nScope dict={getNamespaces(lang, "writing")}>
      <WritingApp />
    </I18nScope>
  );
}
