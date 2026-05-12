// Hageplan v0.5 — Edge Function: matrikkel-lookup (Fase 1)
//
// Ekte SOAP-integrasjon mot Kartverkets matrikkel-API.
//
// Flyt:
//   1) MatrikkelenhetService.findMatrikkelenhet(kommunenr, gnr, bnr)
//      → MatrikkelenhetId
//   2) StoreService.getObject(matrikkelenhetId)
//      → Matrikkelenhet med liste av TeigId-er
//   3) StoreService.getObjects(teigIds)
//      → Teig-objekter med polygon-geometri (eiendomsgrense)
//   4) BygningService.findByggForMatrikkelenhet(matrikkelenhetId)
//      → Liste av BygningId-er
//   5) StoreService.getObjects(byggIds)
//      → Bygning-objekter med polygon-geometri
//
// Vi setter koordinatsystemKodeId=84 (EUREF89 geografisk 2D) i
// MatrikkelContext slik at alle koordinater kommer som lon/lat
// (≈ EPSG:4326). Da slipper vi proj4-projeksjon.
//
// SOAP-namespaces, operasjons-signaturer og feltnavn er basert på
// dokumentasjon og open source-implementasjoner (vtfk/matrikkelapi-proxy,
// iaasen/matrikkel, PorticoEstate/matrikkel_java).
//
// Miljøvariabler (Supabase Edge Function secrets):
//   KARTVERKET_API_USERNAME
//   KARTVERKET_API_PASSWORD
//   KARTVERKET_API_URL  (f.eks. https://prodtest.matrikkel.no/matrikkelapi/wsapi/v1/)

// deno-lint-ignore-file no-explicit-any
// @ts-nocheck — kjøres i Deno-miljø, ikke i prosjektets TS-kontekst.

import { XMLParser } from "https://esm.sh/fast-xml-parser@4.5.0"

// ----------------------------------------------------------------------
// Konstanter
// ----------------------------------------------------------------------

const NS = {
  soap: "http://schemas.xmlsoap.org/soap/envelope/",
  xsi: "http://www.w3.org/2001/XMLSchema-instance",
  dom: "http://matrikkel.statkart.no/matrikkelapi/wsapi/v1/domain",
  geom: "http://matrikkel.statkart.no/matrikkelapi/wsapi/v1/domain/geometri",
  matenhet_dom:
    "http://matrikkel.statkart.no/matrikkelapi/wsapi/v1/domain/matrikkelenhet",
  bygning_dom:
    "http://matrikkel.statkart.no/matrikkelapi/wsapi/v1/domain/bygning",
  matenhet_svc:
    "http://matrikkel.statkart.no/matrikkelapi/wsapi/v1/service/matrikkelenhet",
  store_svc:
    "http://matrikkel.statkart.no/matrikkelapi/wsapi/v1/service/store",
  bygning_svc:
    "http://matrikkel.statkart.no/matrikkelapi/wsapi/v1/service/bygning",
}

const SERVICE_PATH = {
  matrikkelenhet: "MatrikkelenhetServiceWS",
  store: "StoreServiceWS",
  bygning: "BygningServiceWS",
}

// 84 = EUREF89 geografisk 2D (lon/lat). Mapbox/Leaflet bruker EPSG:4326
// som er ~1 m forskjellig fra EUREF89 — irrelevant for hageplanlegging.
const COORD_SYSTEM_WGS84 = 84

const CLIENT_ID = "hageplan"
const SOAP_TIMEOUT_MS = 30_000

const CORS_HEADERS: Record<string, string> = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
}

// ----------------------------------------------------------------------
// HTTP / response helpers
// ----------------------------------------------------------------------

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "content-type": "application/json; charset=utf-8",
      ...CORS_HEADERS,
    },
  })
}

function errorResponse(
  message: string,
  status: number,
  detail?: unknown,
): Response {
  return jsonResponse({ error: message, detail }, status)
}

// ----------------------------------------------------------------------
// SOAP envelope
// ----------------------------------------------------------------------

