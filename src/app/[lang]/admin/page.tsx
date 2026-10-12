import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getNamespaces, hasLocale } from "@/i18n";
import { I18nScope } from "@/i18n/client";
import { AdminApp } from "@/components/apps/admin/AdminApp";

// the same static shell for everyone: what's behind the lock is fetched
// after a passkey unlocks it, so no admin data is ever in this HTML
export const metadata: Metadata = {
  title: "Admin",
  robots: { index: false, follow: false, nocache: true, googleBot: { index: false, follow: false } },
  alternates: { canonical: null, languages: {} },
};

export default async function AdminPage({ params }: PageProps<"/[lang]/admin">) {
  const { lang } = await params;
  if (!hasLocale(lang)) notFound();
  return (
    <I18nScope dict={getNamespaces(lang, "admin")}>
      <AdminApp />
    </I18nScope>
  );
}
