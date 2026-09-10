import { NextResponse } from "next/server";
import { getActivity } from "@/lib/github";

export const revalidate = 300;

export async function GET() {
  const activity = await getActivity();
  if (!activity) return NextResponse.json({ disabled: true });
  return NextResponse.json(activity, {
    headers: { "Cache-Control": "public, s-maxage=300, stale-while-revalidate=120" },
  });
}
