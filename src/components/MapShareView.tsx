import { useEffect, useRef } from "react"
import mapboxgl from "mapbox-gl"
import "mapbox-gl/dist/mapbox-gl.css"
import type { Feature } from "geojson"
import { CONFIG, hasMapboxToken } from "@/config"
import { centroid } from "@/lib/measurement"
import { distanceMeters } from "@/lib/measurement"
import { generateCanopyLines } from "@/lib/draw-circle-mode"
import {
  addKartverketLayer,
  addTextLabelsLayers,
  addLineFeatureLayers,
  addCanopyLinesLayer,
  addFogOfWarLayer,
  addUserPlotLayer,
} from "@/lib/map-layers"
import {
  fogMaskPolygon,
  fogFadeRings,
  fogMaxBounds,
} from "@/lib/fog-of-war"
import { registerGardenPatterns } from "@/lib/garden-patterns"
import type { DrawingData } from "@/lib/drawings"
import type { MapStyle } from "@/pages/MapPage"
import { GARDEN_ELEMENTS, type GardenElementType } from "@/lib/garden-types"

const MAP_STYLES: Record<MapStyle, string> = {
  satellite: "mapbox://styles/mapbox/satellite-v9",
  street: "mapbox://styles/mapbox/streets-v12",
  terrain: "mapbox://styles/mapbox/outdoors-v12",
}

interface MapShareViewProps {
  projectCenter: [number, number]
  projectZoom: number
  projectGnr: number | null
  projectBnr: number | null
  drawings: DrawingData
  mapStyle: MapStyle
  kartverketVisible: boolean
  kartverketOpacity: number
  onKartverketLoadingChange?: (loading: boolean) => void
}

