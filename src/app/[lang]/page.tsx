import { notFound } from "next/navigation";
import { getNamespaces, hasLocale } from "@/i18n";
import { I18nScope } from "@/i18n/client";
import { getSiteData } from "@/lib/data";
import { Desktop } from "@/components/apps/home/Desktop";
import { PersonJsonLd } from "@/components/apps/notfound/JsonLd";

export const revalidate = 300;

export default async function HomePage({ params }: PageProps<"/[lang]">) {
  const { lang } = await params;
  if (!hasLocale(lang)) notFound();
  // only the Desktop's brick wall reads pushes, so they ride on this page alone
  const { pushes } = await getSiteData();
  return (
    <>
      <PersonJsonLd lang={lang} />
      <I18nScope dict={getNamespaces(lang, "home")}>
        <Desktop pushes={pushes} />
      </I18nScope>
    </>
  );
}
