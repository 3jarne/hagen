import type { Position } from "geojson"

/** Haversine distance between two [lng, lat] points, in meters */
export function distanceMeters(a: Position, b: Position): number {
  const R = 6371000
  const dLat = ((b[1] - a[1]) * Math.PI) / 180
  const dLng = ((b[0] - a[0]) * Math.PI) / 180
  const sinLat = Math.sin(dLat / 2)
  const sinLng = Math.sin(dLng / 2)
  const x =
    sinLat * sinLat +
    Math.cos((a[1] * Math.PI) / 180) *
      Math.cos((b[1] * Math.PI) / 180) *
      sinLng *
      sinLng
  return R * 2 * Math.atan2(Math.sqrt(x), Math.sqrt(1 - x))
}

/** Area of a closed polygon ring in square meters (Shoelace formula with lat/lng→m projection) */
export function polygonAreaSqm(ring: Position[]): number {
  const n = ring.length
  if (n < 4) return 0 // need 3 unique points + closing point
  const avgLat =
    ring.slice(0, n - 1).reduce((s, c) => s + c[1], 0) / (n - 1)
  const mLat = 111320
  const mLng = 111320 * Math.cos((avgLat * Math.PI) / 180)
  let area = 0
  for (let i = 0; i < n - 1; i++) {
    const j = i + 1
    area += ring[i][0] * ring[j][1] - ring[j][0] * ring[i][1]
  }
  return Math.abs(area / 2) * mLng * mLat
}

/** Centroid of a closed polygon ring */
export function centroid(ring: Position[]): Position {
  const n = ring.length - 1 // exclude closing point
  if (n <= 0) return [0, 0]
  let cx = 0
  let cy = 0
  for (let i = 0; i < n; i++) {
    cx += ring[i][0]
    cy += ring[i][1]
  }
  return [cx / n, cy / n]
}

export function formatArea(sqm: number): string {
  if (sqm >= 10000) return `${(sqm / 10000).toFixed(2)} ha`
  if (sqm >= 1) return `${Math.round(sqm)} m²`
  return `${sqm.toFixed(2)} m²`
}

export function formatDistance(m: number): string {
  if (m >= 1000) return `${(m / 1000).toFixed(1)} km`
  if (m >= 1) return `${m.toFixed(1)} m`
  return `${(m * 100).toFixed(0)} cm`
}
