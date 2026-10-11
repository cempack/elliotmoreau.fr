import { markIcon } from "@/lib/og";

// Lives under [lang], not app/: the locale proxy rewrites extension-less
// paths like /icon to /en/icon, so that's where the file has to be.
export const size = { width: 32, height: 32 };
export const contentType = "image/png";

export default function Icon() {
  return markIcon(size.width);
}
