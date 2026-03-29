import type { Feature, Polygon, Position } from "geojson"

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type DrawContext = any

const DrawRectangleDrag: {
  onSetup: (this: DrawContext) => unknown
  onMouseDown: (this: DrawContext, state: DrawContext, e: DrawContext) => void
  onMouseMove: (this: DrawContext, state: DrawContext, e: DrawContext) => void
  onMouseUp: (this: DrawContext, state: DrawContext) => void
  onKeyUp: (this: DrawContext, state: DrawContext, e: { key: string }) => void
  toDisplayFeatures: (this: DrawContext, state: DrawContext, geojson: Feature, display: (f: Feature) => void) => void
  onStop: (this: DrawContext) => void
  onTrash: (this: DrawContext, state: DrawContext) => void
} = {
  onSetup(this: DrawContext) {
    const rectangle = this.newFeature({
      type: "Feature",
      properties: {},
      geometry: {
        type: "Polygon",
        coordinates: [[]],
      },
    } as Feature<Polygon>)
    this.addFeature(rectangle)
    this.clearSelectedFeatures()
    this.updateUIClasses({ mouse: "add" })
    this.setActionableState({
      trash: true,
      combineFeatures: false,
      uncombineFeatures: false,
    })
    this.map.dragPan.disable()
    return {
      rectangle,
      startPoint: null as Position | null,
      dragging: false,
    }
  },

  onMouseDown(this: DrawContext, state: DrawContext, e: DrawContext) {
    state.startPoint = [e.lngLat.lng, e.lngLat.lat]
    state.dragging = true
  },

  onMouseMove(this: DrawContext, state: DrawContext, e: DrawContext) {
    if (!state.dragging || !state.startPoint) return
    const start = state.startPoint as Position
    const end: Position = [e.lngLat.lng, e.lngLat.lat]
    state.rectangle.setCoordinates([
      [
        start,
        [end[0], start[1]],
        end,
        [start[0], end[1]],
        start,
      ],
    ])
  },

  onMouseUp(this: DrawContext, state: DrawContext) {
    if (!state.dragging || !state.startPoint) return
    state.dragging = false
    // Only create if rectangle has area
    const coords = state.rectangle.getCoordinates()
    if (coords[0] && coords[0].length >= 4) {
      this.map.fire("draw.create", {
        features: [state.rectangle.toGeoJSON()],
      })
    } else {
      this.deleteFeature([state.rectangle.id], { silent: true })
    }
    this.map.dragPan.enable()
    this.changeMode("simple_select")
  },

  onKeyUp(this: DrawContext, state: DrawContext, e: { key: string }) {
    if (e.key === "Escape") {
      this.deleteFeature([state.rectangle.id], { silent: true })
      this.map.dragPan.enable()
      this.changeMode("simple_select")
    }
  },

  toDisplayFeatures(
    this: DrawContext,
    _state: DrawContext,
    geojson: Feature,
    display: (f: Feature) => void
  ) {
    void _state
    display(geojson)
  },

  onStop(this: DrawContext) {
    this.map.dragPan.enable()
    this.updateUIClasses({ mouse: "none" })
  },

  onTrash(this: DrawContext, state: DrawContext) {
    this.deleteFeature([state.rectangle.id], { silent: true })
    this.map.dragPan.enable()
    this.changeMode("simple_select")
  },
}

export default DrawRectangleDrag
