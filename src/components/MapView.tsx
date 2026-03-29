import { useEffect, useRef, useCallback } from "react"
import mapboxgl from "mapbox-gl"
import MapboxDraw from "@mapbox/mapbox-gl-draw"
import "mapbox-gl/dist/mapbox-gl.css"
import "@mapbox/mapbox-gl-draw/dist/mapbox-gl-draw.css"
import { CONFIG } from "@/config"
import { hasValidToken, loadSettings } from "@/components/SettingsDialog"
import { drawStyles } from "@/lib/draw-styles"
import DrawCircleMode from "@/lib/draw-circle-mode"
import DrawRectangleMode from "@/lib/draw-rectangle-mode"
import { UndoRedoHistory, type Snapshot } from "@/lib/history"
import {
  distanceMeters,
  polygonAreaSqm,
  centroid,
  formatDistance,
  formatArea,
} from "@/lib/measurement"
import type { Tool } from "@/components/FloatingToolbar"
import type { Position, Feature, Polygon } from "geojson"

interface MapViewProps {
  onZoomChange: (zoom: number) => void
  activeTool: Tool
  onToolChange: (tool: Tool) => void
  onUndoRedoChange: (canUndo: boolean, canRedo: boolean) => void
  undoRef: React.MutableRefObject<(() => void) | null>
  redoRef: React.MutableRefObject<(() => void) | null>
}

const ZONE_DEFAULTS = {
  fillColor: "#4ade80",
  fillOpacity: 0.4,
  strokeColor: "#4ade80",
  strokeWidth: 2,
  zone: "Lawn",
}

