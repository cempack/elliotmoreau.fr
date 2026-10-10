import { notFound } from "next/navigation";
import { hasLocale } from "@/i18n";
import { appMetadata } from "@/i18n/metadata";
import { getSiteData } from "@/lib/data";
import { AtlasApp } from "@/components/apps/atlas/AtlasApp";

export const revalidate = 300;

export function generateMetadata({ params }: PageProps<"/[lang]/atlas">) {
  return appMetadata(params, "atlas", "/atlas");
}

export default async function AtlasPage({ params }: PageProps<"/[lang]/atlas">) {
  const { lang } = await params;
  if (!hasLocale(lang)) notFound();
  const data = await getSiteData();
  return <AtlasApp data={data} />;
}
