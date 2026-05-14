// Hageplan v0.6 — Edge Function: osm-buildings-lookup (Fase 0)
//
// Henter bygninger fra OpenStreetMap via Overpass API innenfor en gitt
// eiendomsgrense (GeoJSON Polygon). I Fase 0 returneres dummy-data
// (én rektangel-bygning nær sentroiden av grensen) slik at frontend-
// flyten kan testes før Overpass-integrasjonen er på plass.
//
// Endpoint:
//   POST /osm-buildings-lookup
//   Body: { boundary: Feature<Polygon> }
//   Response: { buildings: [{ geometry: Polygon, osm_id, osm_version }, ...] }

// deno-lint-ignore-file no-explicit-any
// @ts-nocheck — kjøres i Deno-miljø.

interface LookupRequest {
  boundary?: {
    type?: string
    geometry?: {
      type?: string
      coordinates?: number[][][]
    }
  }
}

const CORS_HEADERS: Record<string, string> = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
}

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "content-type": "application/json; charset=utf-8",
      ...CORS_HEADERS,
    },
  })
}

function errorResponse(message: string, status: number): Response {
  return jsonResponse({ error: message }, status)
}

// ----------------------------------------------------------------------
// Dummy-bygning (fase 0)
// ----------------------------------------------------------------------

const EARTH_RADIUS_METERS = 6_371_000

function offsetMeters(
  lng: number,
  lat: number,
  dxMeters: number,
  dyMeters: number,
): [number, number] {
  const latRad = (lat * Math.PI) / 180
  const dLat = ((dyMeters / EARTH_RADIUS_METERS) * 180) / Math.PI
  const dLng =
    ((dxMeters / (EARTH_RADIUS_METERS * Math.cos(latRad))) * 180) / Math.PI
  return [lng + dLng, lat + dLat]
}

function rectanglePolygon(
  centerLng: number,
  centerLat: number,
  halfWidthM: number,
  halfHeightM: number,
): number[][][] {
  const sw = offsetMeters(centerLng, centerLat, -halfWidthM, -halfHeightM)
  const se = offsetMeters(centerLng, centerLat, halfWidthM, -halfHeightM)
  const ne = offsetMeters(centerLng, centerLat, halfWidthM, halfHeightM)
  const nw = offsetMeters(centerLng, centerLat, -halfWidthM, halfHeightM)
  return [[sw, se, ne, nw, sw]]
}

function boundaryCentroid(boundary: LookupRequest["boundary"]): [number, number] | null {
  const coords = boundary?.geometry?.coordinates?.[0]
  if (!coords || coords.length === 0) return null
  let lngSum = 0
  let latSum = 0
  let n = 0
  for (const c of coords) {
    if (Array.isArray(c) && c.length >= 2) {
      lngSum += Number(c[0])
      latSum += Number(c[1])
      n++
    }
  }
  if (n === 0) return null
  return [lngSum / n, latSum / n]
}

// ----------------------------------------------------------------------
// Request handler
// ----------------------------------------------------------------------

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: CORS_HEADERS })
  }
  if (req.method !== "POST") {
    return errorResponse("Method not allowed", 405)
  }

  let body: LookupRequest
  try {
    body = await req.json()
  } catch {
    return errorResponse("Forventet JSON-body", 400)
  }

  const centroid = boundaryCentroid(body.boundary)
  if (!centroid) {
    return errorResponse("Ugyldig boundary — mangler koordinater", 400)
  }

  // Fase 0: én dummy-bygning (~8m × 12m) i sentroiden, slik at vi kan
  // verifisere end-to-end-flyten før Overpass-integrasjonen kommer.
  const [lng, lat] = centroid
  const buildings = [
    {
      geometry: {
        type: "Polygon",
        coordinates: rectanglePolygon(lng, lat, 4, 6),
      },
      osm_id: 0,
      osm_version: 0,
    },
  ]

  return jsonResponse({ buildings })
})
