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
import proj4 from "https://esm.sh/proj4@2.11.0"

// UTM-soner for Norge (alle ETRS89/EUREF89). Matrikkelens interne
// lagringssystem er UTM33 for det meste, men eldre data kan være UTM32
// (sør-Norge) eller UTM35 (Finnmark).
proj4.defs(
  "EPSG:25832",
  "+proj=utm +zone=32 +ellps=GRS80 +units=m +no_defs +type=crs",
)
proj4.defs(
  "EPSG:25833",
  "+proj=utm +zone=33 +ellps=GRS80 +units=m +no_defs +type=crs",
)
proj4.defs(
  "EPSG:25835",
  "+proj=utm +zone=35 +ellps=GRS80 +units=m +no_defs +type=crs",
)
// EPSG:4326 (WGS84 lon/lat) er innebygd i proj4.

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
  kommune_dom:
    "http://matrikkel.statkart.no/matrikkelapi/wsapi/v1/domain/kommune",
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

// 25833 = EPSG-koden for UTM zone 33N (ETRS89). Matrikkelens interne
// lagringssystem. Forsøk på å la serveren transformere til lon/lat
// (kode 84 fra Trondheim-eksempelet) gir "kode 35: feil tilsys" —
// så vi henter koordinater i UTM33N og konverterer til WGS84 selv
// via proj4.
const COORD_SYSTEM = 25833

const CLIENT_ID = "hageplan"
const FN_VERSION = "v0.5.f1.11"
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
  // brukOriginaleKoordinater=true → server returnerer geometri i sitt
  // interne lagringssystem (UTM33N / EPSG:25833 for moderne data).
  // Ingen SkTrans-transformasjon, ingen "Frasys/Tilsys"-feil.
  // koordinatsystemKodeId blir da kun en hint som ikke faktisk brukes.
  return `
    <dom:locale>no_NO_B</dom:locale>
    <dom:brukOriginaleKoordinater>true</dom:brukOriginaleKoordinater>
    <dom:koordinatsystemKodeId>
      <dom:value>${COORD_SYSTEM}</dom:value>
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
    `xmlns:mat1="${NS.matenhet_dom}"`,
    `xmlns:kom="${NS.kommune_dom}"`,
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
  // Logg første 1500 bytes av request-body for diagnostikk.
  console.log(
    `[matrikkel] ${step} request body:`,
    envelopeXml.length < 1500
      ? envelopeXml
      : envelopeXml.slice(0, 1500) + " … (truncated)",
  )

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
  if (text.length < 25000) console.log(`[matrikkel] ${step} body:`, text)
  else
    console.log(
      `[matrikkel] ${step} body (first 25000):`,
      text.slice(0, 25000),
    )

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
  // Server-side Java-mapper kaller setFestenr(int) og setSeksjonsnr(int)
  // reflektivt uten null-sjekk; manglende elementer gir Integer null →
  // IllegalArgumentException ved unboxing. Begge må sendes som 0 selv
  // for vanlige eiendommer. Verifisert i fungerende sample fra
  // klimaetatenmagnus/PoC_Energir-dgivning.
  // Rekkefølge er bindende: kommuneIdent, gardsnummer, bruksnummer,
  // festenummer, seksjonsnummer.
  const kommunenummerPadded = kommunenummer.padStart(4, "0")
  const operation = `
    <mat:findMatrikkelenhet xmlns:mat="${NS.matenhet_svc}">
      <mat:matrikkelenhetIdent>
        <mat1:kommuneIdent>
          <kom:kommunenummer>${escapeXml(kommunenummerPadded)}</kom:kommunenummer>
        </mat1:kommuneIdent>
        <mat1:gardsnummer>${gnr}</mat1:gardsnummer>
        <mat1:bruksnummer>${bnr}</mat1:bruksnummer>
        <mat1:festenummer>0</mat1:festenummer>
        <mat1:seksjonsnummer>0</mat1:seksjonsnummer>
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
  // Velg namespace for xsi:type basert på objekttype:
  //   MatrikkelenhetId/TeigId/GrunneiendomId/TeiggrenseId → matrikkelenhet
  //   BygningId → bygning
  //   FlateId/Polygon-typer → geometri (separat domene)
  //
  // OBS: Teiggrense ligger i matrikkelenhet-domenet (per UML
  // EARoot/EA8/EA882), selv om feltet grenselinjeId i Teig-responsen
  // bærer geometri-NS-prefiks. Forveksling her gir "Cannot resolve type".
  const typeNs =
    xsiType.startsWith("Bygning") || xsiType.startsWith("Bygg")
      ? NS.bygning_dom
      : xsiType.startsWith("Flate")
        ? NS.geom
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
  // Returverdien er en liste av BygningId-er: <return><item><value>NN</value></item>...</return>
  // Vi henter items direkte fra <return> for å unngå å plukke opp
  // metadata-items eller andre nestede strukturer.
  const ret = findKey(parsed, "return")
  const items = ret && typeof ret === "object" ? asArray((ret as any).item) : []
  const ids: string[] = []
  for (const it of items) {
    // Item kan være enten { value: "NN" } eller en streng.
    if (it && typeof it === "object" && "value" in (it as any)) {
      const v = (it as any).value
      if (v != null && v !== "") ids.push(String(v))
    }
  }
  return Array.from(new Set(ids))
}

