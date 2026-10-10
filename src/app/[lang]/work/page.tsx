import { notFound } from "next/navigation";
import { hasLocale } from "@/i18n";
import { appMetadata } from "@/i18n/metadata";
import { getSiteData } from "@/lib/data";
import { ProjectsApp } from "@/components/apps/work/ProjectsApp";

export const revalidate = 300;

export function generateMetadata({ params }: PageProps<"/[lang]/work">) {
  return appMetadata(params, "work", "/work");
}

export default async function WorkPage({ params }: PageProps<"/[lang]/work">) {
  const { lang } = await params;
  if (!hasLocale(lang)) notFound();
  const data = await getSiteData();
  return <ProjectsApp data={data} />;
}
