import type { Feature, Polygon, Position } from "geojson"
import { distanceMeters, formatDistance, formatArea } from "@/lib/measurement"

const CIRCLE_STEPS = 64

export function createCirclePolygon(
  center: Position,
  radiusInKm: number,
  opts?: { jagged?: boolean }
): Position[] {
  const coords: Position[] = []
  for (let i = 0; i < CIRCLE_STEPS; i++) {
    const angle = (i / CIRCLE_STEPS) * 2 * Math.PI
    // Deterministic jag: varies radius by ±8% based on vertex angle
    let r = radiusInKm
    if (opts?.jagged) {
      const jag = Math.sin(angle * 7) * 0.04 + Math.sin(angle * 13) * 0.03 + Math.sin(angle * 23) * 0.02
      r = radiusInKm * (1 + jag)
    }
    const dx = r * Math.cos(angle)
    const dy = r * Math.sin(angle)
    const lat = center[1] + (dy / 6371) * (180 / Math.PI)
    const lng =
      center[0] +
      ((dx / 6371) * (180 / Math.PI)) / Math.cos((center[1] * Math.PI) / 180)
    coords.push([lng, lat])
  }
  coords.push(coords[0])
  return coords
}

/**
 * Generate canopy radiating lines from center to edge for a tree/bush circle.
 * Returns an array of LineString coordinate arrays.
 */
export function generateCanopyLines(
  center: Position,
  radiusInKm: number,
  featureId: string,
  lineCount = 8,
): Position[][] {
  const lines: Position[][] = []
  // Seed from feature ID for consistency
  let seed = 0
  for (let i = 0; i < featureId.length; i++) {
    seed = ((seed << 5) - seed + featureId.charCodeAt(i)) | 0
  }
  const pseudoRandom = (i: number) => {
    const x = Math.sin(seed + i * 9301 + 49297) * 0.5 + 0.5
    return x - Math.floor(x)
  }

  for (let i = 0; i < lineCount; i++) {
    const angle = pseudoRandom(i) * 2 * Math.PI
    // Line from ~20% of radius to ~85% of radius
    const r1 = radiusInKm * 0.15
    const r2 = radiusInKm * (0.7 + pseudoRandom(i + 100) * 0.2)
    const point = (r: number): Position => {
      const dx = r * Math.cos(angle)
      const dy = r * Math.sin(angle)
      const lat = center[1] + (dy / 6371) * (180 / Math.PI)
      const lng = center[0] + ((dx / 6371) * (180 / Math.PI)) / Math.cos((center[1] * Math.PI) / 180)
      return [lng, lat]
    }
    lines.push([point(r1), point(r2)])
  }
  return lines
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Ctx = any

const DrawCircleMode = {
  onSetup(this: Ctx, opts: Ctx) {
    const initProps = opts?.initialProperties || {}
    const polygon = this.newFeature({
      type: "Feature",
      properties: { isCircle: true, ...initProps },
      geometry: { type: "Polygon", coordinates: [[]] },
    } as Feature<Polygon>)
    this.addFeature(polygon)
    this.clearSelectedFeatures()
    this.updateUIClasses({ mouse: "add" })
    this.setActionableState({
      trash: true,
      combineFeatures: false,
      uncombineFeatures: false,
    })

    const isGarden = !!initProps.hagenType

    return {
      polygon,
      center: null as Position | null,
      isGarden,
    }
  },

  onMouseDown(this: Ctx, state: Ctx, e: Ctx) {
    state.center = [e.lngLat.lng, e.lngLat.lat]
  },

  onDrag(this: Ctx, state: Ctx, e: Ctx) {
    if (!state.center) return
    const cursor: Position = [e.lngLat.lng, e.lngLat.lat]
    const radiusM = distanceMeters(state.center, cursor)
    const radiusKm = radiusM / 1000
    if (radiusKm > 0) {
      const coords = createCirclePolygon(state.center, radiusKm, { jagged: state.isGarden })
      state.polygon.incomingCoords([coords])
    }
    this.map.fire("draw.measurement", {
      text: `r = ${formatDistance(radiusM)}`,
      lngLat: e.lngLat,
    })
    const area = Math.PI * radiusM * radiusM
    this.map.fire("draw.measurement.area", {
      text: formatArea(area),
      centroid: state.center,
    })
  },

  onMouseUp(this: Ctx, state: Ctx) {
    if (!state.center) return
    const coords = state.polygon.getCoordinates()
    if (coords[0] && coords[0].length > 1) {
      this.map.fire("draw.measurement.clear", {})
      this.changeMode("simple_select", {
        featureIds: [state.polygon.id],
      })
      return
    }
    // Too small — reset for next attempt
    state.center = null
    this.map.fire("draw.measurement.clear", {})
  },

  onClick() {},

  onKeyUp(this: Ctx, state: Ctx, e: Ctx) {
    if (e.key === "Escape") {
      this.deleteFeature([state.polygon.id], { silent: true })
      this.map.fire("draw.measurement.clear", {})
      this.changeMode("simple_select")
    }
  },

  toDisplayFeatures(
    this: Ctx,
    _state: Ctx,
    geojson: Feature,
    display: (f: Feature) => void
  ) {
    void _state
    display(geojson)
  },

  onStop(this: Ctx, state: Ctx) {
    this.updateUIClasses({ mouse: "none" })
    this.map.fire("draw.measurement.clear", {})
    if (this.getFeature(state.polygon.id) === undefined) return
    if (state.polygon.isValid()) {
      this.fire("draw.create", {
        features: [state.polygon.toGeoJSON()],
      })
    } else {
      this.deleteFeature([state.polygon.id], { silent: true })
    }
  },

  onTrash(this: Ctx, state: Ctx) {
    this.deleteFeature([state.polygon.id], { silent: true })
    this.map.fire("draw.measurement.clear", {})
    this.changeMode("simple_select")
  },
}

export default DrawCircleMode