// ----------------------------------------------------------------------
// Geometry-extraction (bubble model)
// ----------------------------------------------------------------------
//
// En Teig inneholder IKKE polygon-koordinater direkte. Strukturen er:
//
//   <Teig>
//     <flate>
//       <exterior>
//         <curveDirections>
//           <item>
//             <signed>false</signed>
//             <grenselinjeId><value>NN</value></grenselinjeId>
//           </item>
//           ... flere segmenter
//         </curveDirections>
//       </exterior>
//       <interior>...</interior>   ← valgfritt, for hull
//     </flate>
//   </Teig>
//
// Hver grenselinje må hentes separat via StoreService.getObjects og
// inneholder kurvepunkter med x/y/z. Vi stitcher segmentene sammen til
// en lukket ring. signed-flagget indikerer om punktene skal traverseres
// forlengs eller motsatt. Konvensjonen er ikke entydig dokumentert — vi
// prøver begge og velger den som lukker ringen tettest.

interface Vertex {
  x: number
  y: number
}

interface CurveDir {
  grenselinjeId: string
  signed: boolean
}

function pointsEqual(a: Vertex, b: Vertex, tolMeters = 0.05): boolean {
  return Math.abs(a.x - b.x) < tolMeters && Math.abs(a.y - b.y) < tolMeters
}

function distance(a: Vertex, b: Vertex): number {
  return Math.sqrt((a.x - b.x) ** 2 + (a.y - b.y) ** 2)
}

// Trekk ut curveDirections (grenselinjeId + signed) i rekkefølge fra en
// boundary-node (exterior eller interior).
function extractCurveDirections(boundary: any): CurveDir[] {
  if (!boundary || typeof boundary !== "object") return []
  const cdNode = findKey(boundary, "curveDirections")
  if (!cdNode || typeof cdNode !== "object") return []
  const items = asArray((cdNode as any).item)
  const out: CurveDir[] = []
  for (const it of items) {
    if (!it || typeof it !== "object") continue
    const grIdObj = (it as any).grenselinjeId
    if (!grIdObj || typeof grIdObj !== "object") continue
    const grId = (grIdObj as any).value
    if (grId == null || grId === "") continue
    const signed = String((it as any).signed) === "true"
    out.push({ grenselinjeId: String(grId), signed })
  }
  return out
}

// Hent exterior og interiors fra Teig.flate.
function extractFlateBoundaries(teig: any): {
  exterior: any | null
  interiors: any[]
} {
  const flate = findKey(teig, "flate")
  if (!flate || typeof flate !== "object") {
    return { exterior: null, interiors: [] }
  }
  const exterior = (flate as any).exterior ?? null
  const interiorRaw = (flate as any).interior
  const interiors = interiorRaw ? asArray(interiorRaw) : []
  return { exterior, interiors }
}

