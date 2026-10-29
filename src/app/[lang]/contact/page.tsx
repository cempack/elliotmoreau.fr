import { notFound } from "next/navigation";
import { getNamespaces, hasLocale } from "@/i18n";
import { I18nScope } from "@/i18n/client";
import { appMetadata } from "@/i18n/metadata";
import { MailApp } from "@/components/apps/contact/MailApp";
import { env, smtpReady, turnstileReady } from "@/server/env";

export const revalidate = 300;

export function generateMetadata({ params }: PageProps<"/[lang]/contact">) {
  return appMetadata(params, "contact", "/contact");
}

export default async function ContactPage({ params }: PageProps<"/[lang]/contact">) {
  const { lang } = await params;
  if (!hasLocale(lang)) notFound();
  // the app reads live data from the shell's SiteData; the page sends only its strings, and
  // whether the server can send mail (otherwise Send goes through the visitor's mail app), and the
  // Turnstile site key when Send is checked (read at run time: the boot re-render picks up Coolify's value)
  return (
    <I18nScope dict={getNamespaces(lang, "contact")}>
      <MailApp mailReady={smtpReady()} turnstileKey={turnstileReady() ? env.turnstile.siteKey : undefined} />
    </I18nScope>
  );
}
