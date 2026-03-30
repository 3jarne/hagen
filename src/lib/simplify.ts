import type { Position } from "geojson"

/**
 * Ramer-Douglas-Peucker line simplification.
 * Reduces the number of points in a polyline while preserving its shape.
 */
export function simplify(points: Position[], epsilon: number): Position[] {
  if (points.length <= 2) return points

  // Find the point with the maximum distance from the line (first → last)
  let maxDist = 0
  let maxIndex = 0
  const first = points[0]
  const last = points[points.length - 1]

  for (let i = 1; i < points.length - 1; i++) {
    const d = perpendicularDistance(points[i], first, last)
    if (d > maxDist) {
      maxDist = d
      maxIndex = i
    }
  }

  if (maxDist > epsilon) {
    const left = simplify(points.slice(0, maxIndex + 1), epsilon)
    const right = simplify(points.slice(maxIndex), epsilon)
    return [...left.slice(0, -1), ...right]
  }

  return [first, last]
}

function perpendicularDistance(
  point: Position,
  lineStart: Position,
  lineEnd: Position
): number {
  const dx = lineEnd[0] - lineStart[0]
  const dy = lineEnd[1] - lineStart[1]
  const lengthSq = dx * dx + dy * dy

  if (lengthSq === 0) {
    const px = point[0] - lineStart[0]
    const py = point[1] - lineStart[1]
    return Math.sqrt(px * px + py * py)
  }

  const num = Math.abs(
    dy * point[0] - dx * point[1] + lineEnd[0] * lineStart[1] - lineEnd[1] * lineStart[0]
  )
  return num / Math.sqrt(lengthSq)
}
