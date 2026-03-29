import { useState, useEffect, useRef, useCallback } from "react"
import mapboxgl from "mapbox-gl"
import MapboxDraw from "@mapbox/mapbox-gl-draw"
import "mapbox-gl/dist/mapbox-gl.css"
import "@mapbox/mapbox-gl-draw/dist/mapbox-gl-draw.css"
import { CONFIG } from "@/config"
import { hasValidToken, loadSettings } from "@/components/SettingsDialog"
import { drawStyles } from "@/lib/draw-styles"
import DrawCircle from "@/lib/draw-circle-mode"
import DrawRectangle from "mapbox-gl-draw-rectangle-mode"
import { UndoRedoHistory, type Snapshot } from "@/lib/history"
import type { Tool } from "@/components/FloatingToolbar"

interface MapViewProps {
  onZoomChange: (zoom: number) => void
  activeTool: Tool
  onToolChange: (tool: Tool) => void
  onUndoRedoChange: (canUndo: boolean, canRedo: boolean) => void
  undoRef: React.MutableRefObject<(() => void) | null>
  redoRef: React.MutableRefObject<(() => void) | null>
}

// Default zone properties applied on shape creation
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
  const overlayContainerRef = useRef<HTMLDivElement>(null)
  const mapRef = useRef<mapboxgl.Map | null>(null)
  const overlayMapRef = useRef<mapboxgl.Map | null>(null)
  const drawRef = useRef<MapboxDraw | null>(null)
  const historyRef = useRef<UndoRedoHistory | null>(null)
  const [overlayVisible, setOverlayVisible] = useState(true)
  const activeToolRef = useRef<Tool>(activeTool)

  // Keep ref in sync with prop
  useEffect(() => {
    activeToolRef.current = activeTool
  }, [activeTool])

  const addUserPlotLayer = useCallback(
    async (map: mapboxgl.Map) => {
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
    },
    []
  )

  // Save current state to history
  const saveToHistory = useCallback(() => {
    const draw = drawRef.current
    const history = historyRef.current
    if (!draw || !history) return
    const snapshot: Snapshot = {
      drawFeatures: draw.getAll().features,
      textFeatures: [], // Phase 3
    }
    history.push(snapshot)
  }, [])

  // Restore a snapshot
  const restoreSnapshot = useCallback((snapshot: Snapshot) => {
    const draw = drawRef.current
    if (!draw) return
    draw.deleteAll()
    for (const feature of snapshot.drawFeatures) {
      draw.add(feature)
    }
  }, [])

  // Undo handler
  const handleUndo = useCallback(() => {
    const history = historyRef.current
    if (!history) return
    const snapshot = history.undo()
    if (snapshot) restoreSnapshot(snapshot)
  }, [restoreSnapshot])

  // Redo handler
  const handleRedo = useCallback(() => {
    const history = historyRef.current
    if (!history) return
    const snapshot = history.redo()
    if (snapshot) restoreSnapshot(snapshot)
  }, [restoreSnapshot])

  // Expose undo/redo to parent
  useEffect(() => {
    undoRef.current = handleUndo
    redoRef.current = handleRedo
  }, [handleUndo, handleRedo, undoRef, redoRef])

  useEffect(() => {
    if (
      !mapContainerRef.current ||
      !overlayContainerRef.current ||
      mapRef.current
    )
      return
    if (!hasValidToken()) return

    mapboxgl.accessToken = CONFIG.mapboxToken

    // Main map — satellite imagery
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
        draw_rectangle: DrawRectangle,
        draw_circle: DrawCircle,
      },
    })
    map.addControl(draw as unknown as mapboxgl.IControl)
    drawRef.current = draw

    // Initialize undo/redo history
    const history = new UndoRedoHistory(onUndoRedoChange)
    historyRef.current = history

    // Kartverket overlay map — multiply blended on top
    const overlayMap = new mapboxgl.Map({
      container: overlayContainerRef.current,
      style: {
        version: 8,
        sources: {
          "kartverket-topo": {
            type: "raster",
            tiles: [
              "https://cache.kartverket.no/v1/wmts/1.0.0/topo/default/webmercator/{z}/{y}/{x}.png",
            ],
            tileSize: 256,
            minzoom: 14,
            maxzoom: 18,
          },
        },
        layers: [
          {
            id: "background",
            type: "background",
            paint: { "background-color": "#ffffff" },
          },
          {
            id: "kartverket-topo",
            type: "raster",
            source: "kartverket-topo",
            paint: {},
          },
        ],
      },
      center: CONFIG.defaultCenter,
      zoom: CONFIG.defaultZoom,
      interactive: false,
      attributionControl: false,
    })
    overlayMapRef.current = overlayMap

    // Sync overlay to main map
    const syncOverlay = () => {
      overlayMap.jumpTo({
        center: map.getCenter(),
        zoom: map.getZoom(),
        bearing: map.getBearing(),
        pitch: map.getPitch(),
      })
    }
    map.on("move", syncOverlay)

    // Controls on main map only
    map.addControl(new mapboxgl.NavigationControl(), "bottom-right")
    map.addControl(
      new mapboxgl.ScaleControl({ unit: "metric" }),
      "bottom-left"
    )

    map.on("zoom", () => {
      const z = map.getZoom()
      onZoomChange(z)
      setOverlayVisible(z >= 13.5)
    })

    onZoomChange(CONFIG.defaultZoom)

    map.on("load", () => {
      addUserPlotLayer(map)
      // Push initial empty state to history
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
      // Force style refresh by re-adding features
      const all = draw.getAll()
      draw.set(all)

      const snapshot: Snapshot = {
        drawFeatures: draw.getAll().features,
        textFeatures: [],
      }
      history.push(snapshot)
    })

    map.on("draw.update", () => {
      const snapshot: Snapshot = {
        drawFeatures: draw.getAll().features,
        textFeatures: [],
      }
      history.push(snapshot)
    })

    map.on("draw.delete", () => {
      const snapshot: Snapshot = {
        drawFeatures: draw.getAll().features,
        textFeatures: [],
      }
      history.push(snapshot)
    })

    // Click on empty map in simple_select → deselect
    map.on("click", () => {
      if (activeToolRef.current === "select") {
        const selected = draw.getSelectedIds()
        if (selected.length === 0) {
          // Already deselected
        }
      }
    })

    // Only use GPS if user hasn't configured custom coordinates
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
        () => {
          // Silent fail
        }
      )
    }

    return () => {
      map.off("move", syncOverlay)
      overlayMap.remove()
      overlayMapRef.current = null
      map.removeControl(draw as unknown as mapboxgl.IControl)
      drawRef.current = null
      map.remove()
      mapRef.current = null
    }
  }, [onZoomChange, onUndoRedoChange, addUserPlotLayer, saveToHistory])

  // Sync active tool to draw mode
  useEffect(() => {
    const draw = drawRef.current
    if (!draw) return

    switch (activeTool) {
      case "select":
        draw.changeMode("simple_select")
        break
      case "polygon":
        draw.changeMode("draw_polygon")
        break
      case "rectangle":
        draw.changeMode("draw_rectangle")
        break
      case "circle":
        draw.changeMode("draw_circle")
        break
      case "text":
        // Phase 3
        draw.changeMode("simple_select")
        break
    }
  }, [activeTool])

  // Keyboard shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Don't capture shortcuts when typing in inputs
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
              draw.changeMode("simple_select")
            }
            onToolChange("select")
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
  }, [onToolChange, handleUndo, handleRedo])

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

  return (
    <>
      <div ref={mapContainerRef} className="absolute inset-0" />
      <div
        ref={overlayContainerRef}
        className="absolute inset-0 pointer-events-none"
        style={{
          mixBlendMode: "multiply",
          opacity: overlayVisible ? 1 : 0,
          transition: "opacity 0.3s ease",
        }}
      />
    </>
  )
}
