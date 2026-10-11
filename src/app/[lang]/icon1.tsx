import { LOCALES } from "@/i18n/config";
import { tileIcon } from "@/lib/og";

// Android / manifest home-screen size (also listed in the manifest)
export const size = { width: 192, height: 192 };
export const contentType = "image/png";
export const dynamic = "force-static";
export function generateStaticParams() {
  return LOCALES.map((lang) => ({ lang }));
}

export default function Icon() {
  return tileIcon(size.width);
}
