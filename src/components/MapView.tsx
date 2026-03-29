import { useEffect, useRef, useCallback, useState } from "react"
import mapboxgl from "mapbox-gl"
import MapboxDraw from "@mapbox/mapbox-gl-draw"
import "mapbox-gl/dist/mapbox-gl.css"
import "@mapbox/mapbox-gl-draw/dist/mapbox-gl-draw.css"
import { CONFIG } from "@/config"
import { hasValidToken, loadSettings } from "@/components/SettingsDialog"
import { drawStyles } from "@/lib/draw-styles"
import DrawCircleMode from "@/lib/draw-circle-mode"
import DrawRectangleMode from "@/lib/draw-rectangle-mode"
import DrawPolygonMode from "@/lib/draw-polygon-mode"
import { UndoRedoHistory, type Snapshot } from "@/lib/history"
import { polygonAreaSqm, centroid, formatArea } from "@/lib/measurement"
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

interface ContextMenuState {
  x: number
  y: number
  featureIds: string[]
  featureType: "text" | "draw"
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
  const suppressModeSync = useRef(false)

  // Text features state
  const textFeaturesRef = useRef<Feature[]>([])
  const selectedTextIdsRef = useRef<Set<string>>(new Set())
  const textInputRef = useRef<HTMLInputElement | null>(null)
  const editingTextIdRef = useRef<string | null>(null)

  // Context menu
  const [contextMenu, setContextMenu] = useState<ContextMenuState | null>(null)

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

  /** Sync text features ref to the map GeoJSON source */
  const syncTextLabels = useCallback((map: mapboxgl.Map) => {
    const source = map.getSource("text-labels") as mapboxgl.GeoJSONSource
    if (!source) return
    const features = textFeaturesRef.current.map((f) => ({
      ...f,
      properties: {
        ...f.properties,
        selected: selectedTextIdsRef.current.has(f.properties!.id),
      },
    }))
    source.setData({ type: "FeatureCollection", features })
  }, [])

  /** Build area label GeoJSON from completed draw features, with optional extra label */
  const buildAreaLabels = useCallback(
    (
      draw: MapboxDraw,
      extra?: { coords: Position; text: string }
    ): GeoJSON.FeatureCollection => {
      const features = draw.getAll().features
      const labels: Feature[] = []
      for (const f of features) {
        if (f.geometry.type !== "Polygon") continue
        const ring = (f.geometry as Polygon).coordinates[0]
        if (!ring || ring.length < 4) continue
        const area = polygonAreaSqm(ring)
        if (area < 0.1) continue
        const center = centroid(ring)
        labels.push({
          type: "Feature",
          geometry: { type: "Point", coordinates: center },
          properties: { label: formatArea(area) },
        })
      }
      if (extra) {
        labels.push({
          type: "Feature",
          geometry: { type: "Point", coordinates: extra.coords },
          properties: { label: extra.text },
        })
      }
      return { type: "FeatureCollection", features: labels }
    },
    []
  )

  const updateAreaLabels = useCallback(
    (
      map: mapboxgl.Map,
      draw: MapboxDraw,
      extra?: { coords: Position; text: string }
    ) => {
      const source = map.getSource("area-labels") as mapboxgl.GeoJSONSource
      if (source) {
        source.setData(buildAreaLabels(draw, extra))
      }
    },
    [buildAreaLabels]
  )

  /** Push current state to history */
  const pushHistory = useCallback(() => {
    const draw = drawRef.current
    const history = historyRef.current
    if (!draw || !history) return
    history.push({
      drawFeatures: draw.getAll().features,
      textFeatures: [...textFeaturesRef.current],
    })
  }, [])

  const restoreSnapshot = useCallback(
    (snapshot: Snapshot) => {
      const draw = drawRef.current
      const map = mapRef.current
      if (!draw || !map) return
      draw.deleteAll()
      for (const feature of snapshot.drawFeatures) {
        draw.add(feature)
      }
      textFeaturesRef.current = [...snapshot.textFeatures]
      selectedTextIdsRef.current.clear()
      syncTextLabels(map)
      updateAreaLabels(map, draw)
    },
    [updateAreaLabels, syncTextLabels]
  )

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