function buildMatrikkelContext(): string {
  return `
    <dom:locale>no_NO_B</dom:locale>
    <dom:brukOriginaleKoordinater>false</dom:brukOriginaleKoordinater>
    <dom:koordinatsystemKodeId>
      <dom:value>${COORD_SYSTEM_WGS84}</dom:value>
    </dom:koordinatsystemKodeId>
    <dom:systemVersion>trunk</dom:systemVersion>
    <dom:klientIdentifikasjon>${CLIENT_ID}</dom:klientIdentifikasjon>
    <dom:snapshotVersion>
      <dom:timestamp>9999-01-01T00:00:00+01:00</dom:timestamp>
    </dom:snapshotVersion>
  `
}

function envelope(
  operationXml: string,
  extraXmlns: Record<string, string> = {},
): string {
  const xmlnsAttrs = [
    `xmlns:soapenv="${NS.soap}"`,
    `xmlns:xsi="${NS.xsi}"`,
    `xmlns:dom="${NS.dom}"`,
    `xmlns:geom="${NS.geom}"`,
    ...Object.entries(extraXmlns).map(([k, v]) => `xmlns:${k}="${v}"`),
  ].join(" ")

  return `<?xml version="1.0" encoding="UTF-8"?>
<soapenv:Envelope ${xmlnsAttrs}>
  <soapenv:Header/>
  <soapenv:Body>
    ${operationXml}
  </soapenv:Body>
</soapenv:Envelope>`
}

// ----------------------------------------------------------------------
// SOAP transport
// ----------------------------------------------------------------------

interface SoapConfig {
  baseUrl: string
  authHeader: string
}

class SoapError extends Error {
  step: string
  status: number
  body?: string
  constructor(step: string, status: number, message: string, body?: string) {
    super(message)
    this.name = "SoapError"
    this.step = step
    this.status = status
    this.body = body
  }
}

async function soapCall(
  cfg: SoapConfig,
  servicePath: string,
  soapAction: string,
  envelopeXml: string,
  step: string,
): Promise<string> {
  const url = `${cfg.baseUrl.replace(/\/$/, "")}/${servicePath}`
  console.log(`[matrikkel] ${step} → POST ${url}`)

  const ctrl = new AbortController()
  const timeoutId = setTimeout(() => ctrl.abort(), SOAP_TIMEOUT_MS)

  let res: Response
  try {
    res = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "text/xml; charset=utf-8",
        "SOAPAction": soapAction,
        "Authorization": cfg.authHeader,
        "Accept": "text/xml, application/xml",
      },
      body: envelopeXml,
      signal: ctrl.signal,
    })
  } catch (err: any) {
    if (ctrl.signal.aborted) {
      throw new SoapError(step, 504, `Tidsavbrudd mot ${servicePath}`)
    }
    throw new SoapError(
      step,
      502,
      `Nettverksfeil mot ${servicePath}: ${err?.message ?? err}`,
    )
  } finally {
    clearTimeout(timeoutId)
  }

  const text = await res.text()

  // Logg respons (truncated) slik at vi kan debugge via Edge Function-logger.
  console.log(
    `[matrikkel] ${step} → HTTP ${res.status}, ${text.length} bytes`,
  )
  if (text.length < 4000) console.log(`[matrikkel] ${step} body:`, text)
  else console.log(`[matrikkel] ${step} body (first 4000):`, text.slice(0, 4000))

  if (res.status === 401 || res.status === 403) {
    throw new SoapError(
      step,
      503,
      "Tjeneste utilgjengelig (auth feilet mot Kartverket)",
      text,
    )
  }

  if (!res.ok) {
    // Forsøk å hente SOAP fault-melding hvis mulig.
    const fault = extractSoapFault(text)
    throw new SoapError(
      step,
      res.status === 404 ? 404 : 502,
      fault ?? `Kartverket svarte HTTP ${res.status} på ${servicePath}`,
      text,
    )
  }

  // Sjekk for SOAP fault i 200-respons også (forekommer).
  const fault = extractSoapFault(text)
  if (fault) {
    throw new SoapError(step, 502, fault, text)
  }

  return text
}

