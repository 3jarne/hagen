import type { Feature, Polygon, Position } from "geojson"
import { distanceMeters, formatDistance, formatArea } from "@/lib/measurement"

const CIRCLE_STEPS = 64

function createCirclePolygon(
  center: Position,
  radiusInKm: number
): Position[] {
  const coords: Position[] = []
  for (let i = 0; i < CIRCLE_STEPS; i++) {
    const angle = (i / CIRCLE_STEPS) * 2 * Math.PI
    const dx = radiusInKm * Math.cos(angle)
    const dy = radiusInKm * Math.sin(angle)
    const lat = center[1] + (dy / 6371) * (180 / Math.PI)
    const lng =
      center[0] +
      ((dx / 6371) * (180 / Math.PI)) / Math.cos((center[1] * Math.PI) / 180)
    coords.push([lng, lat])
  }
  coords.push(coords[0])
  return coords
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Ctx = any

interface State {
  polygon: Ctx
  center: Position | null
}

const DrawCircleMode: {
  onSetup: (this: Ctx) => State
  onClick: (this: Ctx, state: State, e: Ctx) => void
  onMouseMove: (this: Ctx, state: State, e: Ctx) => void
  onKeyUp: (this: Ctx, state: State, e: { key: string }) => void
  toDisplayFeatures: (this: Ctx, state: State, geojson: Feature, display: (f: Feature) => void) => void
  onStop: (this: Ctx) => void
  onTrash: (this: Ctx, state: State) => void
} = {
  onSetup(this: Ctx): State {
    const polygon = this.newFeature({
      type: "Feature",
      properties: { isCircle: true },
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
    return { polygon, center: null }
  },

  onClick(this: Ctx, state: State, e: Ctx) {
    if (!state.center) {
      state.center = [e.lngLat.lng, e.lngLat.lat]
    } else {
      // Complete circle
      this.map.fire("draw.measurement.clear", {})
      this.map.fire("draw.create", {
        features: [state.polygon.toGeoJSON()],
      })
      this.changeMode("simple_select")
    }
  },

  onMouseMove(this: Ctx, state: State, e: Ctx) {
    if (!state.center) return
    const cursor: Position = [e.lngLat.lng, e.lngLat.lat]
    const radiusM = distanceMeters(state.center, cursor)
    const radiusKm = radiusM / 1000
    if (radiusKm > 0) {
      const coords = createCirclePolygon(state.center, radiusKm)
      state.polygon.setCoordinates([coords])
    }
    // Fire measurement
    const area = Math.PI * radiusM * radiusM
    this.map.fire("draw.measurement", {
      text: `r = ${formatDistance(radiusM)}\n${formatArea(area)}`,
      lngLat: e.lngLat,
    })
  },

  onKeyUp(this: Ctx, state: State, e: { key: string }) {
    if (e.key === "Escape") {
      this.deleteFeature([state.polygon.id], { silent: true })
      this.map.fire("draw.measurement.clear", {})
      this.changeMode("simple_select")
    }
  },

  toDisplayFeatures(
    this: Ctx,
    _state: State,
    geojson: Feature,
    display: (f: Feature) => void
  ) {
    void _state
    display(geojson)
  },

  onStop(this: Ctx) {
    this.map.fire("draw.measurement.clear", {})
    this.updateUIClasses({ mouse: "none" })
  },

  onTrash(this: Ctx, state: State) {
    this.deleteFeature([state.polygon.id], { silent: true })
    this.map.fire("draw.measurement.clear", {})
    this.changeMode("simple_select")
  },
}

export default DrawCircleMode
