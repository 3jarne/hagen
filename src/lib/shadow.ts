import type { Position } from "geojson"
import type { SunInfo } from "@/lib/sun-calc"

/** Object height defaults per garden element type (meters) */
export const OBJECT_HEIGHTS: Record<string, number> = {
  tre: 4,
  busk: 1.5,
  hekk: 1.8,
  bygning: 4,
  // terrasse, bed, gressplen, groennsakhage, dam, sti: no shadow (ground-level)
}

const MAX_SHADOW_M = 100

/** 2D cross product (a→b) × (a→c) */
function cross(o: Position, a: Position, b: Position): number {
  return (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0])
}

/**
 * Convex hull via Andrew's monotone chain.
 * Returns a closed ring (first point repeated at end).
 */
export function convexHull(points: Position[]): Position[] {
  if (points.length < 3) return []
  const sorted = [...points].sort((a, b) => a[0] - b[0] || a[1] - b[1])

  const lower: Position[] = []
  for (const p of sorted) {
    while (
      lower.length >= 2 &&
      cross(lower[lower.length - 2], lower[lower.length - 1], p) <= 0
    ) {
      lower.pop()
    }
    lower.push(p)
  }

  const upper: Position[] = []
  for (let i = sorted.length - 1; i >= 0; i--) {
    const p = sorted[i]
    while (
      upper.length >= 2 &&
      cross(upper[upper.length - 2], upper[upper.length - 1], p) <= 0
    ) {
      upper.pop()
    }
    upper.push(p)
  }

  lower.pop()
  upper.pop()
  const hull = [...lower, ...upper]
  if (hull.length < 3) return []
  hull.push(hull[0])
  return hull
}

/**
 * Project a polygon's shadow at the current sun position.
 * Returns a closed ring representing the shadow footprint, or an empty array
 * when no shadow should be rendered.
 *
 * Approach: displace the polygon vertices by the shadow vector, then take
 * the convex hull of original ∪ displaced. This is exact for convex
 * polygons and a slight over-approximation for non-convex ones.
 */
export function projectObjectShadow(
  ring: Position[],
  heightM: number,
  sun: SunInfo,
): Position[] {
  if (!sun.isAboveHorizon || heightM <= 0 || ring.length < 3) return []
  const shadowLenM = Math.min(heightM / Math.tan(sun.altitudeRad), MAX_SHADOW_M)
  // Shadow points opposite the sun
  const bearingDeg = (sun.azimuthDeg + 180) % 360
  const bearingRad = (bearingDeg * Math.PI) / 180

  // Use the first vertex's latitude for the longitude scaling (small polygons
  // stay within one latitude band; acceptable approximation)
  const centerLat = ring[0][1]
  const dLat = (shadowLenM * Math.cos(bearingRad)) / 111320
  const dLng =
    (shadowLenM * Math.sin(bearingRad)) /
    (111320 * Math.cos((centerLat * Math.PI) / 180))

  const displaced = ring.map(
    (p): Position => [p[0] + dLng, p[1] + dLat],
  )
  return convexHull([...ring, ...displaced])
}