function extractSoapFault(xml: string): string | null {
  const faultMatch = xml.match(
    /<(?:[a-zA-Z0-9]+:)?Fault\b[\s\S]*?<\/(?:[a-zA-Z0-9]+:)?Fault>/,
  )
  if (!faultMatch) return null
  const stringMatch = faultMatch[0].match(
    /<(?:[a-zA-Z0-9]+:)?faultstring\b[^>]*>([\s\S]*?)<\/(?:[a-zA-Z0-9]+:)?faultstring>/,
  )
  if (stringMatch) return stringMatch[1].trim()
  // Fallback: SOAP 1.2-stil
  const reasonMatch = faultMatch[0].match(
    /<(?:[a-zA-Z0-9]+:)?Text\b[^>]*>([\s\S]*?)<\/(?:[a-zA-Z0-9]+:)?Text>/,
  )
  return reasonMatch ? reasonMatch[1].trim() : "Ukjent SOAP fault"
}

// ----------------------------------------------------------------------
// XML parser (fast-xml-parser med namespace-stripping)
// ----------------------------------------------------------------------

const xmlParser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: "@_",
  removeNSPrefix: true,
  parseAttributeValue: false,
  parseTagValue: false,
  trimValues: true,
  ignoreDeclaration: true,
  ignorePiTags: true,
  allowBooleanAttributes: true,
})

function parseXml(xml: string): any {
  return xmlParser.parse(xml)
}

// Hjelper: finn første forekomst av en nøkkel rekursivt i parsed JSON.
function findKey(obj: any, key: string): any {
  if (obj == null || typeof obj !== "object") return undefined
  if (key in obj) return obj[key]
  for (const v of Object.values(obj)) {
    if (v && typeof v === "object") {
      const found = findKey(v, key)
      if (found !== undefined) return found
    }
  }
  return undefined
}

// Hjelper: finn alle forekomster av en nøkkel rekursivt.
function findAll(obj: any, key: string, out: any[] = []): any[] {
  if (obj == null || typeof obj !== "object") return out
  if (key in obj) {
    const v = obj[key]
    if (Array.isArray(v)) out.push(...v)
    else out.push(v)
  }
  for (const v of Object.values(obj)) {
    if (v && typeof v === "object") findAll(v, key, out)
  }
  return out
}

function asArray<T>(v: T | T[] | undefined | null): T[] {
  if (v == null) return []
  return Array.isArray(v) ? v : [v]
}

// ----------------------------------------------------------------------
// Step 1: findMatrikkelenhet
// ----------------------------------------------------------------------

async function findMatrikkelenhetId(
  cfg: SoapConfig,
  kommunenummer: string,
  gnr: number,
  bnr: number,
): Promise<string> {
  const operation = `
    <mat:findMatrikkelenhet xmlns:mat="${NS.matenhet_svc}">
      <mat:matrikkelenhetIdent>
        <dom:kommuneIdent>
          <dom:kommunenummer>${escapeXml(kommunenummer)}</dom:kommunenummer>
        </dom:kommuneIdent>
        <dom:gardsnummer>${gnr}</dom:gardsnummer>
        <dom:bruksnummer>${bnr}</dom:bruksnummer>
      </mat:matrikkelenhetIdent>
      <mat:matrikkelContext>
        ${buildMatrikkelContext()}
      </mat:matrikkelContext>
    </mat:findMatrikkelenhet>
  `
  const xml = envelope(operation)
  const respText = await soapCall(
    cfg,
    SERVICE_PATH.matrikkelenhet,
    `${NS.matenhet_svc}/findMatrikkelenhet`,
    xml,
    "findMatrikkelenhet",
  )

  const parsed = parseXml(respText)
  // Svar inneholder <return><value>NNN</value></return> eller lignende.
  const ret = findKey(parsed, "return") ?? findKey(parsed, "matrikkelenhetId")
  const value = ret && typeof ret === "object" ? findKey(ret, "value") : ret
  if (!value) {
    throw new SoapError(
      "findMatrikkelenhet",
      404,
      "Eiendommen ble ikke funnet",
      respText,
    )
  }
  return String(value)
}

