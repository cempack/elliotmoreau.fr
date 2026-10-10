import { notFound } from "next/navigation";
import { hasLocale } from "@/i18n";
import { appMetadata } from "@/i18n/metadata";
import { getSiteData } from "@/lib/data";
import { MailApp } from "@/components/apps/contact/MailApp";

export const revalidate = 300;

export function generateMetadata({ params }: PageProps<"/[lang]/contact">) {
  return appMetadata(params, "contact", "/contact");
}

export default async function ContactPage({ params }: PageProps<"/[lang]/contact">) {
  const { lang } = await params;
  if (!hasLocale(lang)) notFound();
  const data = await getSiteData();
  return <MailApp data={data} />;
}
