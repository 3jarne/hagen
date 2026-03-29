import type { Feature, Polygon, Position } from "geojson"
import { distanceMeters, centroid, formatDistance, formatArea } from "@/lib/measurement"

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Ctx = any

const DrawRectangleMode = {
  onSetup(this: Ctx) {
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

    return {
      rectangle,
      startPoint: null as Position | null,
    }
  },

  onMouseDown(this: Ctx, state: Ctx, e: Ctx) {
    state.startPoint = [e.lngLat.lng, e.lngLat.lat]
  },

  onDrag(this: Ctx, state: Ctx, e: Ctx) {
    if (!state.startPoint) return
    const start = state.startPoint as Position
    const end: Position = [e.lngLat.lng, e.lngLat.lat]
    const ring: Position[] = [
      start,
      [end[0], start[1]],
      end,
      [start[0], end[1]],
      start,
    ]
    state.rectangle.incomingCoords([ring])

    const width = distanceMeters(start, [end[0], start[1]])
    const height = distanceMeters(start, [start[0], end[1]])
    const area = width * height
    const midTop: Position = [(start[0] + end[0]) / 2, start[1]]
    this.map.fire("draw.measurement", {
      text: `${formatDistance(width)} × ${formatDistance(height)}`,
      lngLat: { lng: midTop[0], lat: midTop[1] },
    })
    const center = centroid(ring)
    this.map.fire("draw.measurement.area", {
      text: formatArea(area),
      centroid: center,
    })
  },

  onMouseUp(this: Ctx, state: Ctx) {
    if (!state.startPoint) return
    const coords = state.rectangle.getCoordinates()
    if (coords[0] && coords[0].length >= 5) {
      const ring = coords[0] as Position[]
      const w = distanceMeters(ring[0], ring[1])
      const h = distanceMeters(ring[0], ring[3])
      if (w > 0.3 && h > 0.3) {
        this.map.fire("draw.measurement.clear", {})
        this.changeMode("simple_select", {
          featureIds: [state.rectangle.id],
        })
        return
      }
    }
    // Too small — reset for next attempt
    state.startPoint = null
    state.rectangle.setCoordinates([[]])
    this.map.fire("draw.measurement.clear", {})
  },

  onClick() {},

  onKeyUp(this: Ctx, state: Ctx, e: Ctx) {
    if (e.key === "Escape") {
      this.deleteFeature([state.rectangle.id], { silent: true })
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
    if (this.getFeature(state.rectangle.id) === undefined) return
    if (state.rectangle.isValid()) {
      this.fire("draw.create", {
        features: [state.rectangle.toGeoJSON()],
      })
    } else {
      this.deleteFeature([state.rectangle.id], { silent: true })
    }
  },

  onTrash(this: Ctx, state: Ctx) {
    this.deleteFeature([state.rectangle.id], { silent: true })
    this.map.fire("draw.measurement.clear", {})
    this.changeMode("simple_select")
  },
}

export default DrawRectangleMode
