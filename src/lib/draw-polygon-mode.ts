import MapboxDraw from "@mapbox/mapbox-gl-draw"
import type { Feature, Position } from "geojson"
import {
  distanceMeters,
  polygonAreaSqm,
  centroid,
  formatDistance,
  formatArea,
} from "@/lib/measurement"

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Ctx = any
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const basePolygon: any = MapboxDraw.modes.draw_polygon

/** Check if cursor is within close-distance of the first vertex */
function isNearFirstVertex(
  map: Ctx,
  cursorLngLat: { lng: number; lat: number },
  firstCoord: Position
): boolean {
  const cursorPt = map.project([cursorLngLat.lng, cursorLngLat.lat])
  const firstPt = map.project(firstCoord)
  const dx = cursorPt.x - firstPt.x
  const dy = cursorPt.y - firstPt.y
  return dx * dx + dy * dy < 15 * 15 // 15px threshold
}

const DrawPolygonMode = {
  ...basePolygon,

  onMouseMove(this: Ctx, state: Ctx, e: Ctx) {
    basePolygon.onMouseMove.call(this, state, e)

    // Track whether cursor is near the first vertex (for close indicator)
    if (state.currentVertexPosition >= 3) {
      const coords: Position[] = state.polygon.getCoordinates()[0]
      const firstCoord = coords[0]
      if (firstCoord) {
        state.nearFirstVertex = isNearFirstVertex(
          this.map,
          e.lngLat,
          firstCoord
        )
      }
    } else {
      state.nearFirstVertex = false
    }

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

  toDisplayFeatures(
    this: Ctx,
    state: Ctx,
    geojson: Feature,
    display: (f: Feature) => void
  ) {
    const isActivePolygon =
      geojson.properties!.id === state.polygon.id

    if (!isActivePolygon) {
      geojson.properties!.active = "false"
      return display(geojson)
    }

    geojson.properties!.active = "true"

    // Don't render until we have at least 3 coordinates
    if (
      !geojson.geometry ||
      geojson.geometry.type !== "Polygon" ||
      geojson.geometry.coordinates.length === 0
    )
      return

    const ring = geojson.geometry.coordinates[0]
    const coordinateCount = ring.length
    if (coordinateCount < 3) return

    // First vertex — highlight when cursor is near (close indicator)
    const firstVertexProps: Record<string, unknown> = {
      meta: "vertex",
      parent: state.polygon.id,
      coord_path: "0.0",
      active: "false",
    }
    if (state.nearFirstVertex && state.currentVertexPosition >= 3) {
      firstVertexProps.close_indicator = "true"
    }
    display({
      type: "Feature",
      properties: firstVertexProps,
      geometry: { type: "Point", coordinates: ring[0] },
    })

    // Last placed vertex
    if (coordinateCount > 3) {
      const endPos = coordinateCount - 3
      display({
        type: "Feature",
        properties: {
          meta: "vertex",
          parent: state.polygon.id,
          coord_path: `0.${endPos}`,
          active: "false",
        },
        geometry: { type: "Point", coordinates: ring[endPos] },
      })
    }

    // Always render as LineString during drawing (no fill preview)
    // The line goes through all placed points + cursor position
    const lineCoords = ring.slice(0, coordinateCount - 1) // exclude closing duplicate
    if (lineCoords.length >= 2) {
      display({
        type: "Feature",
        properties: {
          ...geojson.properties,
          meta: "feature",
        },
        geometry: {
          type: "LineString",
          coordinates: lineCoords,
        },
      })
    }
  },
}

export default DrawPolygonMode
