#!/usr/bin/env python3
"""
Writes src/server/relief/borders.ts: every country's outline for the Atlas
relief, from Natural Earth's 1:50m admin-0 countries (public domain),
simplified to about a kilometre (Douglas-Peucker, 0.01°) and stored in
hundredths of a degree, each point a step from the one before.

    python3 scripts/relief-borders.py
"""
import json, math, os, urllib.request

SRC = "https://raw.githubusercontent.com/nvkelso/natural-earth-vector/v5.1.2/geojson/ne_50m_admin_0_countries.geojson"
OUT = os.path.join(os.path.dirname(__file__), "..", "src", "server", "relief", "borders.ts")
EPS = 0.01


def rdp(pts, eps):
    if len(pts) < 3:
        return pts
    a, b = pts[0], pts[-1]
    dx, dy = b[0] - a[0], b[1] - a[1]
    L = math.hypot(dx, dy)
    imax, dmax = 0, -1.0
    for i in range(1, len(pts) - 1):
        p = pts[i]
        d = math.hypot(p[0] - a[0], p[1] - a[1]) if L == 0 else abs(dy * p[0] - dx * p[1] + b[0] * a[1] - b[1] * a[0]) / L
        if d > dmax:
            imax, dmax = i, d
    if dmax > eps:
        return rdp(pts[: imax + 1], eps)[:-1] + rdp(pts[imax:], eps)
    return [a, b]


def ring(r):
    # a closed ring, simplified in two halves so its ends stay put
    if len(r) >= 8:
        h = len(r) // 2
        r = rdp(r[: h + 1], EPS)[:-1] + rdp(r[h:], EPS)
    flat, px, py = [], 0, 0
    for x, y in r:
        X, Y = round(x * 100), round(y * 100)
        flat += [X - px, Y - py]
        px, py = X, Y
    return flat if len(r) >= 4 else None


geo = json.load(urllib.request.urlopen(SRC))
out = {}
for f in geo["features"]:
    p = f["properties"]
    iso = p.get("ISO_A2_EH") if p.get("ISO_A2_EH") not in (None, "-99") else p.get("ISO_A2")
    if not iso or iso == "-99":
        continue
    g = f["geometry"]
    for poly in g["coordinates"] if g["type"] == "MultiPolygon" else [g["coordinates"]]:
        rings = [x for x in (ring(r) for r in poly) if x]
        if rings:
            out.setdefault(iso, []).append(rings)

body = json.dumps(out, separators=(",", ":"))
with open(OUT, "w") as fh:
    fh.write(
        "/**\n"
        " * Every country's outline, for the Atlas relief: Natural Earth's 1:50m\n"
        " * admin-0 countries (public domain, https://www.naturalearthdata.com),\n"
        " * simplified to about a kilometre. JSON, keyed by ISO 3166-1 alpha-2: a\n"
        " * country is a list of polygons, a polygon a list of rings (the outline\n"
        " * first, then its holes), a ring [lon, lat, lon, lat, …] in hundredths of a\n"
        " * degree, each pair after the first a step from the one before.\n"
        " *\n"
        " * A string, not an object, so TypeScript doesn't have to read it.\n"
        " * Regenerate with scripts/relief-borders.py.\n"
        " */\n"
        "export const BORDERS =\n  '" + body + "';\n"
    )
print(f"{len(out)} countries, {len(body) // 1024} KB")
