import { LOCALES } from "@/i18n/config";
import { tileIcon } from "@/lib/og";

// iOS rounds the corners itself: the lime field goes edge to edge
export const size = { width: 180, height: 180 };
export const contentType = "image/png";
export const dynamic = "force-static";
export function generateStaticParams() {
  return LOCALES.map((lang) => ({ lang }));
}

export default function AppleIcon() {
  return tileIcon(size.width);
}
