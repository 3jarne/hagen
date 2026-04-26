import type { Feature, Polygon, Position } from "geojson"
import type { LngLatBoundsLike } from "mapbox-gl"

/**
 * Fog of war: en sirkel rundt prosjektets center-koordinater som
 * begrenser hvor brukeren kan panorere og tegne. Alt utenfor sirkelen
 * dimmes med en mørk maske.
 *
 * For v0.4 brukes en sirkel som approksimasjon. I v0.5 vil dette byttes
 * til faktisk eiendomsgrense + 100m buffer (matrikkel-API).
 */

export const FOG_RADIUS_METERS = 500
const EARTH_RADIUS_METERS = 6_371_000
const CIRCLE_SEGMENTS = 96

/** Beregn ringen som approksimerer en sirkel med gitt radius (i meter). */
function circleRing(
  center: [number, number],
  radiusMeters: number,
  segments: number = CIRCLE_SEGMENTS,
): Position[] {
  const [lng, lat] = center
  const latRad = (lat * Math.PI) / 180
  const dLat = ((radiusMeters / EARTH_RADIUS_METERS) * 180) / Math.PI
  const dLng =
    ((radiusMeters / (EARTH_RADIUS_METERS * Math.cos(latRad))) * 180) / Math.PI

  const ring: Position[] = []
  for (let i = 0; i < segments; i++) {
    const angle = (i / segments) * 2 * Math.PI
    ring.push([lng + Math.cos(angle) * dLng, lat + Math.sin(angle) * dLat])
  }
  ring.push(ring[0])
  return ring
}

/**
 * Polygon for fog-masken: en stor rektangulær ytring med sirkelen som
 * hull. Mapbox tegner alt mellom de to ringene som mørk overflate.
 */
export function fogMaskPolygon(
  center: [number, number],
  radiusMeters: number = FOG_RADIUS_METERS,
): Feature<Polygon> {
  const hole = circleRing(center, radiusMeters)
  // Hull skal være motsatt vinding av ytre ring (CW vs CCW). Ytre ring
  // her er CCW, så vi reverserer hullet.
  hole.reverse()

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
      coordinates: [outer, hole],
    },
  }
}

/**
 * Fade-bånd som ligger innenfor hovedmasken og gir en mykere overgang.
 * Mapbox-polygoner støtter ikke gradient-fyll, så vi simulerer det med
 * mange tynne bånd der opacity følger en smoothstep-kurve. Fade-sonen
 * dekker ytterste 30% av radius, fra ~70% av radius og ut til kanten.
 */
const FADE_BANDS = 30
const FADE_WIDTH_FRACTION = 0.3
const MAX_FOG_OPACITY = 0.55

export function fogFadeRings(
  center: [number, number],
  radiusMeters: number = FOG_RADIUS_METERS,
): Feature<Polygon>[] {
  const fadeWidth = radiusMeters * FADE_WIDTH_FRACTION
  const innerEdge = radiusMeters - fadeWidth

  // Pre-beregn ringene én gang slik at naboband deler nøyaktig samme
  // koordinater på sin felles grense (ingen hårlinje-mellomrom).
  const ringRadii: number[] = []
  for (let i = 0; i <= FADE_BANDS; i++) {
    ringRadii.push(innerEdge + (i / FADE_BANDS) * fadeWidth)
  }
  const rings = ringRadii.map((r) => circleRing(center, r))

  const features: Feature<Polygon>[] = []
  for (let i = 0; i < FADE_BANDS; i++) {
    const t = (i + 0.5) / FADE_BANDS
    // Smoothstep S-kurve: 3t² - 2t³.
    const eased = t * t * (3 - 2 * t)
    const opacity = eased * MAX_FOG_OPACITY

    const outer = rings[i + 1]
    const inner = [...rings[i]].reverse()
    features.push({
      type: "Feature",
      properties: { opacity },
      geometry: {
        type: "Polygon",
        coordinates: [outer, inner],
      },
    })
  }
  return features
}

/** Bbox rundt fog-sirkelen — brukes som Mapbox maxBounds. */
export function fogMaxBounds(
  center: [number, number],
  radiusMeters: number = FOG_RADIUS_METERS,
): LngLatBoundsLike {
  const [lng, lat] = center
  const latRad = (lat * Math.PI) / 180
  const dLat = ((radiusMeters / EARTH_RADIUS_METERS) * 180) / Math.PI
  const dLng =
    ((radiusMeters / (EARTH_RADIUS_METERS * Math.cos(latRad))) * 180) / Math.PI
  return [
    [lng - dLng, lat - dLat],
    [lng + dLng, lat + dLat],
  ]
}

/** Avstand i meter mellom to lng/lat-punkter (Haversine). */
function distanceMeters(a: Position, b: Position): number {
  const [lng1, lat1] = a
  const [lng2, lat2] = b
  const φ1 = (lat1 * Math.PI) / 180
  const φ2 = (lat2 * Math.PI) / 180
  const Δφ = ((lat2 - lat1) * Math.PI) / 180
  const Δλ = ((lng2 - lng1) * Math.PI) / 180
  const h =
    Math.sin(Δφ / 2) ** 2 +
    Math.cos(φ1) * Math.cos(φ2) * Math.sin(Δλ / 2) ** 2
  return 2 * EARTH_RADIUS_METERS * Math.asin(Math.sqrt(h))
}

/** Er punktet innenfor fog-sirkelen? */
export function isPointInsideFog(
  point: Position,
  center: [number, number],
  radiusMeters: number = FOG_RADIUS_METERS,
): boolean {
  return distanceMeters(point, center) <= radiusMeters
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

/** Er hele feature-geometrien innenfor fog-sirkelen? */
export function isFeatureInsideFog(
  feature: Feature,
  center: [number, number],
  radiusMeters: number = FOG_RADIUS_METERS,
): boolean {
  const geom = feature.geometry
  if (!geom || geom.type === "GeometryCollection") return true
  for (const pos of iterCoords(geom.coordinates)) {
    if (!isPointInsideFog(pos, center, radiusMeters)) return false
  }
  return true
}
