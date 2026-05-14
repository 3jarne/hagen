// Hageplan v0.6 — Klient mot osm-buildings-lookup Edge Function.
//
// Henter bygningsomriss fra OpenStreetMap (via Overpass API server-side)
// innenfor en gitt eiendomsgrense. Konverterer hver bygning til et
// "Bygning"-hage-element som lagres i drawings-tabellen ved første
// prosjekt-opprettelse.

import type { Feature, Polygon } from "geojson"
import { supabase } from "@/lib/supabase"
import { GARDEN_ELEMENTS } from "@/lib/garden-types"

export interface OsmBuilding {
  geometry: Polygon
  osm_id: number
  osm_version: number
}

export class OsmBuildingsError extends Error {
  status: number
  constructor(message: string, status: number) {
    super(message)
    this.name = "OsmBuildingsError"
    this.status = status
  }
}

export async function fetchOsmBuildings(
  boundary: Feature<Polygon>,
): Promise<OsmBuilding[]> {
  const { data, error } = await supabase.functions.invoke(
    "osm-buildings-lookup",
    { body: { boundary } },
  )
  if (error) {
    const status =
      (error as { context?: { status?: number } }).context?.status ?? 500
    let message = error.message ?? "Ukjent feil fra osm-buildings-lookup"
    const ctxResponse = (error as { context?: { response?: Response } })
      .context?.response
    if (ctxResponse) {
      try {
        const body = await ctxResponse.clone().json()
        if (body && typeof body.error === "string") message = body.error
      } catch {
        // ignorer parse-feil
      }
    }
    throw new OsmBuildingsError(message, status)
  }
  if (!data || typeof data !== "object") {
    throw new OsmBuildingsError("Tomt svar fra osm-buildings-lookup", 500)
  }
  const result = data as { buildings?: OsmBuilding[] }
  return result.buildings ?? []
}

/**
 * Konverter en OSM-bygning til en "Bygning"-feature i samme format som
 * brukerens egne tegninger. Feature lagres i drawings.draw_features.
 *
 * source/osmId/osmVersion er kun for fremtidig referanse — UI-en behandler
 * disse som vanlige bygninger.
 */
export function osmBuildingToFeature(b: OsmBuilding): Feature<Polygon> {
  const el = GARDEN_ELEMENTS.bygning
  return {
    type: "Feature",
    id: makeFeatureId(),
    geometry: b.geometry,
    properties: {
      featureType: "garden",
      hagenType: "bygning",
      fillColor: el.style.fillColor,
      fillOpacity: el.style.fillOpacity,
      strokeColor: el.style.strokeColor,
      strokeWidth: el.style.strokeWidth,
      gardenProps: {},
      source: "osm",
      osmId: b.osm_id,
      osmVersion: b.osm_version,
    },
  }
}

function makeFeatureId(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID()
  }
  return `osm-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`
}
