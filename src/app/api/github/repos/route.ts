import { NextResponse } from "next/server";
import { getRepos } from "@/lib/github";

export const revalidate = 600;

export async function GET() {
  const repos = await getRepos();
  if (!repos) {
    return NextResponse.json({ error: "github unreachable" }, { status: 502 });
  }
  return NextResponse.json(
    { repos },
    { headers: { "Cache-Control": "public, s-maxage=600, stale-while-revalidate=300" } }
  );
}
