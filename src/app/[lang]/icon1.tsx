import { tileIcon } from "@/lib/og";

// Android / manifest home-screen size (also listed in the manifest)
export const size = { width: 192, height: 192 };
export const contentType = "image/png";

export default function Icon() {
  return tileIcon(size.width);
}
