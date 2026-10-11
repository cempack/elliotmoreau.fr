import { tileIcon } from "@/lib/og";

// splash / store size, maskable-safe (listed in the manifest)
export const size = { width: 512, height: 512 };
export const contentType = "image/png";

export default function Icon() {
  return tileIcon(size.width);
}
