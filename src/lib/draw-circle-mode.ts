import MapboxDraw from "@mapbox/mapbox-gl-draw"
import type { Feature, Polygon, Position } from "geojson"

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
  coords.push(coords[0]) // close the ring
  return coords
}

function distance(a: Position, b: Position): number {
  const R = 6371
  const dLat = ((b[1] - a[1]) * Math.PI) / 180
  const dLng = ((b[0] - a[0]) * Math.PI) / 180
  const sinLat = Math.sin(dLat / 2)
  const sinLng = Math.sin(dLng / 2)
  const aVal =
    sinLat * sinLat +
    Math.cos((a[1] * Math.PI) / 180) *
      Math.cos((b[1] * Math.PI) / 180) *
      sinLng *
      sinLng
  return R * 2 * Math.atan2(Math.sqrt(aVal), Math.sqrt(1 - aVal))
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type DrawContext = any

const DrawCircle: MapboxDraw.DrawCustomMode = {
  onSetup(this: DrawContext) {
    const polygon = this.newFeature({
      type: "Feature",
      properties: { isCircle: true },
      geometry: {
        type: "Polygon",
        coordinates: [[]],
      },
    } as Feature<Polygon>)
    this.addFeature(polygon)
    this.clearSelectedFeatures()
    this.updateUIClasses({ mouse: "add" })
    this.setActionableState({ trash: true, combineFeatures: false, uncombineFeatures: false })
    return {
      polygon,
      center: null as Position | null,
      radiusInKm: 0,
    }
  },

  onClick(this: DrawContext, state: { polygon: DrawContext; center: Position | null; radiusInKm: number }, e: { lngLat: { lng: number; lat: number } }) {
    if (!state.center) {
      state.center = [e.lngLat.lng, e.lngLat.lat]
    } else {
      state.radiusInKm = distance(state.center, [e.lngLat.lng, e.lngLat.lat])
      const coords = createCirclePolygon(state.center, state.radiusInKm)
      state.polygon.setCoordinates([coords])
      this.map.fire("draw.create", { features: [state.polygon.toGeoJSON()] })
      this.changeMode("simple_select")
    }
  },

  onMouseMove(this: DrawContext, state: { polygon: DrawContext; center: Position | null }, e: { lngLat: { lng: number; lat: number } }) {
    if (state.center) {
      const r = distance(state.center, [e.lngLat.lng, e.lngLat.lat])
      const coords = createCirclePolygon(state.center, r)
      state.polygon.setCoordinates([coords])
    }
  },

  onKeyUp(this: DrawContext, state: { polygon: DrawContext }, e: { key: string }) {
    if (e.key === "Escape") {
      this.deleteFeature([state.polygon.id], { silent: true })
      this.changeMode("simple_select")
    }
  },

  toDisplayFeatures(
    this: DrawContext,
    _state: { polygon: DrawContext },
    geojson: Feature,
    display: (geojson: Feature) => void
  ) {
    void _state
    display(geojson)
  },

  onStop(this: DrawContext, _state: { polygon: DrawContext }) {
    void _state
    this.updateUIClasses({ mouse: "none" })
  },

  onTrash(this: DrawContext, state: { polygon: DrawContext }) {
    this.deleteFeature([state.polygon.id], { silent: true })
    this.changeMode("simple_select")
  },
}

export default DrawCircle
