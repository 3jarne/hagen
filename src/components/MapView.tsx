import { useEffect, useRef, useCallback } from "react"
import mapboxgl from "mapbox-gl"
import MapboxDraw from "@mapbox/mapbox-gl-draw"
import "mapbox-gl/dist/mapbox-gl.css"
import "@mapbox/mapbox-gl-draw/dist/mapbox-gl-draw.css"
import { CONFIG } from "@/config"
import { hasValidToken, loadSettings } from "@/components/SettingsDialog"
import { drawStyles } from "@/lib/draw-styles"
import DrawCircleDrag from "@/lib/draw-circle-mode"
import DrawRectangleDrag from "@/lib/draw-rectangle-mode"
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
  const mapRef = useRef<mapboxgl.Map | null>(null)
  const drawRef = useRef<MapboxDraw | null>(null)
  const historyRef = useRef<UndoRedoHistory | null>(null)
  const activeToolRef = useRef<Tool>(activeTool)
  const spaceHeldRef = useRef(false)

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
    if (!mapContainerRef.current || mapRef.current) return
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
        draw_rectangle: DrawRectangleDrag,
        draw_circle: DrawCircleDrag,
      },
    })
    map.addControl(draw as unknown as mapboxgl.IControl)
    drawRef.current = draw

    // Initialize undo/redo history
    const history = new UndoRedoHistory(onUndoRedoChange)
    historyRef.current = history

    // Controls
    map.addControl(new mapboxgl.NavigationControl(), "bottom-right")
    map.addControl(
      new mapboxgl.ScaleControl({ unit: "metric" }),
      "bottom-left"
    )

    map.on("zoom", () => {
      onZoomChange(map.getZoom())
    })

    onZoomChange(CONFIG.defaultZoom)

    map.on("load", () => {
      // Add Kartverket topo as a raster layer on the main map (below draw layers)
      map.addSource("kartverket-topo", {
        type: "raster",
        tiles: [
          "https://cache.kartverket.no/v1/wmts/1.0.0/topo/default/webmercator/{z}/{y}/{x}.png",
        ],
        tileSize: 256,
        minzoom: 14,
        maxzoom: 18,
      })

      // Find the first draw layer to insert Kartverket below it
      const layers = map.getStyle().layers || []
      const firstDrawLayer = layers.find((l) =>
        l.id.startsWith("gl-draw-")
      )

      map.addLayer(
        {
          id: "kartverket-topo",
          type: "raster",
          source: "kartverket-topo",
          paint: {
            "raster-opacity": 0.4,
          },
        },
        firstDrawLayer?.id // insert before draw layers
      )

      // Add user plot on top of Kartverket but below draw
      addUserPlotLayer(map)

      // Push initial empty state to history
      history.push({ drawFeatures: [], textFeatures: [] })
    })

    // Draw events — apply defaults and save to history
    map.on("draw.create", (e: { features: GeoJSON.Feature[] }) => {
      for (const feature of e.features) {
        const id = feature.id as string
        draw.setFeatureProperty(id, "user_fillColor", ZONE_DEFAULTS.fillColor)
        draw.setFeatureProperty(
          id,
          "user_fillOpacity",
          ZONE_DEFAULTS.fillOpacity
        )
        draw.setFeatureProperty(
          id,
          "user_strokeColor",
          ZONE_DEFAULTS.strokeColor
        )
        draw.setFeatureProperty(
          id,
          "user_strokeWidth",
          ZONE_DEFAULTS.strokeWidth
        )
        draw.setFeatureProperty(id, "user_zone", ZONE_DEFAULTS.zone)
      }
      // Force style refresh
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
      map.removeControl(draw as unknown as mapboxgl.IControl)
      drawRef.current = null
      map.remove()
      mapRef.current = null
    }
  }, [onZoomChange, onUndoRedoChange, addUserPlotLayer])

  // Sync active tool to draw mode + manage dragPan
  useEffect(() => {
    const draw = drawRef.current
    const map = mapRef.current
    if (!draw || !map) return

    const isDrawTool =
      activeTool === "polygon" ||
      activeTool === "rectangle" ||
      activeTool === "circle"

    switch (activeTool) {
      case "select":
        draw.changeMode("simple_select")
        map.dragPan.enable()
        break
      case "polygon":
        draw.changeMode("draw_polygon")
        // Polygon mode uses clicks, not drag — but disable dragPan
        // so accidental drags don't pan. Space+drag overrides.
        map.dragPan.disable()
        break
      case "rectangle":
        draw.changeMode("draw_rectangle")
        // Rectangle mode handles dragPan internally
        break
      case "circle":
        draw.changeMode("draw_circle")
        // Circle mode handles dragPan internally
        break
      case "text":
        draw.changeMode("simple_select")
        map.dragPan.enable()
        break
    }

    // For draw tools, we track whether to restore dragPan on tool change
    return () => {
      if (isDrawTool && map.dragPan) {
        map.dragPan.enable()
      }
    }
  }, [activeTool])

  // Keyboard shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Don't capture shortcuts when typing in inputs
      const tag = (e.target as HTMLElement).tagName
      if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return

      // Space+drag to pan from any tool
      if (e.key === " " && !e.repeat) {
        e.preventDefault()
        spaceHeldRef.current = true
        const map = mapRef.current
        if (map) {
          map.dragPan.enable()
          map.getCanvas().style.cursor = "grab"
        }
        return
      }

      // Tool shortcuts (only when no modifier keys)
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
            // Cancel in-progress drawing — trash any partial feature
            const draw = drawRef.current
            if (draw) {
              draw.trash()
              draw.changeMode("simple_select")
            }
            onToolChange("select")
            return
          }
          case "delete":
          case "backspace": {
            const draw = drawRef.current
            if (draw) {
              draw.trash()
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

    const handleKeyUp = (e: KeyboardEvent) => {
      if (e.key === " ") {
        spaceHeldRef.current = false
        const map = mapRef.current
        if (map) {
          map.getCanvas().style.cursor = ""
          // Re-disable dragPan if in a draw tool
          const tool = activeToolRef.current
          if (
            tool === "polygon" ||
            tool === "rectangle" ||
            tool === "circle"
          ) {
            map.dragPan.disable()
          }
        }
      }
    }

    window.addEventListener("keydown", handleKeyDown)
    window.addEventListener("keyup", handleKeyUp)
    return () => {
      window.removeEventListener("keydown", handleKeyDown)
      window.removeEventListener("keyup", handleKeyUp)
    }
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

  return <div ref={mapContainerRef} className="absolute inset-0" />
}
