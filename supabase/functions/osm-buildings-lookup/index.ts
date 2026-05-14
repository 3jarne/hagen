// Hageplan v0.6 — Edge Function: osm-buildings-lookup (Fase 1)
//
// Henter bygningsomriss fra OpenStreetMap via Overpass API innenfor en
// gitt eiendomsgrense (GeoJSON Polygon).
//
// Endpoint:
//   POST /osm-buildings-lookup
//   Body: { boundary: Feature<Polygon> }
//   Response: { buildings: [{ geometry: Polygon, osm_id, osm_version }, ...] }
//
// Overpass QL-query: hent alle ways (og enkle relations) med tag
// building=* innenfor det gitte polygonet. Vi returnerer geometri i
// EPSG:4326 — samme som OSM bruker — så ingen reprojisering.

// deno-lint-ignore-file no-explicit-any
// @ts-nocheck — kjøres i Deno-miljø.

const OVERPASS_ENDPOINTS = [
  "https://overpass-api.de/api/interpreter",
  "https://overpass.kumi.systems/api/interpreter",
]
const OVERPASS_TIMEOUT_MS = 20_000

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
// Overpass QL — bygg poly-filter fra GeoJSON Polygon
// ----------------------------------------------------------------------

interface BoundaryGeom {
  type?: string
  coordinates?: number[][][]
}

function extractOuterRing(g: BoundaryGeom): number[][] | null {
  if (!g || !g.coordinates) return null
  if (g.type === "Polygon") return g.coordinates[0] ?? null
  if (g.type === "MultiPolygon") {
    // Bruk den største ytre ringen
    const polys = g.coordinates as unknown as number[][][][]
    let best: number[][] | null = null
    let bestLen = 0
    for (const p of polys) {
      const ring = p?.[0]
      if (ring && ring.length > bestLen) {
        best = ring
        bestLen = ring.length
      }
    }
    return best
  }
  return null
}

// OSM poly-filter forventer "lat lng lat lng ..." (motsatt rekkefølge
// av GeoJSON som er [lng, lat]).
function buildPolyFilter(ring: number[][]): string {
  const parts: string[] = []
  for (const c of ring) {
    if (Array.isArray(c) && c.length >= 2) {
      const lng = Number(c[0])
      const lat = Number(c[1])
      if (Number.isFinite(lat) && Number.isFinite(lng)) {
        // 6 desimaler ≈ 0.1m presisjon — tilstrekkelig for poly-filter.
        parts.push(`${lat.toFixed(6)} ${lng.toFixed(6)}`)
      }
    }
  }
  return parts.join(" ")
}

function buildOverpassQuery(polyFilter: string): string {
  // Hent ways med building=* innenfor polygonet. `out geom;` returnerer
  // geometri direkte som lat/lon-liste. Relations utelates i Fase 1 —
  // de fleste norske husholdninger har bygninger som enkle ways.
  return `[out:json][timeout:18];
way["building"](poly:"${polyFilter}");
out geom;`
}

// ----------------------------------------------------------------------
// Overpass-kall med fallback
// ----------------------------------------------------------------------

async function callOverpass(query: string): Promise<any> {
  let lastError: unknown = null
  for (const endpoint of OVERPASS_ENDPOINTS) {
    const ctrl = new AbortController()
    const timeoutId = setTimeout(() => ctrl.abort(), OVERPASS_TIMEOUT_MS)
    try {
      console.log(`[osm-buildings] kaller ${endpoint}`)
      const res = await fetch(endpoint, {
        method: "POST",
        headers: {
          "Content-Type": "application/x-www-form-urlencoded",
          "User-Agent": "hageplan/0.6 (https://3jarne.github.io/hagen/)",
        },
        body: `data=${encodeURIComponent(query)}`,
        signal: ctrl.signal,
      })
      clearTimeout(timeoutId)
      if (!res.ok) {
        const body = await res.text()
        console.warn(
          `[osm-buildings] ${endpoint} HTTP ${res.status}: ${body.slice(0, 300)}`,
        )
        lastError = new Error(`HTTP ${res.status}`)
        continue
      }
      const json = await res.json()
      return json
    } catch (err: any) {
      clearTimeout(timeoutId)
      lastError = err
      console.warn(
        `[osm-buildings] ${endpoint} feilet: ${err?.message ?? err}`,
      )
    }
  }
  throw lastError ?? new Error("Alle Overpass-endepunkter feilet")
}

// ----------------------------------------------------------------------
// Respons-parsing → GeoJSON Polygon
// ----------------------------------------------------------------------

interface OsmWay {
  type: "way"
  id: number
  version?: number
  geometry?: Array<{ lat: number; lon: number }>
  tags?: Record<string, string>
}

function wayToPolygon(way: OsmWay): {
  geometry: { type: "Polygon"; coordinates: number[][][] }
  osm_id: number
  osm_version: number
} | null {
  const geom = way.geometry
  if (!Array.isArray(geom) || geom.length < 3) return null

  const ring: number[][] = []
  for (const node of geom) {
    if (
      node &&
      Number.isFinite(node.lat) &&
      Number.isFinite(node.lon)
    ) {
      ring.push([node.lon, node.lat])
    }
  }
  if (ring.length < 3) return null

  // Lukk ringen hvis ikke allerede lukket.
  const first = ring[0]
  const last = ring[ring.length - 1]
  if (first[0] !== last[0] || first[1] !== last[1]) ring.push(first)

  return {
    geometry: { type: "Polygon", coordinates: [ring] },
    osm_id: way.id,
    osm_version: way.version ?? 0,
  }
}

// ----------------------------------------------------------------------
// Request handler
// ----------------------------------------------------------------------

interface LookupRequest {
  boundary?: { geometry?: BoundaryGeom }
}

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

  const ring = extractOuterRing(body.boundary?.geometry as BoundaryGeom)
  if (!ring || ring.length < 3) {
    return errorResponse("Ugyldig boundary — mangler ytre ring", 400)
  }

  const polyFilter = buildPolyFilter(ring)
  if (!polyFilter) {
    return errorResponse("Klarte ikke å bygge poly-filter", 400)
  }
  const query = buildOverpassQuery(polyFilter)
  console.log(
    `[osm-buildings] query (${ring.length} punkter):`,
    query.slice(0, 500),
  )

  let osm: any
  try {
    osm = await callOverpass(query)
  } catch (err: any) {
    console.error("[osm-buildings] alle endepunkter feilet:", err)
    return errorResponse(
      `Overpass utilgjengelig: ${err?.message ?? err}`,
      502,
    )
  }

  const elements: OsmWay[] = Array.isArray(osm?.elements) ? osm.elements : []
  console.log(`[osm-buildings] Overpass returnerte ${elements.length} elementer`)

  const buildings: ReturnType<typeof wayToPolygon>[] = []
  for (const el of elements) {
    if (el.type !== "way") continue
    const poly = wayToPolygon(el)
    if (poly) buildings.push(poly)
  }
  console.log(
    `[osm-buildings] ${buildings.length} bygninger konvertert til GeoJSON`,
  )

  return jsonResponse({ buildings })
})