  /** Remove any active text input overlay */
  const removeTextInput = useCallback(() => {
    if (textInputRef.current) {
      textInputRef.current.remove()
      textInputRef.current = null
    }
    editingTextIdRef.current = null
  }, [])

  /** Show a text input overlay at a map position */
  const showTextInput = useCallback(
    (
      map: mapboxgl.Map,
      lngLat: { lng: number; lat: number },
      initialValue: string,
      onConfirm: (value: string) => void
    ) => {
      removeTextInput()
      const point = map.project([lngLat.lng, lngLat.lat])
      const input = document.createElement("input")
      input.type = "text"
      input.className = "text-label-input"
      input.value = initialValue
      input.style.left = `${point.x}px`
      input.style.top = `${point.y}px`

      let confirmed = false
      const confirm = () => {
        if (confirmed) return
        confirmed = true
        const value = input.value.trim()
        if (value) onConfirm(value)
        removeTextInput()
      }

      input.addEventListener("keydown", (e) => {
        e.stopPropagation()
        if (e.key === "Enter") {
          e.preventDefault()
          confirm()
        }
        if (e.key === "Escape") {
          e.preventDefault()
          removeTextInput()
        }
      })
      input.addEventListener("blur", confirm)

      mapContainerRef.current?.appendChild(input)
      textInputRef.current = input
      input.focus()
      if (initialValue) input.select()
    },
    [removeTextInput]
  )

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

    const draw = new MapboxDraw({
      displayControlsDefault: false,
      styles: drawStyles,
      modes: {
        ...MapboxDraw.modes,
        draw_polygon: DrawPolygonMode,
        draw_rectangle: DrawRectangleMode,
        draw_circle: DrawCircleMode,
      },
    })
    map.addControl(draw as unknown as mapboxgl.IControl)
    drawRef.current = draw

    const history = new UndoRedoHistory(onUndoRedoChange)
    historyRef.current = history

    // Measurement popup
    const popup = new mapboxgl.Popup({
      closeButton: false,
      closeOnClick: false,
      className: "measurement-popup",
      offset: [0, -10],
    })
    popupRef.current = popup

    // Controls
    map.addControl(new mapboxgl.NavigationControl(), "bottom-right")
    map.addControl(
      new mapboxgl.ScaleControl({ unit: "metric" }),
      "bottom-left"
    )

    map.on("zoom", () => onZoomChange(map.getZoom()))
    onZoomChange(CONFIG.defaultZoom)

    map.on("load", () => {
      // Kartverket topo below draw layers
      map.addSource("kartverket-topo", {
        type: "raster",
        tiles: [
          "https://cache.kartverket.no/v1/wmts/1.0.0/topo/default/webmercator/{z}/{y}/{x}.png",
        ],
        tileSize: 256,
        minzoom: 14,
        maxzoom: 18,
      })
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

      addUserPlotLayer(map)

      // Area labels layer
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

      // Text labels layer
      map.addSource("text-labels", {
        type: "geojson",
        data: { type: "FeatureCollection", features: [] },
      })
      map.addLayer({
        id: "text-labels-selected",
        type: "circle",
        source: "text-labels",
        filter: ["==", ["get", "selected"], true],
        paint: {
          "circle-radius": 14,
          "circle-color": "#3b82f6",
          "circle-opacity": 0.3,
        },
      })
      map.addLayer({
        id: "text-labels",
        type: "symbol",
        source: "text-labels",
        layout: {
          "text-field": ["get", "label"],
          "text-size": ["coalesce", ["get", "fontSize"], 16],
          "text-font": ["Open Sans Regular", "Arial Unicode MS Regular"],
          "text-allow-overlap": true,
        },
        paint: {
          "text-color": ["coalesce", ["get", "textColor"], "#ffffff"],
          "text-halo-color": "#000000",
          "text-halo-width": 1.5,
        },
      })

      history.push({ drawFeatures: [], textFeatures: [] })
    })

