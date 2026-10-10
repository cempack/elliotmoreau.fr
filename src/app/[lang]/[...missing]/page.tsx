import { notFound } from "next/navigation";

// any unknown path inside a locale renders [lang]/not-found.tsx
export default function Missing() {
  notFound();
}
