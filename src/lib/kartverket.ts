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
const TIMEOUT_MS = 8000

export type KartverketErrorKind = "timeout" | "network" | "server" | "parse"

export class KartverketError extends Error {
  kind: KartverketErrorKind
  status?: number
  constructor(message: string, kind: KartverketErrorKind, status?: number) {
    super(message)
    this.name = "KartverketError"
    this.kind = kind
    this.status = status
  }
}

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

  const timeoutCtrl = new AbortController()
  const timeoutId = window.setTimeout(
    () => timeoutCtrl.abort(new DOMException("timeout", "TimeoutError")),
    TIMEOUT_MS,
  )
  const combined = combineSignals(signal, timeoutCtrl.signal)

  let res: Response
  try {
    res = await fetch(`${BASE}?${params.toString()}`, {
      signal: combined,
      credentials: "omit",
      headers: { accept: "application/json" },
    })
  } catch (err) {
    if (signal?.aborted) throw err
    if (timeoutCtrl.signal.aborted) {
      throw new KartverketError(
        "Tidsavbrudd — Kartverket svarte ikke innen 8 sekunder.",
        "timeout",
      )
    }
    // TypeError: Failed to fetch → CORS or network
    console.error("[kartverket] fetch failed", err)
    throw new KartverketError(
      "Nettverksfeil eller CORS — sjekk at du har nett og at ingen nettleser-utvidelser blokkerer geonorge.no.",
      "network",
    )
  } finally {
    window.clearTimeout(timeoutId)
  }

  if (!res.ok) {
    throw new KartverketError(
      `Kartverket svarte ${res.status}`,
      "server",
      res.status,
    )
  }

  let json: KartverketResponse
  try {
    json = (await res.json()) as KartverketResponse
  } catch (err) {
    console.error("[kartverket] parse failed", err)
    throw new KartverketError("Uventet svar fra Kartverket.", "parse")
  }

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
      h.postnummer && h.poststed ? `, ${h.postnummer} ${h.poststed}` : ""
    return `${h.adressetekst}${post}`
  }
  if (h.adressenavn && h.nummer != null) {
    const letter = h.bokstav ?? ""
    const post =
      h.postnummer && h.poststed ? `, ${h.postnummer} ${h.poststed}` : ""
    return `${h.adressenavn} ${h.nummer}${letter}${post}`
  }
  return ""
}

function combineSignals(a: AbortSignal | undefined, b: AbortSignal): AbortSignal {
  if (!a) return b
  // AbortSignal.any is supported in all current evergreen browsers.
  const anyFn = (AbortSignal as unknown as {
    any?: (signals: AbortSignal[]) => AbortSignal
  }).any
  if (typeof anyFn === "function") return anyFn([a, b])
  const ctrl = new AbortController()
  const onAbort = () => ctrl.abort()
  if (a.aborted || b.aborted) ctrl.abort()
  else {
    a.addEventListener("abort", onAbort, { once: true })
    b.addEventListener("abort", onAbort, { once: true })
  }
  return ctrl.signal
}
