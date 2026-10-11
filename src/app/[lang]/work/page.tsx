import { notFound } from "next/navigation";
import { getNamespaces, hasLocale } from "@/i18n";
import { I18nScope } from "@/i18n/client";
import { appMetadata } from "@/i18n/metadata";
import { ProjectsApp } from "@/components/apps/work/ProjectsApp";

export const revalidate = 300;

export function generateMetadata({ params }: PageProps<"/[lang]/work">) {
  return appMetadata(params, "work", "/work");
}

export default async function WorkPage({ params }: PageProps<"/[lang]/work">) {
  const { lang } = await params;
  if (!hasLocale(lang)) notFound();
  // the app reads live data from the shell's SiteData; the page sends only its strings
  return (
    <I18nScope dict={getNamespaces(lang, "work")}>
      <ProjectsApp />
    </I18nScope>
  );
}
