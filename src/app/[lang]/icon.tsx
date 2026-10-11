import { LOCALES } from "@/i18n/config";
import { markIcon } from "@/lib/og";

// Lives under [lang], not app/: the locale proxy rewrites extension-less
// paths like /icon to /en/icon, so that's where the file has to be.
// Prerendered once per locale (it's the same pixels either way).
export const size = { width: 32, height: 32 };
export const contentType = "image/png";
export const dynamic = "force-static";
export function generateStaticParams() {
  return LOCALES.map((lang) => ({ lang }));
}

export default function Icon() {
  return markIcon(size.width);
}