export function MapShareView({
  projectCenter,
  projectZoom,
  projectGnr,
  projectBnr,
  drawings,
  mapStyle,
  kartverketVisible,
  kartverketOpacity,
  onKartverketLoadingChange,
}: MapShareViewProps) {
  const containerRef = useRef<HTMLDivElement | null>(null)
  const mapRef = useRef<mapboxgl.Map | null>(null)
  const drawingsRef = useRef<DrawingData>(drawings)

  useEffect(() => {
    drawingsRef.current = drawings
    if (mapRef.current) {
      applyDrawings(mapRef.current, drawings)
    }
  }, [drawings])

  // Main setup — runs once.
  useEffect(() => {
    if (!containerRef.current || mapRef.current) return
    if (!hasMapboxToken()) return
    mapboxgl.accessToken = CONFIG.mapboxToken

    const fogMask = fogMaskPolygon(projectCenter)
    const fogFade = fogFadeRings(projectCenter)
    const fogBounds = fogMaxBounds(projectCenter)

    const map = new mapboxgl.Map({
      container: containerRef.current,
      style: MAP_STYLES[mapStyle],
      center: projectCenter,
      zoom: projectZoom,
      maxBounds: fogBounds,
    })
    mapRef.current = map

    map.addControl(new mapboxgl.NavigationControl(), "bottom-right")
    map.addControl(
      new mapboxgl.ScaleControl({ unit: "metric" }),
      "bottom-left",
    )

    map.on("load", () => {
      registerGardenPatterns(map)
      addKartverketLayer(map, {
        visible: kartverketVisible,
        opacity: kartverketOpacity,
      })
      addUserPlotLayer(map, projectGnr, projectBnr)
      addShareDrawLayers(map)
      addCanopyLinesLayer(map)
      addTextLabelsLayers(map)
      addLineFeatureLayers(map)
      addFogOfWarLayer(map, fogMask, fogFade)
      applyDrawings(map, drawingsRef.current)
      attachHoverTooltip(map)
    })

    return () => {
      map.remove()
      mapRef.current = null
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Style switch
  useEffect(() => {
    const map = mapRef.current
    if (!map) return
    const style = MAP_STYLES[mapStyle]
    if (!style) return

    const center = map.getCenter()
    const zoom = map.getZoom()
    map.setStyle(style)

    map.once("style.load", () => {
      registerGardenPatterns(map)
      addKartverketLayer(map, {
        visible: kartverketVisible,
        opacity: kartverketOpacity,
      })
      addUserPlotLayer(map, projectGnr, projectBnr)
      addShareDrawLayers(map)
      addCanopyLinesLayer(map)
      addTextLabelsLayers(map)
      addLineFeatureLayers(map)
      addFogOfWarLayer(
        map,
        fogMaskPolygon(projectCenter),
        fogFadeRings(projectCenter),
      )
      applyDrawings(map, drawingsRef.current)
      attachHoverTooltip(map)
      map.setCenter(center)
      map.setZoom(zoom)
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mapStyle])

  // Kartverket toggle + loading detection
  useEffect(() => {
    const map = mapRef.current
    if (!map) return
    if (!map.getLayer("kartverket-topo")) return
    map.setLayoutProperty(
      "kartverket-topo",
      "visibility",
      kartverketVisible ? "visible" : "none",
    )
    if (kartverketVisible) {
      map.setPaintProperty(
        "kartverket-topo",
        "raster-opacity",
        kartverketOpacity,
      )
    }
    if (!kartverketVisible) {
      onKartverketLoadingChange?.(false)
      return
    }
    if (map.isSourceLoaded("kartverket-topo")) {
      onKartverketLoadingChange?.(false)
      return
    }
    onKartverketLoadingChange?.(true)
    const onIdle = () => {
      onKartverketLoadingChange?.(false)
      map.off("idle", onIdle)
    }
    map.on("idle", onIdle)
    return () => {
      map.off("idle", onIdle)
    }
  }, [kartverketVisible, kartverketOpacity, onKartverketLoadingChange])

  return <div ref={containerRef} className="absolute inset-0" />
}

/* ------------------------------------------------------------------ *
 *  Layer helpers
 * ------------------------------------------------------------------ */

function addShareDrawLayers(map: mapboxgl.Map) {
  if (!map.getSource("share-draw")) {
    map.addSource("share-draw", {
      type: "geojson",
      data: { type: "FeatureCollection", features: [] },
    })
  }
  if (!map.getLayer("share-draw-fill")) {
    map.addLayer({
      id: "share-draw-fill",
      type: "fill",
      source: "share-draw",
      filter: ["==", "$type", "Polygon"],
      paint: {
        "fill-color": ["coalesce", ["get", "fillColor"], "#93c5fd"],
        "fill-opacity": ["coalesce", ["get", "fillOpacity"], 0.4],
      },
    })
  }
  if (!map.getLayer("share-draw-pattern")) {
    map.addLayer({
      id: "share-draw-pattern",
      type: "fill",
      source: "share-draw",
      filter: ["all", ["==", "$type", "Polygon"], ["has", "hagenType"]],
      paint: {
        "fill-pattern": [
          "match",
          ["get", "hagenType"],
          "bed",
          "garden-pattern-bed",
          "gressplen",
          "garden-pattern-gressplen",
          "groennsakhage",
          "garden-pattern-groennsakhage",
          "dam",
          "garden-pattern-dam",
          "terrasse",
          "garden-pattern-terrasse",
          "bygning",
          "garden-pattern-bygning",
          "hekk",
          "garden-pattern-hekk",
          "sti",
          "garden-pattern-sti",
          "",
        ],
        "fill-opacity": 0.5,
      },
    })
  }
  if (!map.getLayer("share-draw-stroke")) {
    map.addLayer({
      id: "share-draw-stroke",
      type: "line",
      source: "share-draw",
      filter: ["==", "$type", "Polygon"],
      paint: {
        "line-color": ["coalesce", ["get", "strokeColor"], "#93c5fd"],
        "line-width": ["coalesce", ["get", "strokeWidth"], 1],
        "line-opacity": 0.5,
      },
    })
  }
}

function applyDrawings(map: mapboxgl.Map, data: DrawingData) {
  const drawSource = map.getSource("share-draw") as
    | mapboxgl.GeoJSONSource
    | undefined
  if (drawSource) {
    drawSource.setData({
      type: "FeatureCollection",
      features: data.drawFeatures,
    })
  }

  const textSource = map.getSource("text-labels") as
    | mapboxgl.GeoJSONSource
    | undefined
  if (textSource) {
    textSource.setData({
      type: "FeatureCollection",
      features: data.textFeatures,
    })
  }

  const lineSource = map.getSource("line-features") as
    | mapboxgl.GeoJSONSource
    | undefined
  if (lineSource) {
    lineSource.setData({
      type: "FeatureCollection",
      features: buildLineFeaturesWithArrows(data.lineFeatures),
    })
  }

  const canopySource = map.getSource("garden-canopy-lines") as
    | mapboxgl.GeoJSONSource
    | undefined
  if (canopySource) {
    canopySource.setData({
      type: "FeatureCollection",
      features: buildCanopyLines(data.drawFeatures),
    })
  }
}

function buildLineFeaturesWithArrows(lineFeatures: Feature[]): Feature[] {
  const out: Feature[] = []
  for (const f of lineFeatures) {
    out.push(f)
    if (f.geometry.type !== "LineString") continue
    const coords = f.geometry.coordinates
    if (coords.length < 2) continue
    if (f.properties?.startArrow) {
      const p0 = coords[0]
      const p1 = coords[1]
      const bearing =
        Math.atan2(p0[0] - p1[0], p0[1] - p1[1]) * (180 / Math.PI)
      out.push({
        type: "Feature",
        geometry: { type: "Point", coordinates: p0 },
        properties: {
          bearing,
          strokeColor: f.properties?.strokeColor,
          arrowType: "start",
        },
      })
    }
    if (f.properties?.endArrow) {
      const pLast = coords[coords.length - 1]
      const pPrev = coords[coords.length - 2]
      const bearing =
        Math.atan2(pLast[0] - pPrev[0], pLast[1] - pPrev[1]) * (180 / Math.PI)
      out.push({
        type: "Feature",
        geometry: { type: "Point", coordinates: pLast },
        properties: {
          bearing,
          strokeColor: f.properties?.strokeColor,
          arrowType: "end",
        },
      })
    }
  }
  return out
}

function buildCanopyLines(drawFeatures: Feature[]): Feature[] {
  const out: Feature[] = []
  for (const f of drawFeatures) {
    const props = f.properties || {}
    if (props.featureType !== "garden" || !props.hagenType) continue
    const el = GARDEN_ELEMENTS[props.hagenType as GardenElementType]
    if (!el || el.drawMode !== "circle") continue
    if (f.geometry.type !== "Polygon") continue
    const ring = f.geometry.coordinates[0]
    if (!ring || ring.length < 4) continue
    const center = centroid(ring)
    const edgePt = ring[0]
    const radiusKm = distanceMeters(center, edgePt) / 1000
    const id = (f.id as string | undefined) ?? `${center[0]}-${center[1]}`
    const lines = generateCanopyLines(center, radiusKm, id)
    for (const coords of lines) {
      out.push({
        type: "Feature",
        geometry: { type: "LineString", coordinates: coords },
        properties: { fillColor: props.fillColor || el.style.fillColor },
      })
    }
  }
  return out
}

function attachHoverTooltip(map: mapboxgl.Map) {
  const popup = new mapboxgl.Popup({
    closeButton: false,
    closeOnClick: false,
    className: "garden-name-tooltip",
    offset: [0, -10],
  })

  map.on("mousemove", (e) => {
    const hits = map.queryRenderedFeatures(e.point, {
      layers: ["share-draw-fill"],
    })
    const named = hits.find((h) => h.properties?.gardenName)
    if (named) {
      map.getCanvas().style.cursor = "pointer"
      popup
        .setLngLat(e.lngLat)
        .setHTML(
          `<div class="garden-tooltip-text">${named.properties!.gardenName}</div>`,
        )
        .addTo(map)
    } else {
      map.getCanvas().style.cursor = ""
      if (popup.isOpen()) popup.remove()
    }
  })
}
