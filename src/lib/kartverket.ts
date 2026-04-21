// Kartverket adressesøk (https://ws.geonorge.no/adresser/v1/sok)
// Returnerer adresser med koordinater og matrikkelinfo (gnr/bnr).

export interface AddressHit {
  id: string
  address: string
  lng: number
  lat: number
  gnr: number
  bnr: number
  kommunenummer: string
  kommunenavn: string
  postnummer: string
  poststed: string
}

interface KartverketRaw {
  adressetekst?: string
  adressenavn?: string
  nummer?: number
  bokstav?: string
  postnummer?: string
  poststed?: string
  kommunenummer?: string
  kommunenavn?: string
  gardsnummer?: number
  bruksnummer?: number
  representasjonspunkt?: { lat: number; lon: number; epsg?: string }
}

interface KartverketResponse {
  adresser?: KartverketRaw[]
}

const BASE = "https://ws.geonorge.no/adresser/v1/sok"

export async function searchAddresses(
  query: string,
  signal?: AbortSignal,
): Promise<AddressHit[]> {
  const trimmed = query.trim()
  if (trimmed.length < 3) return []

  const params = new URLSearchParams({
    sok: trimmed,
    treffPerSide: "8",
    side: "0",
    utkoordsys: "4326",
  })

  const res = await fetch(`${BASE}?${params.toString()}`, { signal })
  if (!res.ok) throw new Error(`Kartverket svarte ${res.status}`)

  const json = (await res.json()) as KartverketResponse
  const hits = json.adresser ?? []

  const out: AddressHit[] = []
  for (const h of hits) {
    const pt = h.representasjonspunkt
    if (!pt) continue
    if (h.gardsnummer == null || h.bruksnummer == null) continue
    const address = formatAddress(h)
    if (!address) continue
    out.push({
      id: `${h.kommunenummer ?? ""}-${h.gardsnummer}-${h.bruksnummer}-${pt.lat},${pt.lon}`,
      address,
      lng: pt.lon,
      lat: pt.lat,
      gnr: h.gardsnummer,
      bnr: h.bruksnummer,
      kommunenummer: h.kommunenummer ?? "",
      kommunenavn: h.kommunenavn ?? "",
      postnummer: h.postnummer ?? "",
      poststed: h.poststed ?? "",
    })
  }
  return out
}

function formatAddress(h: KartverketRaw): string {
  if (h.adressetekst) {
    const post =
      h.postnummer && h.poststed
        ? `, ${h.postnummer} ${h.poststed}`
        : ""
    return `${h.adressetekst}${post}`
  }
  if (h.adressenavn && h.nummer != null) {
    const letter = h.bokstav ?? ""
    const post =
      h.postnummer && h.poststed
        ? `, ${h.postnummer} ${h.poststed}`
        : ""
    return `${h.adressenavn} ${h.nummer}${letter}${post}`
  }
  return ""
}
