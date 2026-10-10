import { notFound } from "next/navigation";
import { hasLocale } from "@/i18n";
import { appMetadata } from "@/i18n/metadata";
import { getSiteData } from "@/lib/data";
import { NowApp } from "@/components/apps/now/NowApp";

export const revalidate = 300;

export function generateMetadata({ params }: PageProps<"/[lang]/now">) {
  return appMetadata(params, "now", "/now");
}

export default async function NowPage({ params }: PageProps<"/[lang]/now">) {
  const { lang } = await params;
  if (!hasLocale(lang)) notFound();
  const data = await getSiteData();
  return <NowApp data={data} />;
}
