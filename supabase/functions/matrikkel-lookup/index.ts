// Hageplan v0.5 — Edge Function: matrikkel-lookup
//
// Tar imot kommunenummer/GNR/BNR og returnerer eiendomsgrense og
// bygninger som GeoJSON i EPSG:4326.
//
// Fase 0: returnerer dummy-data slik at frontend-flyten kan testes
// før SOAP-integrasjonen er på plass. Fase 1 bytter denne ut med ekte
// kall til Kartverkets matrikkel-API (MatrikkelenhetService, TeigService,
// BygningService) via Basic Auth.
//
// Miljøvariabler (settes som secrets i Supabase Edge Function Settings):
//   KARTVERKET_API_USERNAME
//   KARTVERKET_API_PASSWORD
//   KARTVERKET_API_URL  (f.eks. https://prodtest.matrikkel.no/matrikkelapi/wsapi/v1/)

// deno-lint-ignore-file no-explicit-any
// @ts-nocheck — kjøres i Deno-miljø, ikke i prosjektets TS-kontekst.

interface LookupRequest {
  kommunenummer?: string
  gardsnummer?: number | string
  bruksnummer?: number | string
  // Valgfritt — brukes kun av dummy-implementasjonen for å plassere
  // dummy-polygonene rundt det riktige punktet. Fjernes i fase 1.
  center_lng?: number
  center_lat?: number
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
// Dummy GeoJSON-generator (fase 0)
// ----------------------------------------------------------------------
// Returnerer en ~40m x 40m firkant rundt center som "eiendomsgrense" og
// en ~10m x 10m firkant litt nord-vest som "bygning". Dette gir oss noe
// synlig å rendre uten å være avhengig av Kartverket-integrasjonen.

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
  halfWidthMeters: number,
  halfHeightMeters: number,
): number[][][] {
  const sw = offsetMeters(centerLng, centerLat, -halfWidthMeters, -halfHeightMeters)
  const se = offsetMeters(centerLng, centerLat, halfWidthMeters, -halfHeightMeters)
  const ne = offsetMeters(centerLng, centerLat, halfWidthMeters, halfHeightMeters)
  const nw = offsetMeters(centerLng, centerLat, -halfWidthMeters, halfHeightMeters)
  return [[sw, se, ne, nw, sw]]
}

function buildDummyResponse(centerLng: number, centerLat: number): {
  boundary: any
  buildings: any
} {
  const boundary = {
    type: "Feature",
    properties: { source: "dummy" },
    geometry: {
      type: "Polygon",
      coordinates: rectanglePolygon(centerLng, centerLat, 20, 20),
    },
  }

  const buildingCenter = offsetMeters(centerLng, centerLat, -6, 4)
  const buildings = {
    type: "FeatureCollection",
    features: [
      {
        type: "Feature",
        properties: { source: "dummy" },
        geometry: {
          type: "Polygon",
          coordinates: rectanglePolygon(
            buildingCenter[0],
            buildingCenter[1],
            5,
            5,
          ),
        },
      },
    ],
  }

  return { boundary, buildings }
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

  const kommunenummer = String(body.kommunenummer ?? "").trim()
  const gnr = Number(body.gardsnummer)
  const bnr = Number(body.bruksnummer)

  if (!kommunenummer || !Number.isFinite(gnr) || !Number.isFinite(bnr)) {
    return errorResponse(
      "Mangler kommunenummer, gardsnummer eller bruksnummer",
      400,
    )
  }

  // Sjekk at miljøvariabler er satt — failer tydelig hvis de mangler.
  // I fase 0 brukes de ikke ennå, men vi vil vite at de er konfigurert
  // før vi går videre til fase 1.
  const username = Deno.env.get("KARTVERKET_API_USERNAME")
  const password = Deno.env.get("KARTVERKET_API_PASSWORD")
  const apiUrl = Deno.env.get("KARTVERKET_API_URL")
  if (!username || !password || !apiUrl) {
    return errorResponse(
      "Kartverket-API er ikke konfigurert (mangler secrets)",
      503,
    )
  }

  // Fase 0: dummy-data. Trenger center for å plassere polygonet et
  // synlig sted; faller tilbake til Oslo sentrum hvis ikke oppgitt.
  const centerLng =
    typeof body.center_lng === "number" ? body.center_lng : 10.7522
  const centerLat =
    typeof body.center_lat === "number" ? body.center_lat : 59.9139

  const { boundary, buildings } = buildDummyResponse(centerLng, centerLat)

  return jsonResponse({ boundary, buildings })
})
