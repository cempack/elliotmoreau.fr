import { getPlaces } from "@/server/content";
import { reliefOf } from "@/server/relief";

/**
 * GET /api/relief?place=<id>: the place's land as a heightmap, for the
 * relief block in the Atlas card (src/server/relief). Only for places on
 * the list; baked on first ask and kept, so it can be cached for a day.
 */
export async function GET(req: Request) {
  const id = new URL(req.url).searchParams.get("place") ?? "";
  const place = getPlaces().find((p) => p.id === id);
  if (!place) return Response.json({ error: "notfound" }, { status: 404 });
  const relief = await reliefOf(place.iso, place.lat, place.lon);
  if (!relief) return Response.json({ error: "unavailable" }, { status: 503 });
  return Response.json({ relief }, { headers: { "Cache-Control": "public, max-age=86400" } });
}
