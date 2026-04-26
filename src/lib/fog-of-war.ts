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
 * Hver ring har sin egen opacity slik at fog-grensen ikke føles som en
 * skarp kant. Bånd-bredden er 15% av radius, totalt fire bånd.
 */
export function fogFadeRings(
  center: [number, number],
  radiusMeters: number = FOG_RADIUS_METERS,
): Feature<Polygon>[] {
  const bandWidth = radiusMeters * 0.04
  const bands = [
    { offset: 0, opacity: 0.42 },
    { offset: 1, opacity: 0.3 },
    { offset: 2, opacity: 0.18 },
    { offset: 3, opacity: 0.08 },
  ]
  return bands.map(({ offset, opacity }) => {
    const outerR = radiusMeters - offset * bandWidth
    const innerR = radiusMeters - (offset + 1) * bandWidth
    const outer = circleRing(center, outerR)
    const inner = circleRing(center, innerR)
    inner.reverse()
    return {
      type: "Feature",
      properties: { opacity },
      geometry: {
        type: "Polygon",
        coordinates: [outer, inner],
      },
    }
  })
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
