import { notFound } from "next/navigation";
import { hasLocale } from "@/i18n";
import { getSiteData } from "@/lib/data";
import { Desktop } from "@/components/apps/home/Desktop";

export const revalidate = 300;

export default async function HomePage({ params }: PageProps<"/[lang]">) {
  const { lang } = await params;
  if (!hasLocale(lang)) notFound();
  const data = await getSiteData();
  return <Desktop data={data} />;
}
