import { hasLocale } from "@/i18n";
import { OG_SIZE, appCard, cardAlt } from "@/lib/og";

export function generateImageMetadata({ params }: { params: { lang: string } }) {
  const lang = hasLocale(params.lang) ? params.lang : "en";
  return [{ id: "card", alt: cardAlt(lang, "work"), size: OG_SIZE, contentType: "image/png" }];
}

export default async function Image({ params }: { params: Promise<{ lang: string }> }) {
  const { lang } = await params;
  return appCard(hasLocale(lang) ? lang : "en", "work");
}