// ----------------------------------------------------------------------
// Step 2 & 3 & 5: StoreService.getObject(s)
// ----------------------------------------------------------------------

async function storeGetObjects(
  cfg: SoapConfig,
  ids: string[],
  xsiType: string,
  step: string,
): Promise<any> {
  if (ids.length === 0) return { items: [] }

  // xsi:type-prefiks må refereres til en namespace som er deklarert
  // på <stor:ids>-elementet. Vi bruker "ns1" → matenhet/bygning_dom basert
  // på type.
  const typeNs = xsiType.startsWith("Bygning")
    ? NS.bygning_dom
    : xsiType.startsWith("Teig")
      ? NS.matenhet_dom
      : NS.matenhet_dom

  const items = ids
    .map(
      (id) =>
        `<dom:item xsi:type="ns1:${xsiType}"><dom:value>${escapeXml(
          id,
        )}</dom:value></dom:item>`,
    )
    .join("")

  const operation = `
    <stor:getObjects xmlns:stor="${NS.store_svc}">
      <stor:ids xmlns:ns1="${typeNs}">${items}</stor:ids>
      <stor:matrikkelContext>
        ${buildMatrikkelContext()}
      </stor:matrikkelContext>
    </stor:getObjects>
  `
  const xml = envelope(operation)
  const respText = await soapCall(
    cfg,
    SERVICE_PATH.store,
    `${NS.store_svc}/getObjects`,
    xml,
    step,
  )
  return parseXml(respText)
}

// ----------------------------------------------------------------------
// Step 4: BygningService.findByggForMatrikkelenhet
// ----------------------------------------------------------------------

async function findByggIds(
  cfg: SoapConfig,
  matrikkelenhetId: string,
): Promise<string[]> {
  const operation = `
    <byg:findByggForMatrikkelenhet xmlns:byg="${NS.bygning_svc}">
      <byg:matrikkelenhetId xmlns:ns1="${NS.matenhet_dom}" xsi:type="ns1:MatrikkelenhetId">
        <dom:value>${escapeXml(matrikkelenhetId)}</dom:value>
      </byg:matrikkelenhetId>
      <byg:matrikkelContext>
        ${buildMatrikkelContext()}
      </byg:matrikkelContext>
    </byg:findByggForMatrikkelenhet>
  `
  const xml = envelope(operation)
  const respText = await soapCall(
    cfg,
    SERVICE_PATH.bygning,
    `${NS.bygning_svc}/findByggForMatrikkelenhet`,
    xml,
    "findByggForMatrikkelenhet",
  )

  const parsed = parseXml(respText)
  // Returverdien er typisk en liste av BygningId-er: <return><item><value>NN</value></item>...</return>
  const items = findAll(parsed, "item")
  const ids: string[] = []
  for (const it of items) {
    const v = it && typeof it === "object" ? it.value : it
    if (v != null && v !== "") ids.push(String(v))
  }
  // Dedupliser, behold rekkefølge.
  return Array.from(new Set(ids))
}

// ----------------------------------------------------------------------
// Geometry-extraction
// ----------------------------------------------------------------------

interface Vertex {
  x: number
  y: number
}

// Et "ring" i Matrikkel-API består av geom:item med x/y/z under
// posisjon. Vi finner alle item-objekt med x og y og bygger en lukket ring.
function extractRingFromContainer(container: any): Vertex[] | null {
  if (!container) return null
  // Finn alle "item"-objekter under container.
  const candidates = findAll(container, "item")
  const verts: Vertex[] = []
  for (const c of candidates) {
    if (c && typeof c === "object" && c.x != null && c.y != null) {
      const x = Number(c.x)
      const y = Number(c.y)
      if (Number.isFinite(x) && Number.isFinite(y)) {
        verts.push({ x, y })
      }
    }
  }
  if (verts.length < 3) return null
  // Lukk ringen hvis ikke allerede lukket.
  const first = verts[0]
  const last = verts[verts.length - 1]
  if (first.x !== last.x || first.y !== last.y) verts.push(first)
  return verts
}

function ringToCoordinates(ring: Vertex[]): number[][] {
  // koordinatsystemKodeId=84 → x=lon, y=lat
  return ring.map((v) => [v.x, v.y])
}

