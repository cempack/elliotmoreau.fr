import { LOCALES } from "@/i18n/config";
import { tileIcon } from "@/lib/og";

// splash / store size; the letter stays inside the maskable safe circle,
// so the manifest lists it as both `any` and `maskable`
export const size = { width: 512, height: 512 };
export const contentType = "image/png";
export const dynamic = "force-static";
export function generateStaticParams() {
  return LOCALES.map((lang) => ({ lang }));
}

export default function Icon() {
  return tileIcon(size.width, 0.52);
}
