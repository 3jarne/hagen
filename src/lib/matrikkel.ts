// Hageplan v0.5 — Klient mot matrikkel-lookup Edge Function.
//
// Edge Function ligger i supabase/functions/matrikkel-lookup og kaller
// Kartverkets SOAP-API server-side. Frontend ser kun ferdig GeoJSON.

import type { Feature, FeatureCollection, Polygon } from "geojson"
import { supabase } from "@/lib/supabase"

export interface MatrikkelLookupInput {
  kommunenummer: string
  gardsnummer: number
  bruksnummer: number
  /** Brukes av dummy-implementasjonen i fase 0 for å plassere
   *  polygonene rundt riktig punkt. Fjernes i fase 1. */
  center_lng?: number
  center_lat?: number
}

export interface MatrikkelLookupResult {
  boundary: Feature<Polygon>
  buildings: FeatureCollection
}

export class MatrikkelError extends Error {
  status: number
  constructor(message: string, status: number) {
    super(message)
    this.name = "MatrikkelError"
    this.status = status
  }
}

export async function fetchMatrikkelData(
  input: MatrikkelLookupInput,
): Promise<MatrikkelLookupResult> {
  const { data, error } = await supabase.functions.invoke("matrikkel-lookup", {
    body: {
      kommunenummer: input.kommunenummer,
      gardsnummer: input.gardsnummer,
      bruksnummer: input.bruksnummer,
      center_lng: input.center_lng,
      center_lat: input.center_lat,
    },
  })

  if (error) {
    // supabase-js pakker HTTP-feil i FunctionsHttpError; meldingen kan
    // være generisk. Forsøk å hente serverens egen feilmelding.
    const status =
      (error as { context?: { status?: number } }).context?.status ?? 500
    let message = error.message ?? "Ukjent feil fra matrikkel-lookup"
    const ctxResponse = (error as { context?: { response?: Response } }).context
      ?.response
    if (ctxResponse) {
      try {
        const body = await ctxResponse.clone().json()
        if (body && typeof body.error === "string") message = body.error
      } catch {
        // ignorer parse-feil, behold opprinnelig melding
      }
    }
    throw new MatrikkelError(message, status)
  }

  if (!data || typeof data !== "object") {
    throw new MatrikkelError("Tomt svar fra matrikkel-lookup", 500)
  }

  const result = data as MatrikkelLookupResult
  if (!result.boundary || !result.buildings) {
    throw new MatrikkelError(
      "Ugyldig svar fra matrikkel-lookup (mangler boundary/buildings)",
      500,
    )
  }
  return result
}