// Plukk ut Polygon-objekt fra et domeneobjekt (Teig eller Bygning).
// Returnerer GeoJSON-Polygon eller null.
function extractPolygon(domainObj: any): any | null {
  if (!domainObj) return null

  // Et Polygon har typisk én "ytreAvgrensing" og evt. "indreAvgrensing"-er.
  // I noen objekter ligger Polygon under "omrade" / "geometri" / "flate".
  // Vi finner første Polygon-noden vi kan se.
  const polygonNode = findKey(domainObj, "Polygon") ?? domainObj

  const ytre =
    findKey(polygonNode, "ytreAvgrensing") ??
    findKey(domainObj, "ytreAvgrensing")
  const ytreRing = extractRingFromContainer(ytre)
  if (!ytreRing) return null

  const indreNodes: any[] = asArray(
    findKey(polygonNode, "indreAvgrensing") ??
      findKey(domainObj, "indreAvgrensing"),
  )
  const holes = indreNodes
    .map((n) => extractRingFromContainer(n))
    .filter((r): r is Vertex[] => r != null)

  const coordinates = [
    ringToCoordinates(ytreRing),
    ...holes.map(ringToCoordinates),
  ]

  return {
    type: "Polygon",
    coordinates,
  }
}

// Hent alle Teig-objekter fra et getObjects-svar og bygg union/MultiPolygon.
function buildBoundaryFeature(teigerResp: any): any | null {
  // Finn alle returnerte objekter — de ligger som <return><item> ...
  const items = findAll(teigerResp, "item")
  // Vi vil ha kun de som ser ut som Teig (har et Polygon).
  const polygons: any[] = []
  for (const it of items) {
    const p = extractPolygon(it)
    if (p) polygons.push(p)
  }
  if (polygons.length === 0) return null
  if (polygons.length === 1) {
    return {
      type: "Feature",
      properties: { source: "matrikkel-teig" },
      geometry: polygons[0],
    }
  }
  // Flere teiger → MultiPolygon
  return {
    type: "Feature",
    properties: { source: "matrikkel-teig" },
    geometry: {
      type: "MultiPolygon",
      coordinates: polygons.map((p) => p.coordinates),
    },
  }
}

function buildBuildingsFeatureCollection(byggResp: any): any {
  const items = findAll(byggResp, "item")
  const features: any[] = []
  for (const it of items) {
    const p = extractPolygon(it)
    if (p) {
      // Plukk ut byggnummer / bygningstype hvis mulig.
      const id = findKey(it, "bygningsnummer") ?? findKey(it, "id")
      features.push({
        type: "Feature",
        properties: {
          source: "matrikkel-bygning",
          ...(id != null ? { matrikkel_id: String(id) } : {}),
        },
        geometry: p,
      })
    }
  }
  return { type: "FeatureCollection", features }
}

// ----------------------------------------------------------------------
// Hjelp: ekstraher TeigId-er fra et Matrikkelenhet-svar
// ----------------------------------------------------------------------

function extractTeigIds(matObj: any): string[] {
  // Matrikkelenhet refererer til teiger via "teigIds" eller "teiger".
  const teigerNode =
    findKey(matObj, "teigIds") ??
    findKey(matObj, "teiger") ??
    findKey(matObj, "teigList")
  const items = teigerNode ? findAll(teigerNode, "item") : []
  const ids: string[] = []
  for (const it of items) {
    const v = it && typeof it === "object" ? it.value : it
    if (v != null && v !== "") ids.push(String(v))
  }
  return Array.from(new Set(ids))
}

// ----------------------------------------------------------------------
// XML escaping
// ----------------------------------------------------------------------

function escapeXml(s: string): string {
  return String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;")
}

// ----------------------------------------------------------------------
// Hovedflyt
// ----------------------------------------------------------------------

interface LookupRequest {
  kommunenummer?: string
  gardsnummer?: number | string
  bruksnummer?: number | string
  debug?: boolean
}