    // Draw events
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
      draw.set(draw.getAll())
      updateAreaLabels(map, draw)
      history.push({
        drawFeatures: draw.getAll().features,
        textFeatures: [...textFeaturesRef.current],
      })
    })

    map.on("draw.update", () => {
      updateAreaLabels(map, draw)
      history.push({
        drawFeatures: draw.getAll().features,
        textFeatures: [...textFeaturesRef.current],
      })
    })

    map.on("draw.delete", () => {
      updateAreaLabels(map, draw)
      history.push({
        drawFeatures: draw.getAll().features,
        textFeatures: [...textFeaturesRef.current],
      })
    })

    // Auto-switch tool to select after shape completion
    map.on("draw.modechange", (e: { mode: string }) => {
      if (suppressModeSync.current) return
      if (e.mode === "simple_select" && activeToolRef.current !== "select") {
        onToolChange("select")
      }
    })

    // Hide area labels while features are being moved
    map.on("draw.selectionchange", (e: { features: GeoJSON.Feature[] }) => {
      if (map.getLayer("area-labels")) {
        map.setLayoutProperty(
          "area-labels",
          "visibility",
          e.features.length > 0 ? "none" : "visible"
        )
      }
    })

    // Measurement events from draw modes
    map.on(
      "draw.measurement" as string,
      (e: { text: string; lngLat: { lng: number; lat: number } }) => {
        popup
          .setLngLat([e.lngLat.lng, e.lngLat.lat])
          .setHTML(`<div class="measurement-text">${e.text}</div>`)
          .addTo(map)
      }
    )

    map.on(
      "draw.measurement.area" as string,
      (e: { text: string; centroid: Position }) => {
        updateAreaLabels(map, draw, { coords: e.centroid, text: e.text })
      }
    )

    map.on("draw.measurement.clear" as string, () => {
      popup.remove()
      updateAreaLabels(map, draw)
    })

    // Text tool: click to place text
    map.on("click", (e: mapboxgl.MapMouseEvent) => {
      if (activeToolRef.current !== "text") return
      if (textInputRef.current) return // already editing

      showTextInput(map, e.lngLat, "", (value) => {
        const id = crypto.randomUUID()
        const feature: Feature = {
          type: "Feature",
          geometry: {
            type: "Point",
            coordinates: [e.lngLat.lng, e.lngLat.lat],
          },
          properties: {
            id,
            label: value,
            textColor: "#ffffff",
            fontSize: 16,
          },
        }
        textFeaturesRef.current = [...textFeaturesRef.current, feature]
        syncTextLabels(map)
        history.push({
          drawFeatures: draw.getAll().features,
          textFeatures: [...textFeaturesRef.current],
        })
      })
    })

    // Select tool: click to select/deselect text labels
    map.on("click", (e: mapboxgl.MapMouseEvent) => {
      if (
        activeToolRef.current !== "select" &&
        activeToolRef.current !== "text"
      )
        return
      if (activeToolRef.current === "text") return // handled above
      if (textInputRef.current) return

      const textHits = map.queryRenderedFeatures(e.point, {
        layers: ["text-labels"],
      })

      if (textHits.length > 0) {
        const hitId = textHits[0].properties!.id as string
        if (e.originalEvent.shiftKey) {
          // Toggle in selection
          if (selectedTextIdsRef.current.has(hitId)) {
            selectedTextIdsRef.current.delete(hitId)
          } else {
            selectedTextIdsRef.current.add(hitId)
          }
        } else {
          // Single select — deselect draw features too
          selectedTextIdsRef.current.clear()
          selectedTextIdsRef.current.add(hitId)
          draw.changeMode("simple_select")
        }
        syncTextLabels(map)
        return
      }

      // Click on empty space — deselect text
      if (selectedTextIdsRef.current.size > 0) {
        selectedTextIdsRef.current.clear()
        syncTextLabels(map)
      }
    })

    // Double-click to edit text label
    map.on("dblclick", (e: mapboxgl.MapMouseEvent) => {
      const textHits = map.queryRenderedFeatures(e.point, {
        layers: ["text-labels"],
      })
      if (textHits.length === 0) return

      e.preventDefault()
      const hitId = textHits[0].properties!.id as string
      const feature = textFeaturesRef.current.find(
        (f) => f.properties!.id === hitId
      )
      if (!feature) return

      editingTextIdRef.current = hitId
      const coords = (feature.geometry as GeoJSON.Point).coordinates
      showTextInput(
        map,
        { lng: coords[0], lat: coords[1] },
        feature.properties!.label,
        (value) => {
          textFeaturesRef.current = textFeaturesRef.current.map((f) =>
            f.properties!.id === hitId
              ? { ...f, properties: { ...f.properties!, label: value } }
              : f
          )
          syncTextLabels(map)
          history.push({
            drawFeatures: draw.getAll().features,
            textFeatures: [...textFeaturesRef.current],
          })
        }
      )
    })

    // Right-click context menu
    map.on("contextmenu", (e: mapboxgl.MapMouseEvent) => {
      e.preventDefault()

      // Check text labels first
      const textHits = map.queryRenderedFeatures(e.point, {
        layers: ["text-labels"],
      })
      if (textHits.length > 0) {
        const hitId = textHits[0].properties!.id as string
        if (!selectedTextIdsRef.current.has(hitId)) {
          selectedTextIdsRef.current.clear()
          selectedTextIdsRef.current.add(hitId)
          draw.changeMode("simple_select")
          syncTextLabels(map)
        }
        setContextMenu({
          x: e.point.x,
          y: e.point.y,
          featureIds: [...selectedTextIdsRef.current],
          featureType: "text",
        })
        return
      }

      // Check draw features
      const drawHits = map.queryRenderedFeatures(e.point, {
        layers: (map.getStyle().layers || [])
          .filter((l) => l.id.startsWith("gl-draw-"))
          .map((l) => l.id),
      })
      if (drawHits.length > 0) {
        const hitId = drawHits[0].properties!.id as string
        if (hitId) {
          const selected = draw.getSelectedIds()
          if (!selected.includes(hitId)) {
            draw.changeMode("simple_select", { featureIds: [hitId] })
          }
          setContextMenu({
            x: e.point.x,
            y: e.point.y,
            featureIds: draw.getSelectedIds().length > 0 ? draw.getSelectedIds() : [hitId],
            featureType: "draw",
          })
          return
        }
      }

      setContextMenu(null)
    })

    // Close context menu on map interaction
    map.on("movestart", () => setContextMenu(null))

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
  }, [
    onZoomChange,
    onUndoRedoChange,
    onToolChange,
    addUserPlotLayer,
    updateAreaLabels,
    syncTextLabels,
    showTextInput,
  ])

  // Sync active tool to draw mode + manage dragPan
  useEffect(() => {
    const draw = drawRef.current
    const map = mapRef.current
    if (!draw || !map) return

    const isDrawTool =
      activeTool === "polygon" ||
      activeTool === "rectangle" ||
      activeTool === "circle"

    popupRef.current?.remove()
    removeTextInput()
    setContextMenu(null)

    // Suppress mode sync to prevent feedback loop
    suppressModeSync.current = true
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
    // Re-enable mode sync after a tick
    requestAnimationFrame(() => {
      suppressModeSync.current = false
    })

    return () => {
      if (isDrawTool && map.dragPan) {
        map.dragPan.enable()
      }
    }
  }, [activeTool, removeTextInput])

  // Context menu actions
  const handleContextDelete = useCallback(() => {
    if (!contextMenu) return
    const map = mapRef.current
    const draw = drawRef.current
    if (!map || !draw) return

    if (contextMenu.featureType === "text") {
      const idsToDelete = new Set(contextMenu.featureIds)
      textFeaturesRef.current = textFeaturesRef.current.filter(
        (f) => !idsToDelete.has(f.properties!.id)
      )
      selectedTextIdsRef.current.clear()
      syncTextLabels(map)
    } else {
      for (const id of contextMenu.featureIds) {
        draw.delete(id)
      }
      updateAreaLabels(map, draw)
    }

    setContextMenu(null)
    pushHistory()
  }, [contextMenu, syncTextLabels, updateAreaLabels, pushHistory])

  const handleContextDuplicate = useCallback(() => {
    if (!contextMenu) return
    const map = mapRef.current
    const draw = drawRef.current
    if (!map || !draw) return

    if (contextMenu.featureType === "text") {
      const newFeatures: Feature[] = []
      for (const id of contextMenu.featureIds) {
        const original = textFeaturesRef.current.find(
          (f) => f.properties!.id === id
        )
        if (!original) continue
        const coords = (original.geometry as GeoJSON.Point).coordinates
        const screenPt = map.project([coords[0], coords[1]])
        const newPt = map.unproject([screenPt.x + 20, screenPt.y + 20])
        newFeatures.push({
          type: "Feature",
          geometry: { type: "Point", coordinates: [newPt.lng, newPt.lat] },
          properties: {
            ...original.properties,
            id: crypto.randomUUID(),
          },
        })
      }
      textFeaturesRef.current = [...textFeaturesRef.current, ...newFeatures]
      selectedTextIdsRef.current.clear()
      for (const f of newFeatures) {
        selectedTextIdsRef.current.add(f.properties!.id)
      }
      syncTextLabels(map)
    } else {
      for (const id of contextMenu.featureIds) {
        const feature = draw.get(id)
        if (!feature) continue
        // Offset all coordinates by 20px
        const cloned = JSON.parse(JSON.stringify(feature)) as Feature
        delete (cloned as { id?: unknown }).id
        if (cloned.geometry.type === "Polygon") {
          const poly = cloned.geometry as Polygon
          poly.coordinates = poly.coordinates.map((ring) =>
            ring.map((coord) => {
              const pt = map.project([coord[0], coord[1]])
              const newPt = map.unproject([pt.x + 20, pt.y + 20])
              return [newPt.lng, newPt.lat]
            })
          )
        }
        draw.add(cloned)
      }
      updateAreaLabels(map, draw)
    }

    setContextMenu(null)
    pushHistory()
  }, [contextMenu, syncTextLabels, updateAreaLabels, pushHistory])

  // Keyboard shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement).tagName
      if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return

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
            setContextMenu(null)
            removeTextInput()
            const draw = drawRef.current
            const map = mapRef.current
            if (draw) {
              draw.trash()
              draw.changeMode("simple_select")
            }
            if (map && selectedTextIdsRef.current.size > 0) {
              selectedTextIdsRef.current.clear()
              syncTextLabels(map)
            }
            popupRef.current?.remove()
            onToolChange("select")
            return
          }
          case "delete":
          case "backspace": {
            const draw = drawRef.current
            const map = mapRef.current
            if (!draw || !map) return

            let changed = false

            // Delete selected draw features
            const selectedDraw = draw.getSelectedIds()
            if (selectedDraw.length > 0) {
              draw.trash()
              updateAreaLabels(map, draw)
              changed = true
            }

            // Delete selected text features
            if (selectedTextIdsRef.current.size > 0) {
              textFeaturesRef.current = textFeaturesRef.current.filter(
                (f) => !selectedTextIdsRef.current.has(f.properties!.id)
              )
              selectedTextIdsRef.current.clear()
              syncTextLabels(map)
              changed = true
            }

            if (changed) pushHistory()
            return
          }
        }
      }

      if ((e.metaKey || e.ctrlKey) && !e.shiftKey && e.key === "z") {
        e.preventDefault()
        handleUndo()
        return
      }
      if ((e.metaKey || e.ctrlKey) && e.shiftKey && e.key === "z") {
        e.preventDefault()
        handleRedo()
        return
      }
    }

    window.addEventListener("keydown", handleKeyDown)
    return () => window.removeEventListener("keydown", handleKeyDown)
  }, [
    onToolChange,
    handleUndo,
    handleRedo,
    updateAreaLabels,
    syncTextLabels,
    pushHistory,
    removeTextInput,
  ])

  // Close context menu on outside click
  useEffect(() => {
    if (!contextMenu) return
    const handleClick = () => setContextMenu(null)
    window.addEventListener("click", handleClick)
    return () => window.removeEventListener("click", handleClick)
  }, [contextMenu])

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
      {contextMenu && (
        <div
          className="absolute z-50 min-w-[8rem] overflow-hidden rounded-md border bg-popover p-1 text-popover-foreground shadow-md"
          style={{ left: contextMenu.x, top: contextMenu.y }}
        >
          <button
            className="relative flex w-full cursor-default select-none items-center rounded-sm px-2 py-1.5 text-sm outline-none hover:bg-accent hover:text-accent-foreground"
            onClick={handleContextDelete}
          >
            Delete
            <span className="ml-auto text-xs tracking-widest text-muted-foreground">
              Del
            </span>
          </button>
          <button
            className="relative flex w-full cursor-default select-none items-center rounded-sm px-2 py-1.5 text-sm outline-none hover:bg-accent hover:text-accent-foreground"
            onClick={handleContextDuplicate}
          >
            Duplicate
          </button>
        </div>
      )}
    </>
  )
}