export function MapView({
  onZoomChange,
  activeTool,
  onToolChange,
  onUndoRedoChange,
  undoRef,
  redoRef,
}: MapViewProps) {
  const mapContainerRef = useRef<HTMLDivElement>(null)
  const mapRef = useRef<mapboxgl.Map | null>(null)
  const drawRef = useRef<MapboxDraw | null>(null)
  const historyRef = useRef<UndoRedoHistory | null>(null)
  const activeToolRef = useRef<Tool>(activeTool)
  const popupRef = useRef<mapboxgl.Popup | null>(null)

  useEffect(() => {
    activeToolRef.current = activeTool
  }, [activeTool])

  const addUserPlotLayer = useCallback(async (map: mapboxgl.Map) => {
    if (CONFIG.gnr === 0 && CONFIG.bnr === 0) return
    try {
      const url = `https://wfs.geonorge.no/skwfs/wfs.matrikkelkart?SERVICE=WFS&VERSION=2.0.0&REQUEST=GetFeature&TYPENAMES=Eiendomskart:Teig&CQL_FILTER=gaardsnummer=${CONFIG.gnr}%20AND%20bruksnummer=${CONFIG.bnr}&SRSNAME=EPSG:4326&outputFormat=application/json`
      const response = await fetch(url)
      if (!response.ok) return
      const data = (await response.json()) as GeoJSON.FeatureCollection
      if (!data.features || data.features.length === 0) return
      if (!map.getSource("user-plot")) {
        map.addSource("user-plot", { type: "geojson", data })
        map.addLayer({
          id: "user-plot-fill",
          type: "fill",
          source: "user-plot",
          paint: { "fill-color": "#f59e0b", "fill-opacity": 0.15 },
        })
        map.addLayer({
          id: "user-plot-line",
          type: "line",
          source: "user-plot",
          paint: { "line-color": "#f59e0b", "line-width": 2 },
        })
      }
    } catch {
      // Silent fail
    }
  }, [])

  /** Build a GeoJSON FeatureCollection of area labels from draw features */
  const buildAreaLabels = useCallback(
    (draw: MapboxDraw): GeoJSON.FeatureCollection => {
      const features = draw.getAll().features
      const labels: Feature[] = []
      for (const f of features) {
        if (f.geometry.type !== "Polygon") continue
        const ring = (f.geometry as Polygon).coordinates[0]
        if (!ring || ring.length < 4) continue
        const area = polygonAreaSqm(ring)
        const center = centroid(ring)
        labels.push({
          type: "Feature",
          geometry: { type: "Point", coordinates: center },
          properties: { label: formatArea(area) },
        })
      }
      return { type: "FeatureCollection", features: labels }
    },
    []
  )

  const updateAreaLabels = useCallback(
    (map: mapboxgl.Map, draw: MapboxDraw) => {
      const source = map.getSource("area-labels") as mapboxgl.GeoJSONSource
      if (source) {
        source.setData(buildAreaLabels(draw))
      }
    },
    [buildAreaLabels]
  )

  const restoreSnapshot = useCallback((snapshot: Snapshot) => {
    const draw = drawRef.current
    const map = mapRef.current
    if (!draw || !map) return
    draw.deleteAll()
    for (const feature of snapshot.drawFeatures) {
      draw.add(feature)
    }
    updateAreaLabels(map, draw)
  }, [updateAreaLabels])

  const handleUndo = useCallback(() => {
    const history = historyRef.current
    if (!history) return
    const snapshot = history.undo()
    if (snapshot) restoreSnapshot(snapshot)
  }, [restoreSnapshot])

  const handleRedo = useCallback(() => {
    const history = historyRef.current
    if (!history) return
    const snapshot = history.redo()
    if (snapshot) restoreSnapshot(snapshot)
  }, [restoreSnapshot])

  useEffect(() => {
    undoRef.current = handleUndo
    redoRef.current = handleRedo
  }, [handleUndo, handleRedo, undoRef, redoRef])

  // Main map setup
  useEffect(() => {
    if (!mapContainerRef.current || mapRef.current) return
    if (!hasValidToken()) return

    mapboxgl.accessToken = CONFIG.mapboxToken

    const map = new mapboxgl.Map({
      container: mapContainerRef.current,
      style: "mapbox://styles/mapbox/satellite-v9",
      center: CONFIG.defaultCenter,
      zoom: CONFIG.defaultZoom,
      preserveDrawingBuffer: true,
    })
    mapRef.current = map

    // Initialize mapbox-gl-draw
    const draw = new MapboxDraw({
      displayControlsDefault: false,
      styles: drawStyles,
      modes: {
        ...MapboxDraw.modes,
        draw_rectangle: DrawRectangleMode,
        draw_circle: DrawCircleMode,
      },
    })
    map.addControl(draw as unknown as mapboxgl.IControl)
    drawRef.current = draw

    // Undo/redo history
    const history = new UndoRedoHistory(onUndoRedoChange)
    historyRef.current = history

    // Measurement popup
    const popup = new mapboxgl.Popup({
      closeButton: false,
      closeOnClick: false,
      className: "measurement-popup",
      offset: [15, 0],
    })
    popupRef.current = popup

    // Controls
    map.addControl(new mapboxgl.NavigationControl(), "bottom-right")
    map.addControl(new mapboxgl.ScaleControl({ unit: "metric" }), "bottom-left")

    map.on("zoom", () => onZoomChange(map.getZoom()))
    onZoomChange(CONFIG.defaultZoom)

    map.on("load", () => {
      // Kartverket topo as a raster layer on the main map (below draw layers)
      map.addSource("kartverket-topo", {
        type: "raster",
        tiles: [
          "https://cache.kartverket.no/v1/wmts/1.0.0/topo/default/webmercator/{z}/{y}/{x}.png",
        ],
        tileSize: 256,
        minzoom: 14,
        maxzoom: 18,
      })

      // Insert Kartverket below draw layers
      const layers = map.getStyle().layers || []
      const firstDrawLayer = layers.find((l) => l.id.startsWith("gl-draw-"))
      map.addLayer(
        {
          id: "kartverket-topo",
          type: "raster",
          source: "kartverket-topo",
          paint: { "raster-opacity": 0.4 },
        },
        firstDrawLayer?.id
      )

      // User plot
      addUserPlotLayer(map)

      // Area labels source + layer (on top of everything)
      map.addSource("area-labels", {
        type: "geojson",
        data: { type: "FeatureCollection", features: [] },
      })
      map.addLayer({
        id: "area-labels",
        type: "symbol",
        source: "area-labels",
        layout: {
          "text-field": ["get", "label"],
          "text-size": 13,
          "text-font": ["Open Sans Regular", "Arial Unicode MS Regular"],
          "text-allow-overlap": true,
        },
        paint: {
          "text-color": "#ffffff",
          "text-halo-color": "#000000",
          "text-halo-width": 1.5,
        },
      })

      // Initial history state
      history.push({ drawFeatures: [], textFeatures: [] })
    })

    // Draw events — apply defaults and save to history
    map.on("draw.create", (e: { features: GeoJSON.Feature[] }) => {
      for (const feature of e.features) {
        const id = feature.id as string
        draw.setFeatureProperty(id, "user_fillColor", ZONE_DEFAULTS.fillColor)
        draw.setFeatureProperty(id, "user_fillOpacity", ZONE_DEFAULTS.fillOpacity)
        draw.setFeatureProperty(id, "user_strokeColor", ZONE_DEFAULTS.strokeColor)
        draw.setFeatureProperty(id, "user_strokeWidth", ZONE_DEFAULTS.strokeWidth)
        draw.setFeatureProperty(id, "user_zone", ZONE_DEFAULTS.zone)
      }
      draw.set(draw.getAll()) // Force style refresh
      updateAreaLabels(map, draw)
      history.push({
        drawFeatures: draw.getAll().features,
        textFeatures: [],
      })
    })

    map.on("draw.update", () => {
      updateAreaLabels(map, draw)
      history.push({
        drawFeatures: draw.getAll().features,
        textFeatures: [],
      })
    })

    map.on("draw.delete", () => {
      updateAreaLabels(map, draw)
      history.push({
        drawFeatures: draw.getAll().features,
        textFeatures: [],
      })
    })

    // Measurement events from rectangle/circle modes
    map.on("draw.measurement" as string, (e: { text: string; lngLat: mapboxgl.LngLat }) => {
      popup
        .setLngLat(e.lngLat)
        .setHTML(`<div class="measurement-text">${e.text.replace("\n", "<br>")}</div>`)
        .addTo(map)
    })

    map.on("draw.measurement.clear" as string, () => {
      popup.remove()
    })

    // Polygon measurement on mousemove (built-in draw_polygon mode)
    map.on("mousemove", (e: mapboxgl.MapMouseEvent) => {
      const mode = draw.getMode()
      if (mode !== "draw_polygon") return

      const features = draw.getAll().features
      if (features.length === 0) return

      // The last feature is the one being drawn
      const current = features[features.length - 1]
      if (current.geometry.type !== "Polygon") return

      const ring = (current.geometry as Polygon).coordinates[0]
      if (!ring || ring.length < 2) {
        popup.remove()
        return
      }

      const cursor: Position = [e.lngLat.lng, e.lngLat.lat]
      const lastPlaced = ring[ring.length - 2] // last confirmed point (ring closes back to first)

      let text = ""
      if (lastPlaced) {
        const d = distanceMeters(lastPlaced, cursor)
        text = formatDistance(d)
      }

      // If 3+ unique points, also show projected area
      if (ring.length >= 4) {
        // Build a closed ring with cursor to calculate area
        const tempRing = [...ring.slice(0, ring.length - 1), cursor, ring[0]]
        const area = polygonAreaSqm(tempRing)
        text += `\n${formatArea(area)}`
      }

      if (text) {
        popup
          .setLngLat(e.lngLat)
          .setHTML(`<div class="measurement-text">${text.replace("\n", "<br>")}</div>`)
          .addTo(map)
      }
    })

    // GPS geolocation
    const settings = loadSettings()
    const hasCustomCoords =
      settings.lat !== 60.41601 || settings.lng !== 11.05218
    if (
      !hasCustomCoords &&
      navigator.geolocation &&
      window.location.protocol === "https:"
    ) {
      navigator.geolocation.getCurrentPosition(
        (position) => {
          map.flyTo({
            center: [position.coords.longitude, position.coords.latitude],
            zoom: CONFIG.defaultZoom,
          })
        },
        () => {}
      )
    }

    return () => {
      popup.remove()
      map.removeControl(draw as unknown as mapboxgl.IControl)
      drawRef.current = null
      map.remove()
      mapRef.current = null
    }
  }, [onZoomChange, onUndoRedoChange, addUserPlotLayer, updateAreaLabels])

  // Sync active tool to draw mode + manage dragPan
  useEffect(() => {
    const draw = drawRef.current
    const map = mapRef.current
    if (!draw || !map) return

    const isDrawTool =
      activeTool === "polygon" ||
      activeTool === "rectangle" ||
      activeTool === "circle"

    // Clear measurement popup when switching tools
    popupRef.current?.remove()

    switch (activeTool) {
      case "select":
        draw.changeMode("simple_select")
        map.dragPan.enable()
        break
      case "polygon":
        draw.changeMode("draw_polygon")
        map.dragPan.disable()
        break
      case "rectangle":
        draw.changeMode("draw_rectangle")
        map.dragPan.disable()
        break
      case "circle":
        draw.changeMode("draw_circle")
        map.dragPan.disable()
        break
      case "text":
        draw.changeMode("simple_select")
        map.dragPan.enable()
        break
    }

    return () => {
      if (isDrawTool && map.dragPan) {
        map.dragPan.enable()
      }
    }
  }, [activeTool])

  // Keyboard shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement).tagName
      if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return

      // Tool shortcuts
      if (!e.metaKey && !e.ctrlKey && !e.altKey) {
        switch (e.key.toLowerCase()) {
          case "v":
            onToolChange("select")
            return
          case "p":
            onToolChange("polygon")
            return
          case "r":
            onToolChange("rectangle")
            return
          case "c":
            onToolChange("circle")
            return
          case "t":
            onToolChange("text")
            return
          case "escape": {
            const draw = drawRef.current
            if (draw) {
              draw.trash()
              draw.changeMode("simple_select")
            }
            popupRef.current?.remove()
            onToolChange("select")
            return
          }
          case "delete":
          case "backspace": {
            const draw = drawRef.current
            const map = mapRef.current
            if (draw) {
              draw.trash()
              if (map) updateAreaLabels(map, draw)
            }
            return
          }
        }
      }

      // Undo: Cmd+Z / Ctrl+Z
      if ((e.metaKey || e.ctrlKey) && !e.shiftKey && e.key === "z") {
        e.preventDefault()
        handleUndo()
        return
      }

      // Redo: Cmd+Shift+Z / Ctrl+Shift+Z
      if ((e.metaKey || e.ctrlKey) && e.shiftKey && e.key === "z") {
        e.preventDefault()
        handleRedo()
        return
      }
    }

    window.addEventListener("keydown", handleKeyDown)
    return () => window.removeEventListener("keydown", handleKeyDown)
  }, [onToolChange, handleUndo, handleRedo, updateAreaLabels])

  if (!hasValidToken()) {
    return (
      <div className="absolute inset-0 flex items-center justify-center bg-muted">
        <div className="rounded-lg border bg-card p-6 shadow-lg max-w-md text-center">
          <p className="text-sm text-card-foreground">
            Open <strong>Settings</strong> (gear icon in the top bar) to add
            your Mapbox token and configure your property location.
          </p>
        </div>
      </div>
    )
  }

  return <div ref={mapContainerRef} className="absolute inset-0" />
}
