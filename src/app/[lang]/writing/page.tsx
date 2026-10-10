import { notFound } from "next/navigation";
import { hasLocale } from "@/i18n";
import { appMetadata } from "@/i18n/metadata";
import { getSiteData } from "@/lib/data";
import { WritingApp } from "@/components/apps/writing/WritingApp";

export const revalidate = 300;

export function generateMetadata({ params }: PageProps<"/[lang]/writing">) {
  return appMetadata(params, "writing", "/writing");
}

export default async function WritingPage({ params }: PageProps<"/[lang]/writing">) {
  const { lang } = await params;
  if (!hasLocale(lang)) notFound();
  const data = await getSiteData();
  return <WritingApp data={data} />;
}
