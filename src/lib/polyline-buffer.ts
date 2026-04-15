import type { Position } from "geojson"

/**
 * Buffer a LineString into a closed Polygon ring with the given width in meters.
 * Uses perpendicular offset at each vertex (averaged direction for interior joints).
 * Returns a closed ring: [leftSide..., rightSide.reversed(), leftSide[0]]
 */
export function bufferPolyline(coords: Position[], widthMeters: number): Position[] {
  if (coords.length < 2) return []

  const halfWidthKm = widthMeters / 2 / 1000
  const leftSide: Position[] = []
  const rightSide: Position[] = []

  for (let i = 0; i < coords.length; i++) {
    const curr = coords[i]
    const prev = i > 0 ? coords[i - 1] : null
    const next = i < coords.length - 1 ? coords[i + 1] : null

    // Compute averaged direction vector
    let dx = 0, dy = 0
    if (prev && next) {
      const dx1 = curr[0] - prev[0]
      const dy1 = curr[1] - prev[1]
      const dx2 = next[0] - curr[0]
      const dy2 = next[1] - curr[1]
      const len1 = Math.hypot(dx1, dy1) || 1
      const len2 = Math.hypot(dx2, dy2) || 1
      // Normalize then average for better corner behavior
      dx = (dx1 / len1 + dx2 / len2) / 2
      dy = (dy1 / len1 + dy2 / len2) / 2
    } else if (prev) {
      dx = curr[0] - prev[0]
      dy = curr[1] - prev[1]
    } else if (next) {
      dx = next[0] - curr[0]
      dy = next[1] - curr[1]
    }

    const len = Math.hypot(dx, dy) || 1
    // Perpendicular (rotate 90°)
    const nx = -dy / len
    const ny = dx / len

    // Convert halfWidthKm to degrees at this latitude
    const mPerDegLat = 111.32
    const mPerDegLng = 111.32 * Math.cos((curr[1] * Math.PI) / 180)
    const offsetLng = (nx * halfWidthKm) / mPerDegLng
    const offsetLat = (ny * halfWidthKm) / mPerDegLat

    leftSide.push([curr[0] + offsetLng, curr[1] + offsetLat])
    rightSide.push([curr[0] - offsetLng, curr[1] - offsetLat])
  }

  const ring = [...leftSide, ...rightSide.reverse()]
  ring.push(ring[0]) // close
  return ring
}

/**
 * Compute total length of a polyline in meters.
 */
export function polylineLengthMeters(coords: Position[]): number {
  let total = 0
  for (let i = 1; i < coords.length; i++) {
    const a = coords[i - 1]
    const b = coords[i]
    const dLat = (b[1] - a[1]) * 111320
    const dLng = (b[0] - a[0]) * 111320 * Math.cos((a[1] * Math.PI) / 180)
    total += Math.hypot(dLat, dLng)
  }
  return total
}
