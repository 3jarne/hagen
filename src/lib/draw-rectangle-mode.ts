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

    const mode = this
    const state: {
      rectangle: Ctx
      startPoint: Position | null
      isDragging: boolean
      _down: ((e: Ctx) => void) | null
      _move: ((e: Ctx) => void) | null
      _up: (() => void) | null
    } = {
      rectangle,
      startPoint: null,
      isDragging: false,
      _down: null,
      _move: null,
      _up: null,
    }

    state._down = (e: Ctx) => {
      state.startPoint = [e.lngLat.lng, e.lngLat.lat]
      state.isDragging = true
    }

    state._move = (e: Ctx) => {
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

      const width = distanceMeters(start, [end[0], start[1]])
      const height = distanceMeters(start, [start[0], end[1]])
      const area = width * height
      const midTop: Position = [(start[0] + end[0]) / 2, start[1]]
      mode.map.fire("draw.measurement", {
        text: `${formatDistance(width)} × ${formatDistance(height)}`,
        lngLat: { lng: midTop[0], lat: midTop[1] },
      })
      const center = centroid(ring)
      mode.map.fire("draw.measurement.area", {
        text: formatArea(area),
        centroid: center,
      })
    }

    state._up = () => {
      if (!state.isDragging || !state.startPoint) return
      state.isDragging = false
      const coords = state.rectangle.getCoordinates()
      if (coords[0] && coords[0].length >= 5) {
        const ring = coords[0] as Position[]
        const w = distanceMeters(ring[0], ring[1])
        const h = distanceMeters(ring[0], ring[3])
        if (w > 0.3 && h > 0.3) {
          mode.map.fire("draw.measurement.clear", {})
          mode.changeMode("simple_select", {
            featureIds: [state.rectangle.id],
          })
          return
        }
      }
      state.startPoint = null
      state.rectangle.setCoordinates([[]])
      mode.map.fire("draw.measurement.clear", {})
    }

    this.map.on("mousedown", state._down)
    this.map.on("mousemove", state._move)
    this.map.on("mouseup", state._up)

    return state
  },

  onStop(this: Ctx, state: Ctx) {
    if (state._down) this.map.off("mousedown", state._down)
    if (state._move) this.map.off("mousemove", state._move)
    if (state._up) this.map.off("mouseup", state._up)
    this.map.fire("draw.measurement.clear", {})
    this.updateUIClasses({ mouse: "none" })
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

  onTrash(this: Ctx, state: Ctx) {
    this.deleteFeature([state.rectangle.id], { silent: true })
    this.map.fire("draw.measurement.clear", {})
    this.changeMode("simple_select")
  },
}

export default DrawRectangleMode