// Plukk ut kurvepunkter fra et Grenselinje-objekt. Feltnavnet er ikke
// helt entydig — vi prøver flere kandidater og filtrerer på {x, y}.
function extractKurvepunkter(grenselinje: any): Vertex[] {
  if (!grenselinje || typeof grenselinje !== "object") return []
  const candidates = [
    findKey(grenselinje, "kurvepunkter"),
    findKey(grenselinje, "kurve"),
    findKey(grenselinje, "punkter"),
    findKey(grenselinje, "posisjoner"),
  ].filter(Boolean)

  for (const c of candidates) {
    // findAll for å nå ned gjennom evt. wrapping (kurve.punkter, etc.)
    const items = findAll(c, "item")
    const verts: Vertex[] = []
    for (const it of items) {
      if (it && typeof it === "object" && it.x != null && it.y != null) {
        const x = Number(it.x)
        const y = Number(it.y)
        if (Number.isFinite(x) && Number.isFinite(y)) {
          verts.push({ x, y })
        }
      }
    }
    if (verts.length > 0) return verts
  }
  return []
}

function stitchRingOnce(
  curveDirs: CurveDir[],
  grenselinjeMap: Map<string, Vertex[]>,
  flipSigned: boolean,
): Vertex[] {
  const ring: Vertex[] = []
  for (const cd of curveDirs) {
    const original = grenselinjeMap.get(cd.grenselinjeId)
    if (!original || original.length === 0) continue
    const reverse = flipSigned ? !cd.signed : cd.signed
    let pts = reverse ? [...original].reverse() : original
    if (ring.length > 0 && pts.length > 0) {
      const last = ring[ring.length - 1]
      if (pointsEqual(last, pts[0])) {
        pts = pts.slice(1)
      }
    }
    for (const p of pts) ring.push(p)
  }
  return ring
}

// Bygg en lukket ring fra curveDirections. signed-konvensjonen er
// ikke entydig — vi prøver begge og velger den som lukker tettest.
function stitchRing(
  curveDirs: CurveDir[],
  grenselinjeMap: Map<string, Vertex[]>,
  ringLabel: string,
): Vertex[] | null {
  if (curveDirs.length === 0) return null

  const ringA = stitchRingOnce(curveDirs, grenselinjeMap, false)
  const ringB = stitchRingOnce(curveDirs, grenselinjeMap, true)

  const closureA =
    ringA.length >= 2 ? distance(ringA[0], ringA[ringA.length - 1]) : Infinity
  const closureB =
    ringB.length >= 2 ? distance(ringB[0], ringB[ringB.length - 1]) : Infinity

  console.log(
    `[matrikkel] stitch ${ringLabel}: ${curveDirs.length} segmenter, signed=forward lukker med ${closureA.toFixed(2)}m, signed=reverse lukker med ${closureB.toFixed(2)}m`,
  )

  const chosen = closureA <= closureB ? ringA : ringB
  if (chosen.length < 3) return null

  // Lukk ringen eksplisitt.
  const first = chosen[0]
  const last = chosen[chosen.length - 1]
  if (!pointsEqual(first, last)) chosen.push(first)

  return chosen
}

// Detekter hvilken UTM-sone koordinatene er i basert på east-verdien
// (x). UTM east ligger typisk i 100 000 – 900 000-området (relativt til
// sentralmeridianen). Norge bruker primært UTM33 i dag, men eldre
// matrikkeldata kan være i UTM32 eller UTM35. Lat/lng-verdier er små
// (5–31 lng, 58–71 lat for Norge) og lett å skille fra UTM-meter.
function detectSourceCrs(x: number, y: number): string {
  // Hvis x og y er små (under ~360), er det allerede lat/lng — uventet
  // men mulig hvis serveren faktisk gjorde en transformasjon.
  if (Math.abs(x) < 360 && Math.abs(y) < 90) return "EPSG:4326"
  // Norske UTM-koordinater har y (northing) på ca. 6 400 000 – 7 950 000.
  // x (easting) varierer per sone: 250 000 – 900 000.
  // Vi kan ikke gjette UTM-sonen kun fra easting alene (UTM32 og UTM33
  // overlapper) uten å vite lengden. Default til UTM33 (det vanligste);
  // første gang vi får faktiske koordinater kan vi inspisere og justere.
  return "EPSG:25833"
}

