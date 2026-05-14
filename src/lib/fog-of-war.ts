import type { Feature, MultiPolygon, Polygon, Position } from "geojson"
import type { LngLatBoundsLike } from "mapbox-gl"
import buffer from "@turf/buffer"
import bbox from "@turf/bbox"
import booleanPointInPolygon from "@turf/boolean-point-in-polygon"

/**
 * Fog of war: en geometrisk buffer rundt eiendomsgrensen som begrenser
 * hvor brukeren kan panorere og tegne. Alt utenfor buffer-polygonet
 * dimmes med en mørk maske.
 *
 * v0.5: tar inn faktisk eiendomsgrense (fra matrikkel) + 100m buffer.
 * Erstatter den eldre sirkel-approksimasjonen fra v0.4.
 */

export const FOG_BUFFER_METERS = 100
const FADE_BANDS = 20
const FADE_WIDTH_METERS = 30
const MAX_FOG_OPACITY = 0.55

type Poly = Feature<Polygon | MultiPolygon>

const EARTH_RADIUS_METERS = 6_371_000
const FALLBACK_CIRCLE_RADIUS_M = 400
const FALLBACK_CIRCLE_SEGMENTS = 64

/**
 * Fallback for prosjekter uten matrikkel-grense (opprettet før v0.5):
 * en sirkel rundt center som brukes som "syntetisk grense". Gir samme
 * effekt som den gamle v0.4-sirkelen når kombinert med 100m buffer.
 */
export function fallbackCircleBoundary(
  center: [number, number],
  radiusMeters: number = FALLBACK_CIRCLE_RADIUS_M,
): Feature<Polygon> {
  const [lng, lat] = center
  const latRad = (lat * Math.PI) / 180
  const dLat = ((radiusMeters / EARTH_RADIUS_METERS) * 180) / Math.PI
  const dLng =
    ((radiusMeters / (EARTH_RADIUS_METERS * Math.cos(latRad))) * 180) / Math.PI
  const ring: Position[] = []
  for (let i = 0; i < FALLBACK_CIRCLE_SEGMENTS; i++) {
    const a = (i / FALLBACK_CIRCLE_SEGMENTS) * 2 * Math.PI
    ring.push([lng + Math.cos(a) * dLng, lat + Math.sin(a) * dLat])
  }
  ring.push(ring[0])
  return {
    type: "Feature",
    properties: {},
    geometry: { type: "Polygon", coordinates: [ring] },
  }
}

/** Beregn buffer-polygonet (eiendomsgrense + N meter utover). */
export function bufferedBoundary(
  boundary: Feature<Polygon>,
  bufferMeters: number = FOG_BUFFER_METERS,
): Poly {
  return buffer(boundary, bufferMeters, { units: "meters" }) as Poly
}

/** Hent ut alle ringer (outer + holes) som Position[][] fra en Polygon/MultiPolygon. */
function extractRings(poly: Poly): Position[][] {
  const g = poly.geometry
  if (g.type === "Polygon") return g.coordinates
  // For MultiPolygon: bruk ytre ring av hver del. Indre hull droppes for masken
  // (sjelden relevant for fog-of-war på en eiendom).
  return g.coordinates.map((part) => part[0])
}

/**
 * Polygon for fog-masken: en stor rektangulær ytring med buffer-polygonet
 * som hull. Mapbox tegner alt mellom de to ringene som mørk overflate.
 */
export function fogMaskPolygon(buffered: Poly): Feature<Polygon> {
  const rings = extractRings(buffered)
  // Sett alle utvendige ringer som hull (reversert for korrekt winding).
  const holes = rings.map((r) => [...r].reverse())

  const outer: Position[] = [
    [-180, -85],
    [180, -85],
    [180, 85],
    [-180, 85],
    [-180, -85],
  ]

  return {
    type: "Feature",
    properties: {},
    geometry: {
      type: "Polygon",
      coordinates: [outer, ...holes],
    },
  }
}

/**
 * Fade-bånd innenfor buffer-kanten som gir en mykere overgang fra synlig
 * eiendom til mørk fog. Implementeres som N konsentriske ringer mellom
 * negativ-buffer (innover fra kanten) og kanten selv.
 */
export function fogFadeRings(
  boundary: Feature<Polygon>,
  bufferMeters: number = FOG_BUFFER_METERS,
): Feature<Polygon>[] {
  // Lag N+1 ringer mellom (buffer - fadeWidth) og buffer, alle utenfor eiendommen.
  const startBuf = Math.max(0, bufferMeters - FADE_WIDTH_METERS)
  const ringPolys: Poly[] = []
  for (let i = 0; i <= FADE_BANDS; i++) {
    const t = i / FADE_BANDS
    const b = startBuf + t * (bufferMeters - startBuf)
    const bp = buffer(boundary, b, { units: "meters" }) as Poly | undefined
    if (bp) ringPolys.push(bp)
  }

  const features: Feature<Polygon>[] = []
  for (let i = 0; i < ringPolys.length - 1; i++) {
    const innerRings = extractRings(ringPolys[i])
    const outerRings = extractRings(ringPolys[i + 1])
    // Bånd i: ytre ring fra ringPolys[i+1], hull fra ringPolys[i].
    const t = (i + 0.5) / (ringPolys.length - 1)
    const eased = t * t * (3 - 2 * t)
    const opacity = eased * MAX_FOG_OPACITY

    for (const outer of outerRings) {
      // For hvert utvendig ring i ytterpolygonet, lag bånd. (Vi antar 1:1
      // mellom ringPolys[i] og ringPolys[i+1]; ved MultiPolygon brukes
      // første del kun.)
      const holes = innerRings.map((r) => [...r].reverse())
      features.push({
        type: "Feature",
        properties: { opacity },
        geometry: {
          type: "Polygon",
          coordinates: [outer, ...holes],
        },
      })
    }
  }
  return features
}

/** Bbox rundt buffer-polygonet — brukes som Mapbox maxBounds. */
export function fogMaxBounds(buffered: Poly): LngLatBoundsLike {
  const [west, south, east, north] = bbox(buffered)
  return [
    [west, south],
    [east, north],
  ]
}

/** Er punktet innenfor buffer-polygonet? */
export function isPointInsideFog(
  point: Position,
  buffered: Poly,
): boolean {
  return booleanPointInPolygon(point, buffered)
}

/** Itererer alle koordinater i en geometri og returnerer dem flatt. */
function* iterCoords(coords: unknown): Generator<Position> {
  if (!Array.isArray(coords)) return
  if (typeof coords[0] === "number") {
    yield coords as Position
    return
  }
  for (const c of coords) yield* iterCoords(c)
}

/** Er hele feature-geometrien innenfor buffer-polygonet? */
export function isFeatureInsideFog(
  feature: Feature,
  buffered: Poly,
): boolean {
  const geom = feature.geometry
  if (!geom || geom.type === "GeometryCollection") return true
  for (const pos of iterCoords(geom.coordinates)) {
    if (!isPointInsideFog(pos, buffered)) return false
  }
  return true
}
