import { notFound } from "next/navigation";
import { getNamespaces, hasLocale } from "@/i18n";
import { I18nScope } from "@/i18n/client";
import { appMetadata } from "@/i18n/metadata";
import { MailApp } from "@/components/apps/contact/MailApp";

export const revalidate = 300;

export function generateMetadata({ params }: PageProps<"/[lang]/contact">) {
  return appMetadata(params, "contact", "/contact");
}

export default async function ContactPage({ params }: PageProps<"/[lang]/contact">) {
  const { lang } = await params;
  if (!hasLocale(lang)) notFound();
  // the app reads live data from the shell's SiteData; the page sends only its strings
  return (
    <I18nScope dict={getNamespaces(lang, "contact")}>
      <MailApp />
    </I18nScope>
  );
}
