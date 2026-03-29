import type { Feature, Polygon, Position } from "geojson"
import { distanceMeters, centroid, formatDistance, formatArea } from "@/lib/measurement"

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Ctx = any

interface State {
  rectangle: Ctx
  startPoint: Position | null
  isDragging: boolean
}

const DrawRectangleMode = {
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
    return { rectangle, startPoint: null, isDragging: false }
  },

  onMouseDown(this: Ctx, state: State, e: Ctx) {
    state.startPoint = [e.lngLat.lng, e.lngLat.lat]
    state.isDragging = true
  },

  onMouseMove(this: Ctx, state: State, e: Ctx) {
    if (!state.isDragging || !state.startPoint) return
    const start = state.startPoint
    const end: Position = [e.lngLat.lng, e.lngLat.lat]
    const ring: Position[] = [
      start,
      [end[0], start[1]],
      end,
      [start[0], end[1]],
      start,
    ]
    state.rectangle.setCoordinates([ring])

    // Measurements
    const width = distanceMeters(start, [end[0], start[1]])
    const height = distanceMeters(start, [start[0], end[1]])
    const area = width * height

    // Segment label at midpoint of the edge closest to cursor
    const midTop: Position = [(start[0] + end[0]) / 2, start[1]]
    this.map.fire("draw.measurement", {
      text: `${formatDistance(width)} × ${formatDistance(height)}`,
      lngLat: { lng: midTop[0], lat: midTop[1] },
    })

    // Area at centroid
    const center = centroid(ring)
    this.map.fire("draw.measurement.area", {
      text: formatArea(area),
      centroid: center,
    })
  },

  onMouseUp(this: Ctx, state: State) {
    if (!state.isDragging || !state.startPoint) return
    state.isDragging = false

    const coords = state.rectangle.getCoordinates()
    if (coords[0] && coords[0].length >= 5) {
      // Check minimum size
      const ring = coords[0] as Position[]
      const w = distanceMeters(ring[0], ring[1])
      const h = distanceMeters(ring[0], ring[3])
      if (w > 0.5 && h > 0.5) {
        this.map.fire("draw.measurement.clear", {})
        this.changeMode("simple_select", {
          featureIds: [state.rectangle.id],
        })
        return
      }
    }
    // Too small — reset for another attempt
    state.startPoint = null
    state.rectangle.setCoordinates([[]])
    this.map.fire("draw.measurement.clear", {})
  },

  // Ignore clicks — we use mousedown/up
  onClick() {},

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