async function performLookup(
  cfg: SoapConfig,
  kommunenummer: string,
  gnr: number,
  bnr: number,
  debug: boolean,
): Promise<{ boundary: any; buildings: any; debug?: any }> {
  const debugInfo: Record<string, unknown> = {}

  // 1. Find matrikkelenhetId
  const matrikkelenhetId = await findMatrikkelenhetId(
    cfg,
    kommunenummer,
    gnr,
    bnr,
  )
  if (debug) debugInfo.matrikkelenhetId = matrikkelenhetId

  // 2. Get matrikkelenhet object
  const matObjResp = await storeGetObjects(
    cfg,
    [matrikkelenhetId],
    "MatrikkelenhetId",
    "getMatrikkelenhet",
  )
  const matItems = findAll(matObjResp, "item")
  const matObj = matItems[0]
  if (!matObj) {
    throw new SoapError(
      "getMatrikkelenhet",
      404,
      "Matrikkelenhet ikke returnert fra StoreService",
    )
  }

  // 3. Get teig polygons
  const teigIds = extractTeigIds(matObj)
  if (debug) debugInfo.teigIds = teigIds
  if (teigIds.length === 0) {
    throw new SoapError(
      "extractTeigIds",
      404,
      "Ingen teiger funnet for matrikkelenhet",
    )
  }
  const teigerResp = await storeGetObjects(
    cfg,
    teigIds,
    "TeigId",
    "getTeiger",
  )
  const boundary = buildBoundaryFeature(teigerResp)
  if (!boundary) {
    throw new SoapError(
      "buildBoundary",
      502,
      "Klarte ikke å bygge eiendomsgrense fra Teig-respons",
    )
  }

  // 4. Find byggIds
  let byggIds: string[] = []
  try {
    byggIds = await findByggIds(cfg, matrikkelenhetId)
  } catch (err) {
    // Bygninger er ikke kritisk — logg men gå videre med tom collection.
    console.warn("[matrikkel] findByggForMatrikkelenhet feilet:", err)
  }
  if (debug) debugInfo.byggIds = byggIds

  // 5. Get bygg polygons
  let buildings: any = { type: "FeatureCollection", features: [] }
  if (byggIds.length > 0) {
    const byggResp = await storeGetObjects(cfg, byggIds, "BygningId", "getBygg")
    buildings = buildBuildingsFeatureCollection(byggResp)
  }

  return {
    boundary,
    buildings,
    ...(debug ? { debug: debugInfo } : {}),
  }
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

  const username = Deno.env.get("KARTVERKET_API_USERNAME")?.trim()
  const password = Deno.env.get("KARTVERKET_API_PASSWORD")?.trim()
  const apiUrl = Deno.env.get("KARTVERKET_API_URL")?.trim()
  if (!username || !password || !apiUrl) {
    return errorResponse(
      "Kartverket-API er ikke konfigurert (mangler secrets)",
      503,
    )
  }

  // Logg konfig (uten å lekke passordet) slik at vi kan diagnostisere
  // 401-feil. Brukernavnet maskeres delvis.
  const maskedUser =
    username.length <= 4
      ? `${username[0] ?? ""}***`
      : `${username.slice(0, 2)}***${username.slice(-2)}`
  console.log(
    `[matrikkel] config: user=${maskedUser} (len=${username.length}), pwLen=${password.length}, url=${apiUrl}`,
  )

  const cfg: SoapConfig = {
    baseUrl: apiUrl,
    authHeader: `Basic ${btoa(`${username}:${password}`)}`,
  }

  const debug = body.debug === true

  try {
    const result = await performLookup(cfg, kommunenummer, gnr, bnr, debug)
    return jsonResponse(result)
  } catch (err: any) {
    if (err instanceof SoapError) {
      console.error(
        `[matrikkel] feilet i steg ${err.step}: ${err.message}`,
      )
      return errorResponse(err.message, err.status, {
        step: err.step,
        body: err.body ? err.body.slice(0, 2000) : undefined,
      })
    }
    console.error("[matrikkel] uventet feil:", err)
    return errorResponse(
      err?.message ?? "Ukjent feil i matrikkel-lookup",
      500,
    )
  }
})
