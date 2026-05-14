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
const OVERPASS_TIMEOUT_MS = 25_000

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

interface Bbox {
  minLat: number
  minLng: number
  maxLat: number
  maxLng: number
}

function computeBbox(ring: number[][]): Bbox | null {
  let minLng = Infinity
  let minLat = Infinity
  let maxLng = -Infinity
  let maxLat = -Infinity
  for (const c of ring) {
    if (Array.isArray(c) && c.length >= 2) {
      const lng = Number(c[0])
      const lat = Number(c[1])
      if (Number.isFinite(lat) && Number.isFinite(lng)) {
        if (lng < minLng) minLng = lng
        if (lng > maxLng) maxLng = lng
        if (lat < minLat) minLat = lat
        if (lat > maxLat) maxLat = lat
      }
    }
  }
  if (!Number.isFinite(minLng) || !Number.isFinite(minLat)) return null
  return { minLat, minLng, maxLat, maxLng }
}

function buildOverpassQuery(bbox: Bbox): string {
  // bbox-filter er mye raskere på Overpass enn poly:-filter. Vi henter
  // alle bygninger i bbox og post-filtrerer på centroid-i-polygon i denne
  // Edge Function. Out-format `geom` returnerer geometri inline.
  // Relations utelates i Fase 1.
  const { minLat, minLng, maxLat, maxLng } = bbox
  return `[out:json][timeout:20];
way["building"](${minLat.toFixed(6)},${minLng.toFixed(6)},${maxLat.toFixed(6)},${maxLng.toFixed(6)});
out geom;`
}

/** Ray-casting: er punktet inni ringen? */
function pointInRing(point: [number, number], ring: number[][]): boolean {
  const [x, y] = point
  let inside = false
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const xi = ring[i][0]
    const yi = ring[i][1]
    const xj = ring[j][0]
    const yj = ring[j][1]
    const intersect =
      yi > y !== yj > y &&
      x < ((xj - xi) * (y - yi)) / (yj - yi + 1e-12) + xi
    if (intersect) inside = !inside
  }
  return inside
}

/** Sentroid (gjennomsnitt) av en polygon-ring. Lukke-punktet ekskluderes. */
function ringCentroid(ring: number[][]): [number, number] {
  let sx = 0
  let sy = 0
  // Hopp over siste punkt hvis det er en lukke-duplikat.
  const last = ring.length - 1
  const skipLast =
    ring.length > 1 &&
    ring[0][0] === ring[last][0] &&
    ring[0][1] === ring[last][1]
  const n = skipLast ? ring.length - 1 : ring.length
  for (let i = 0; i < n; i++) {
    sx += ring[i][0]
    sy += ring[i][1]
  }
  return [sx / n, sy / n]
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

  const bbox = computeBbox(ring)
  if (!bbox) {
    return errorResponse("Klarte ikke å beregne bbox fra grensen", 400)
  }
  const query = buildOverpassQuery(bbox)
  console.log(
    `[osm-buildings] bbox-query for ${ring.length}-punkts polygon:`,
    query.replace(/\n/g, " "),
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
  console.log(`[osm-buildings] Overpass returnerte ${elements.length} elementer i bbox`)

  // Post-filter: bare behold bygninger der sentroiden ligger inni
  // eiendomsgrensens ytre ring. bbox-queryen tar med ekstra bygninger
  // utenfor eiendommen som vi må filtrere vekk.
  const buildings: ReturnType<typeof wayToPolygon>[] = []
  for (const el of elements) {
    if (el.type !== "way") continue
    const poly = wayToPolygon(el)
    if (!poly) continue
    const centroid = ringCentroid(poly.geometry.coordinates[0])
    if (!pointInRing(centroid, ring)) continue
    buildings.push(poly)
  }
  console.log(
    `[osm-buildings] ${buildings.length} bygninger innenfor eiendomsgrensen etter sentroide-filter`,
  )

  return jsonResponse({ buildings })
})