let crsLogged = false
function ringToCoordinates(ring: Vertex[]): number[][] {
  if (ring.length === 0) return []
  const sample = ring[0]
  const srcCrs = detectSourceCrs(sample.x, sample.y)
  if (!crsLogged) {
    console.log(
      `[matrikkel] første teig-koordinat: x=${sample.x}, y=${sample.y} → tolkes som ${srcCrs}`,
    )
    crsLogged = true
  }
  if (srcCrs === "EPSG:4326") {
    // Allerede lat/lng — bruk direkte (men matrikkel lagrer som [east, north]
    // der east kunne tilsvare lng. Anta x=lng, y=lat.).
    return ring.map((v) => [v.x, v.y])
  }
  return ring.map((v) => {
    const [lon, lat] = proj4(srcCrs, "EPSG:4326", [v.x, v.y])
    return [lon, lat]
  })
}

// Bygg GeoJSON-Polygon fra en Teig + grenselinjeMap.
function buildPolygonForTeig(
  teig: any,
  grenselinjeMap: Map<string, Vertex[]>,
  teigLabel: string,
): any | null {
  const { exterior, interiors } = extractFlateBoundaries(teig)
  if (!exterior) return null
  const extDirs = extractCurveDirections(exterior)
  const extRing = stitchRing(extDirs, grenselinjeMap, `${teigLabel}.exterior`)
  if (!extRing || extRing.length < 4) return null
  const holes: Vertex[][] = []
  for (let i = 0; i < interiors.length; i++) {
    const intDirs = extractCurveDirections(interiors[i])
    const intRing = stitchRing(
      intDirs,
      grenselinjeMap,
      `${teigLabel}.interior[${i}]`,
    )
    if (intRing && intRing.length >= 4) holes.push(intRing)
  }
  return {
    type: "Polygon",
    coordinates: [
      ringToCoordinates(extRing),
      ...holes.map(ringToCoordinates),
    ],
  }
}

function buildBoundaryFeature(polygons: any[]): any | null {
  if (polygons.length === 0) return null
  if (polygons.length === 1) {
    return {
      type: "Feature",
      properties: { source: "matrikkel-teig" },
      geometry: polygons[0],
    }
  }
  return {
    type: "Feature",
    properties: { source: "matrikkel-teig" },
    geometry: {
      type: "MultiPolygon",
      coordinates: polygons.map((p) => p.coordinates),
    },
  }
}

// Bygninger via Matrikkel-SOAP gir KUN representasjonspunkt (ett punkt
// per bygning), ikke fotavtrykk-polygoner. Fotavtrykk må hentes fra
// Geonorge WFS (FKB-Bygning) — separat oppgave. Inntil videre returnerer
// vi en tom FeatureCollection.
function buildBuildingsFeatureCollection(_byggResp: any): any {
  return { type: "FeatureCollection", features: [] }
}

// ----------------------------------------------------------------------
// Hjelp: ekstraher TeigId-er fra et Matrikkelenhet-svar
// ----------------------------------------------------------------------

