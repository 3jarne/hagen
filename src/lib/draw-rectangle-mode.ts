import type { Feature, Polygon, Position } from "geojson"
import { distanceMeters, formatDistance, formatArea } from "@/lib/measurement"

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Ctx = any

interface State {
  rectangle: Ctx
  firstPoint: Position | null
}

const DrawRectangleMode: {
  onSetup: (this: Ctx) => State
  onClick: (this: Ctx, state: State, e: Ctx) => void
  onMouseMove: (this: Ctx, state: State, e: Ctx) => void
  onKeyUp: (this: Ctx, state: State, e: { key: string }) => void
  toDisplayFeatures: (this: Ctx, state: State, geojson: Feature, display: (f: Feature) => void) => void
  onStop: (this: Ctx) => void
  onTrash: (this: Ctx, state: State) => void
} = {
  onSetup(this: Ctx): State {
    const rectangle = this.newFeature({
      type: "Feature",
      properties: {},
      geometry: { type: "Polygon", coordinates: [[]] },
    } as Feature<Polygon>)
    this.addFeature(rectangle)
    this.clearSelectedFeatures()
    this.updateUIClasses({ mouse: "add" })
    this.setActionableState({
      trash: true,
      combineFeatures: false,
      uncombineFeatures: false,
    })
    return { rectangle, firstPoint: null }
  },

  onClick(this: Ctx, state: State, e: Ctx) {
    if (!state.firstPoint) {
      state.firstPoint = [e.lngLat.lng, e.lngLat.lat]
    } else {
      // Complete rectangle
      this.map.fire("draw.measurement.clear", {})
      this.map.fire("draw.create", {
        features: [state.rectangle.toGeoJSON()],
      })
      this.changeMode("simple_select")
    }
  },

  onMouseMove(this: Ctx, state: State, e: Ctx) {
    if (!state.firstPoint) return
    const start = state.firstPoint
    const end: Position = [e.lngLat.lng, e.lngLat.lat]
    state.rectangle.setCoordinates([
      [start, [end[0], start[1]], end, [start[0], end[1]], start],
    ])
    // Calculate and fire measurement
    const width = distanceMeters(start, [end[0], start[1]])
    const height = distanceMeters(start, [start[0], end[1]])
    const area = width * height
    this.map.fire("draw.measurement", {
      text: `${formatDistance(width)} × ${formatDistance(height)}\n${formatArea(area)}`,
      lngLat: e.lngLat,
    })
  },

  onKeyUp(this: Ctx, state: State, e: { key: string }) {
    if (e.key === "Escape") {
      this.deleteFeature([state.rectangle.id], { silent: true })
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
    this.deleteFeature([state.rectangle.id], { silent: true })
    this.map.fire("draw.measurement.clear", {})
    this.changeMode("simple_select")
  },
}

export default DrawRectangleMode
