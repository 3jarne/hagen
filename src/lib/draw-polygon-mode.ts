import MapboxDraw from "@mapbox/mapbox-gl-draw"
import type { Position } from "geojson"
import { distanceMeters, polygonAreaSqm, centroid, formatDistance, formatArea } from "@/lib/measurement"

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Ctx = any
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const basePolygon: any = MapboxDraw.modes.draw_polygon

const DrawPolygonMode = {
  ...basePolygon,

  onMouseMove(this: Ctx, state: Ctx, e: Ctx) {
    basePolygon.onMouseMove.call(this, state, e)

    if (state.currentVertexPosition > 0) {
      const coords: Position[] = state.polygon.getCoordinates()[0]
      const lastPlaced = coords[state.currentVertexPosition - 1]
      if (!lastPlaced) return

      const cursor: Position = [e.lngLat.lng, e.lngLat.lat]
      const d = distanceMeters(lastPlaced, cursor)

      // Position popup at midpoint of current segment
      const mid: Position = [
        (lastPlaced[0] + cursor[0]) / 2,
        (lastPlaced[1] + cursor[1]) / 2,
      ]
      this.map.fire("draw.measurement", {
        text: formatDistance(d),
        lngLat: { lng: mid[0], lat: mid[1] },
      })

      // Show area at centroid if 3+ placed vertices
      if (state.currentVertexPosition >= 3) {
        const areaRing = [
          ...coords.slice(0, state.currentVertexPosition),
          cursor,
          coords[0],
        ]
        const area = polygonAreaSqm(areaRing)
        const center = centroid(areaRing)
        this.map.fire("draw.measurement.area", {
          text: formatArea(area),
          centroid: center,
        })
      }
    }
  },

  clickOnVertex(this: Ctx, state: Ctx) {
    this.map.fire("draw.measurement.clear", {})
    return basePolygon.clickOnVertex.call(this, state)
  },

  onStop(this: Ctx, state: Ctx) {
    this.map.fire("draw.measurement.clear", {})
    if (basePolygon.onStop) basePolygon.onStop.call(this, state)
  },

  onKeyUp(this: Ctx, state: Ctx, e: Ctx) {
    if (e.key === "Escape") {
      this.map.fire("draw.measurement.clear", {})
      this.deleteFeature([state.polygon.id], { silent: true })
      this.changeMode("simple_select")
      return
    }
    if (basePolygon.onKeyUp) basePolygon.onKeyUp.call(this, state, e)
  },
}

export default DrawPolygonMode