function extractTeigIds(matObj: any): string[] {
  // Strukturen er:
  //   <teigerForMatrikkelenhet>
  //     <item>
  //       <metadata>...</metadata>   ← feltnavn-liste, IGNORERES
  //       <teigId><value>NN</value></teigId>
  //       <id>NN</id>                ← TeigForMatrikkelenhet-relasjons-id
  //       <hovedteig>true</hovedteig>
  //     </item>
  //   </teigerForMatrikkelenhet>
  // Vi trekker ut teigId.value fra hver direkte item — IKKE rekursivt,
  // siden metadata-blokken inneholder item-elementer med feltnavn.
  const teigerNode = findKey(matObj, "teigerForMatrikkelenhet")
  if (!teigerNode || typeof teigerNode !== "object") return []
  const items = asArray((teigerNode as any).item)
  const ids: string[] = []
  for (const it of items) {
    if (!it || typeof it !== "object") continue
    const teigIdObj = (it as any).teigId
    if (!teigIdObj || typeof teigIdObj !== "object") continue
    const v = (teigIdObj as any).value
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

  // 3. Get teig objects (inneholder curveDirections, ikke polygon-koord)
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
  const teigReturn = findKey(teigerResp, "return")
  const teigItems =
    teigReturn && typeof teigReturn === "object"
      ? asArray((teigReturn as any).item)
      : []
  if (teigItems.length === 0) {
    throw new SoapError(
      "getTeiger",
      502,
      "Ingen Teig-objekter i StoreService-svar",
    )
  }

  // 4. Samle grenselinjeIds fra alle teigers exterior + interiors
  const teigCurveDirs = teigItems.map((teig: any) => {
    const { exterior, interiors } = extractFlateBoundaries(teig)
    return {
      ext: extractCurveDirections(exterior),
      ints: interiors.map(extractCurveDirections),
    }
  })
  const allGrenselinjeIds = new Set<string>()
  for (const t of teigCurveDirs) {
    for (const cd of t.ext) allGrenselinjeIds.add(cd.grenselinjeId)
    for (const ints of t.ints) {
      for (const cd of ints) allGrenselinjeIds.add(cd.grenselinjeId)
    }
  }
  if (debug) debugInfo.grenselinjeIds = [...allGrenselinjeIds]
  if (allGrenselinjeIds.size === 0) {
    throw new SoapError(
      "extractCurveDirections",
      502,
      "Fant ingen grenselinjeId i Teig.flate.exterior.curveDirections",
    )
  }
  console.log(
    `[matrikkel] ${teigItems.length} teig(er), ${allGrenselinjeIds.size} unike grenselinjeId(er)`,
  )

  // 5. Batch-hent alle grenselinjer. Feltet heter `grenselinjeId` i Teig-
  // responsen, men den formelle UML-klassen er `Teiggrense` (per
  // kartverket/matrikkel-arkitektur), så type-attributtet må være
  // `TeiggrenseId`.
  const grenseResp = await storeGetObjects(
    cfg,
    [...allGrenselinjeIds],
    "TeiggrenseId",
    "getGrenselinjer",
  )
  const grenseReturn = findKey(grenseResp, "return")
  const grenseItems =
    grenseReturn && typeof grenseReturn === "object"
      ? asArray((grenseReturn as any).item)
      : []

  const grenselinjeMap = new Map<string, Vertex[]>()
  for (const g of grenseItems) {
    const idNode = (g as any).id
    const id =
      idNode && typeof idNode === "object" ? (idNode as any).value : undefined
    if (id == null) continue
    const points = extractKurvepunkter(g)
    if (points.length > 0) {
      grenselinjeMap.set(String(id), points)
    }
  }
  console.log(
    `[matrikkel] grenselinjeMap har ${grenselinjeMap.size} av ${allGrenselinjeIds.size} forespurte grenselinjer med koordinater`,
  )

  // 6. Bygg polygon per teig
  const polygons: any[] = []
  for (let i = 0; i < teigItems.length; i++) {
    const teigId = teigIds[i] ?? `teig-${i}`
    const poly = buildPolygonForTeig(teigItems[i], grenselinjeMap, teigId)
    if (poly) polygons.push(poly)
  }
  const boundary = buildBoundaryFeature(polygons)
  if (!boundary) {
    throw new SoapError(
      "buildBoundary",
      502,
      `Klarte ikke å stitche polygon (${grenselinjeMap.size}/${allGrenselinjeIds.size} grenselinjer hentet)`,
    )
  }

  // 7. Bygninger: matrikkel-SOAP gir ikke fotavtrykk — bare punkter.
  // Returner tom FeatureCollection. Fotavtrykk må komme fra Geonorge
  // FKB-Bygning WFS i en senere fase.
  const buildings = buildBuildingsFeatureCollection(null)

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
    `[matrikkel] ${FN_VERSION} config: user=${maskedUser} (len=${username.length}), pwLen=${password.length}, url=${apiUrl}`,
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
