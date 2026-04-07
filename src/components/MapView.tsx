import { useEffect, useRef, useCallback, useState } from "react"
import mapboxgl from "mapbox-gl"
import MapboxDraw from "@mapbox/mapbox-gl-draw"
import "mapbox-gl/dist/mapbox-gl.css"
import "@mapbox/mapbox-gl-draw/dist/mapbox-gl-draw.css"
import { CONFIG } from "@/config"
import { hasValidToken, loadSettings } from "@/components/SettingsDialog"
import { drawStyles } from "@/lib/draw-styles"
import DrawCircleMode, { createCirclePolygon, generateCanopyLines } from "@/lib/draw-circle-mode"
import DrawRectangleMode from "@/lib/draw-rectangle-mode"
import DrawPolygonMode from "@/lib/draw-polygon-mode"
import { UndoRedoHistory, type Snapshot } from "@/lib/history"
import { polygonAreaSqm, centroid, formatArea } from "@/lib/measurement"
import type { Tool } from "@/components/FloatingToolbar"
import type { Position, Feature, Polygon } from "geojson"
import type { ShapeProperties, TextProperties, LineProperties } from "@/lib/zone-defaults"
import { distanceMeters, formatDistance } from "@/lib/measurement"
import { simplify } from "@/lib/simplify"
import type { PanelMode, MapStyle } from "@/App"
import {
  addKartverketLayer,
  addAreaLabelsLayer,
  addTextLabelsLayers,
  addLineFeatureLayers,
  addMeasurementLayers,
  restoreLayersAfterStyleChange,
  addCanopyLinesLayer,
  addScaleHandlesLayer,
} from "@/lib/map-layers"
import { loadProject, saveProject } from "@/lib/storage"
import { exportJSON, exportPNG } from "@/lib/export"
import { GARDEN_ELEMENTS, type GardenElementType } from "@/lib/garden-types"
import { registerGardenPatterns } from "@/lib/garden-patterns"

interface MapViewProps {
  onZoomChange: (zoom: number) => void
  activeTool: Tool
  activeGardenElement: GardenElementType | null
  onToolChange: (tool: Tool) => void
  onUndoRedoChange: (canUndo: boolean, canRedo: boolean) => void
  undoRef: React.MutableRefObject<(() => void) | null>
  redoRef: React.MutableRefObject<(() => void) | null>
  shapeDefaults: ShapeProperties
  textDefaults: TextProperties
  lineDefaults: LineProperties
  selectedShapeProps: ShapeProperties | null
  selectedTextProps: TextProperties | null
  selectedLineProps: LineProperties | null
  onSelectedShapeChange: (props: ShapeProperties | null) => void
  onSelectedTextChange: (props: TextProperties | null) => void
  onSelectedLineChange: (props: LineProperties | null) => void
  onPanelModeChange: (mode: PanelMode) => void
  onEditingSelectionChange: (editing: boolean) => void
  onSelectedGardenChange: (type: GardenElementType | null, name: string | null, diameter: number | null) => void
  exportJSONRef: React.MutableRefObject<(() => void) | null>
  exportPNGRef: React.MutableRefObject<(() => void) | null>
  mapStyle: MapStyle
  kartverketVisible: boolean
  kartverketOpacity: number
  selectedGardenDiameter: number | null
  areaLabelsVisible: boolean
  zoomInRef: React.MutableRefObject<(() => void) | null>
  zoomOutRef: React.MutableRefObject<(() => void) | null>
  resetViewRef: React.MutableRefObject<(() => void) | null>
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
  activeGardenElement,
  onToolChange,
  onUndoRedoChange,
  undoRef,
  redoRef,
  shapeDefaults,
  textDefaults,
  lineDefaults,
  selectedShapeProps,
  selectedTextProps,
  selectedLineProps,
  onSelectedShapeChange,
  onSelectedTextChange,
  onSelectedLineChange,
  onPanelModeChange,
  onEditingSelectionChange,
  onSelectedGardenChange,
  exportJSONRef,
  exportPNGRef,
  mapStyle,
  kartverketVisible,
  kartverketOpacity,
  selectedGardenDiameter,
  areaLabelsVisible,
  zoomInRef,
  zoomOutRef,
  resetViewRef,
}: MapViewProps) {
  const mapContainerRef = useRef<HTMLDivElement>(null)
  const mapRef = useRef<mapboxgl.Map | null>(null)
  const drawRef = useRef<MapboxDraw | null>(null)
  const historyRef = useRef<UndoRedoHistory | null>(null)
  const activeToolRef = useRef<Tool>(activeTool)
  const popupRef = useRef<mapboxgl.Popup | null>(null)
  const suppressModeSync = useRef(false)
  const shapeDefaultsRef = useRef(shapeDefaults)
  const textDefaultsRef = useRef(textDefaults)
  const lineDefaultsRef = useRef(lineDefaults)
  const activeGardenElementRef = useRef(activeGardenElement)

  useEffect(() => {
    activeGardenElementRef.current = activeGardenElement
  }, [activeGardenElement])

  useEffect(() => {
    shapeDefaultsRef.current = shapeDefaults
  }, [shapeDefaults])
  useEffect(() => {
    textDefaultsRef.current = textDefaults
  }, [textDefaults])
  useEffect(() => {
    lineDefaultsRef.current = lineDefaults
  }, [lineDefaults])

  // Text features state
  const textFeaturesRef = useRef<Feature[]>([])
  const selectedTextIdsRef = useRef<Set<string>>(new Set())
  const textInputRef = useRef<HTMLInputElement | null>(null)
  const textMeasurerRef = useRef<HTMLSpanElement | null>(null)
  const editingTextIdRef = useRef<string | null>(null)
  const justConfirmedTextRef = useRef(false)
  const draggingTextRef = useRef<{
    id: string
    startLngLat: { lng: number; lat: number }
  } | null>(null)
  const draggingScaleRef = useRef<{
    featureId: string
    center: Position
    initialDistance: number
    isCircle: boolean
    initialCoords: Position[]
  } | null>(null)
  const draggingLineRef = useRef<{
    id: string
    startLngLat: { lng: number; lat: number }
  } | null>(null)

  // Line features state
  const lineFeaturesRef = useRef<Feature[]>([])
  const selectedLineIdsRef = useRef<Set<string>>(new Set())
  const drawingLineRef = useRef<Position[] | null>(null)
  const freehandPointsRef = useRef<Position[]>([])
  const lineMouseDownRef = useRef<{ time: number; point: [number, number] } | null>(null)
  const isDraggingLineRef = useRef(false)

  // Line edit mode
  const lineEditIdRef = useRef<string | null>(null)
  const draggingVertexRef = useRef<{
    lineId: string
    vertexIndex: number
    startLngLat: { lng: number; lat: number }
  } | null>(null)

  // Measurement state (ephemeral)
  const measurePointsRef = useRef<Position[]>([])
  const measureFinishedRef = useRef(false)

  // Auto-save
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const saveToStorageRef = useRef<(() => void) | null>(null)

  // Context menu
  const [contextMenu, setContextMenu] = useState<ContextMenuState | null>(null)

  useEffect(() => {
    activeToolRef.current = activeTool
  }, [activeTool])

  /** Debounced save to localStorage */
  const saveToStorage = useCallback(() => {
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current)
    saveTimerRef.current = setTimeout(() => {
      const draw = drawRef.current
      if (!draw) return
      saveProject(draw, textFeaturesRef.current, lineFeaturesRef.current)
    }, 500)
  }, [])

  useEffect(() => {
    saveToStorageRef.current = saveToStorage
  }, [saveToStorage])

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

  /** Update bounding box around selected text features */
  const updateTextSelectionBbox = useCallback((map: mapboxgl.Map) => {
    const source = map.getSource("text-selection-bbox") as mapboxgl.GeoJSONSource
    if (!source) return

    if (selectedTextIdsRef.current.size === 0) {
      source.setData({ type: "FeatureCollection", features: [] })
      return
    }

    // Offscreen canvas for text measurement
    const canvas = document.createElement("canvas")
    const ctx = canvas.getContext("2d")!
    const bboxFeatures: Feature[] = []
    const padding = 8

    for (const id of selectedTextIdsRef.current) {
      const textFeature = textFeaturesRef.current.find(
        (f) => f.properties!.id === id
      )
      if (!textFeature) continue

      const coords = (textFeature.geometry as GeoJSON.Point).coordinates
      const center = map.project([coords[0], coords[1]])
      const label = textFeature.properties!.label || ""
      const fontSize = textFeature.properties!.fontSize || 16

      ctx.font = `${fontSize}px 'Open Sans', Arial, sans-serif`
      const textWidth = ctx.measureText(label).width
      const halfW = textWidth / 2 + padding
      const halfH = fontSize * 0.7 + padding

      const tl = map.unproject([center.x - halfW, center.y - halfH])
      const tr = map.unproject([center.x + halfW, center.y - halfH])
      const br = map.unproject([center.x + halfW, center.y + halfH])
      const bl = map.unproject([center.x - halfW, center.y + halfH])

      // Rectangle polygon
      bboxFeatures.push({
        type: "Feature",
        geometry: {
          type: "Polygon",
          coordinates: [[
            [tl.lng, tl.lat], [tr.lng, tr.lat],
            [br.lng, br.lat], [bl.lng, bl.lat],
            [tl.lng, tl.lat],
          ]],
        },
        properties: {},
      })

      // Corner dots
      for (const corner of [tl, tr, br, bl]) {
        bboxFeatures.push({
          type: "Feature",
          geometry: { type: "Point", coordinates: [corner.lng, corner.lat] },
          properties: {},
        })
      }
    }

    source.setData({ type: "FeatureCollection", features: bboxFeatures })
  }, [])

  /** Sync text features ref to the map GeoJSON source */
  const syncTextLabels = useCallback((map: mapboxgl.Map) => {
    const source = map.getSource("text-labels") as mapboxgl.GeoJSONSource
    if (!source) return
    const features = textFeaturesRef.current
      .filter((f) => f.properties!.id !== editingTextIdRef.current)
      .map((f) => ({
        ...f,
        properties: {
          ...f.properties,
          selected: selectedTextIdsRef.current.has(f.properties!.id),
        },
      }))
    source.setData({ type: "FeatureCollection", features })
    updateTextSelectionBbox(map)
  }, [updateTextSelectionBbox])

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

  /** Sync garden overlays: canopy radiating lines for Tre/Busk */
  const syncGardenOverlays = useCallback((map: mapboxgl.Map, draw: MapboxDraw) => {
    const source = map.getSource("garden-canopy-lines") as mapboxgl.GeoJSONSource
    if (!source) return

    const features = draw.getAll().features
    const lineFeatures: GeoJSON.Feature[] = []

    for (const f of features) {
      const id = f.id as string
      const props = f.properties || {}
      if (props.featureType !== "garden" || !props.hagenType) continue

      const el = GARDEN_ELEMENTS[props.hagenType as GardenElementType]
      if (!el || el.drawMode !== "circle") continue

      if (f.geometry.type !== "Polygon") continue
      const ring = (f.geometry as GeoJSON.Polygon).coordinates[0]
      if (!ring || ring.length < 4) continue
      const center = centroid(ring)
      const edgePt = ring[0]
      const radiusKm = distanceMeters(center, edgePt) / 1000

      const lines = generateCanopyLines(center, radiusKm, id)
      for (const coords of lines) {
        lineFeatures.push({
          type: "Feature",
          geometry: { type: "LineString", coordinates: coords },
          properties: { fillColor: props.fillColor || el.style.fillColor },
        })
      }
    }

    source.setData({ type: "FeatureCollection", features: lineFeatures })
  }, [])

  /** Sync bounding box + corner handles for selected draw features */
  const syncScaleHandles = useCallback((map: mapboxgl.Map, draw: MapboxDraw) => {
    const handleSource = map.getSource("garden-scale-handles") as mapboxgl.GeoJSONSource
    if (!handleSource) return

    const allFeatures: GeoJSON.Feature[] = []
    const selectedIds = draw.getSelectedIds()
    const mode = draw.getMode()

    // Only show in simple_select with exactly 1 feature selected
    if (mode !== "simple_select" || selectedIds.length !== 1) {
      handleSource.setData({ type: "FeatureCollection", features: [] })
      return
    }

    const feature = draw.get(selectedIds[0])
    if (!feature || feature.geometry.type !== "Polygon") {
      handleSource.setData({ type: "FeatureCollection", features: [] })
      return
    }

    // Compute bounding box in screen space, then back to lngLat
    const ring = (feature.geometry as GeoJSON.Polygon).coordinates[0]
    if (!ring || ring.length < 4) {
      handleSource.setData({ type: "FeatureCollection", features: [] })
      return
    }

    const padding = 10
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity
    for (const c of ring) {
      const pt = map.project([c[0], c[1]])
      if (pt.x < minX) minX = pt.x
      if (pt.y < minY) minY = pt.y
      if (pt.x > maxX) maxX = pt.x
      if (pt.y > maxY) maxY = pt.y
    }
    minX -= padding; minY -= padding
    maxX += padding; maxY += padding

    const tl = map.unproject([minX, minY])
    const tr = map.unproject([maxX, minY])
    const br = map.unproject([maxX, maxY])
    const bl = map.unproject([minX, maxY])

    // Bounding box rectangle
    allFeatures.push({
      type: "Feature",
      geometry: {
        type: "Polygon",
        coordinates: [[
          [tl.lng, tl.lat], [tr.lng, tr.lat],
          [br.lng, br.lat], [bl.lng, bl.lat],
          [tl.lng, tl.lat],
        ]],
      },
      properties: { type: "bbox" },
    })

    // 4 corner handles
    for (const corner of [tl, tr, br, bl]) {
      allFeatures.push({
        type: "Feature",
        geometry: { type: "Point", coordinates: [corner.lng, corner.lat] },
        properties: { type: "handle", featureId: selectedIds[0] },
      })
    }

    handleSource.setData({ type: "FeatureCollection", features: allFeatures })
  }, [])

  /** Sync line features to map GeoJSON source, including arrow point features */
  const syncLineFeatures = useCallback((map: mapboxgl.Map) => {
    const source = map.getSource("line-features") as mapboxgl.GeoJSONSource
    if (!source) return
    const features: Feature[] = []
    for (const f of lineFeaturesRef.current) {
      const coords = (f.geometry as GeoJSON.LineString).coordinates
      const selected = selectedLineIdsRef.current.has(f.properties!.id)
      features.push({
        ...f,
        properties: { ...f.properties, selected },
      })
      // Arrow point features
      if (coords.length >= 2) {
        if (f.properties!.startArrow) {
          const p0 = coords[0]
          const p1 = coords[1]
          const bearing = Math.atan2(p0[0] - p1[0], p0[1] - p1[1]) * (180 / Math.PI)
          features.push({
            type: "Feature",
            geometry: { type: "Point", coordinates: p0 },
            properties: { bearing, strokeColor: f.properties!.strokeColor, arrowType: "start" },
          })
        }
        if (f.properties!.endArrow) {
          const pLast = coords[coords.length - 1]
          const pPrev = coords[coords.length - 2]
          const bearing = Math.atan2(pLast[0] - pPrev[0], pLast[1] - pPrev[1]) * (180 / Math.PI)
          features.push({
            type: "Feature",
            geometry: { type: "Point", coordinates: pLast },
            properties: { bearing, strokeColor: f.properties!.strokeColor, arrowType: "end" },
          })
        }
      }
    }
    source.setData({ type: "FeatureCollection", features })

    // Update selection bbox for lines
    const bboxSource = map.getSource("line-selection-bbox") as mapboxgl.GeoJSONSource
    if (bboxSource) {
      if (selectedLineIdsRef.current.size === 0) {
        bboxSource.setData({ type: "FeatureCollection", features: [] })
        return
      }

      const bboxFeatures: Feature[] = []
      const editId = lineEditIdRef.current
      const padding = 10

      for (const id of selectedLineIdsRef.current) {
        const lineF = lineFeaturesRef.current.find(lf => lf.properties!.id === id)
        if (!lineF) continue
        const coords = (lineF.geometry as GeoJSON.LineString).coordinates

        if (editId === id) {
          // Edit mode: show individual vertex dots
          for (let i = 0; i < coords.length; i++) {
            bboxFeatures.push({
              type: "Feature",
              geometry: { type: "Point", coordinates: coords[i] },
              properties: { vertexIndex: i, lineId: id },
            })
          }
        } else {
          // Normal selection: show bounding box rectangle
          let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity
          for (const c of coords) {
            const pt = map.project([c[0], c[1]])
            if (pt.x < minX) minX = pt.x
            if (pt.y < minY) minY = pt.y
            if (pt.x > maxX) maxX = pt.x
            if (pt.y > maxY) maxY = pt.y
          }
          minX -= padding; minY -= padding
          maxX += padding; maxY += padding

          const tl = map.unproject([minX, minY])
          const tr = map.unproject([maxX, minY])
          const br = map.unproject([maxX, maxY])
          const bl = map.unproject([minX, maxY])

          bboxFeatures.push({
            type: "Feature",
            geometry: {
              type: "Polygon",
              coordinates: [[
                [tl.lng, tl.lat], [tr.lng, tr.lat],
                [br.lng, br.lat], [bl.lng, bl.lat],
                [tl.lng, tl.lat],
              ]],
            },
            properties: { lineId: id },
          })
          for (const corner of [tl, tr, br, bl]) {
            bboxFeatures.push({
              type: "Feature",
              geometry: { type: "Point", coordinates: [corner.lng, corner.lat] },
              properties: { lineId: id },
            })
          }
        }
      }
      bboxSource.setData({ type: "FeatureCollection", features: bboxFeatures })
    }
  }, [])

  /** Sync measurement overlay */
  const syncMeasurement = useCallback((map: mapboxgl.Map, cursorPos?: Position) => {
    const source = map.getSource("measurement-overlay") as mapboxgl.GeoJSONSource
    if (!source) return
    const pts = measurePointsRef.current
    const features: Feature[] = []

    // Include cursor position for live preview
    const allPts = cursorPos && !measureFinishedRef.current ? [...pts, cursorPos] : pts

    if (allPts.length === 0) {
      source.setData({ type: "FeatureCollection", features: [] })
      return
    }

    // Point dots
    for (const p of pts) {
      features.push({
        type: "Feature",
        geometry: { type: "Point", coordinates: p },
        properties: { type: "dot" },
      })
    }

    // Line segments with distance labels
    if (allPts.length >= 2) {
      features.push({
        type: "Feature",
        geometry: { type: "LineString", coordinates: allPts },
        properties: { type: "line" },
      })

      // Segment midpoint labels
      let totalDist = 0
      for (let i = 1; i < allPts.length; i++) {
        const d = distanceMeters(allPts[i - 1], allPts[i])
        totalDist += d
        const mid: Position = [
          (allPts[i - 1][0] + allPts[i][0]) / 2,
          (allPts[i - 1][1] + allPts[i][1]) / 2,
        ]
        features.push({
          type: "Feature",
          geometry: { type: "Point", coordinates: mid },
          properties: { type: "label", label: formatDistance(d) },
        })
      }

      // Total distance label at last point
      if (allPts.length >= 3) {
        features.push({
          type: "Feature",
          geometry: { type: "Point", coordinates: allPts[allPts.length - 1] },
          properties: { type: "total", label: `Total: ${formatDistance(totalDist)}` },
        })
      }

      // Area if 3+ confirmed points
      if (pts.length >= 3) {
        // Closing line
        features.push({
          type: "Feature",
          geometry: { type: "LineString", coordinates: [pts[pts.length - 1], pts[0]] },
          properties: { type: "closing-line" },
        })
        const ring = [...pts, pts[0]]
        const area = polygonAreaSqm(ring)
        if (area >= 0.1) {
          const center = centroid(ring)
          features.push({
            type: "Feature",
            geometry: { type: "Point", coordinates: center },
            properties: { type: "area-label", label: formatArea(area) },
          })
        }
      }
    }

    source.setData({ type: "FeatureCollection", features })
  }, [])

  /** Push current state to history */
  const pushHistory = useCallback(() => {
    const draw = drawRef.current
    const history = historyRef.current
    if (!draw || !history) return
    history.push({
      drawFeatures: draw.getAll().features,
      textFeatures: [...textFeaturesRef.current],
      lineFeatures: [...lineFeaturesRef.current],
    })
    saveToStorage()
  }, [saveToStorage])

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
      lineFeaturesRef.current = [...(snapshot.lineFeatures || [])]
      selectedTextIdsRef.current.clear()
      selectedLineIdsRef.current.clear()
      syncTextLabels(map)
      syncLineFeatures(map)
      updateAreaLabels(map, draw)
      syncGardenOverlays(map, draw)
      saveToStorage()
    },
    [updateAreaLabels, syncTextLabels, syncLineFeatures, syncGardenOverlays, saveToStorage]
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
    if (textMeasurerRef.current) {
      textMeasurerRef.current.remove()
      textMeasurerRef.current = null
    }
    const wasEditing = editingTextIdRef.current !== null
    editingTextIdRef.current = null
    // Re-show hidden text if editing was cancelled
    if (wasEditing) {
      const map = mapRef.current
      if (map) syncTextLabels(map)
    }
  }, [syncTextLabels])

  /** Show a text input overlay at a map position */
  const showTextInput = useCallback(
    (
      map: mapboxgl.Map,
      lngLat: { lng: number; lat: number },
      initialValue: string,
      onConfirm: (value: string) => void,
      style?: { fontSize?: number; textColor?: string }
    ) => {
      removeTextInput()
      const point = map.project([lngLat.lng, lngLat.lat])
      const input = document.createElement("input")
      input.type = "text"
      input.className = "text-label-input"
      input.value = initialValue
      input.style.left = `${point.x}px`
      input.style.top = `${point.y}px`
      if (style?.fontSize) input.style.fontSize = `${style.fontSize}px`
      if (style?.textColor) input.style.color = style.textColor

      // Auto-sizing: hidden span to measure text width
      const measurer = document.createElement("span")
      measurer.style.position = "absolute"
      measurer.style.visibility = "hidden"
      measurer.style.whiteSpace = "pre"
      measurer.style.fontFamily = "'Open Sans', Arial, sans-serif"
      measurer.style.fontSize = input.style.fontSize || "16px"
      measurer.style.padding = "0 4px"
      document.body.appendChild(measurer)
      textMeasurerRef.current = measurer

      const autoSize = () => {
        measurer.textContent = input.value || "T"
        input.style.width = `${Math.max(measurer.offsetWidth + 8, 20)}px`
      }
      input.addEventListener("input", autoSize)
      autoSize()

      let confirmed = false
      const confirm = () => {
        if (confirmed) return
        confirmed = true
        const value = input.value.trim()
        if (value) {
          onConfirm(value)
          // Suppress the empty-space click that follows the blur event
          // (mousedown→blur→confirm runs synchronously, but click fires ~50-150ms later)
          justConfirmedTextRef.current = true
          setTimeout(() => {
            justConfirmedTextRef.current = false
          }, 300)
        }
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
          confirmed = true // prevent blur from saving
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
      userProperties: true,
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
      // Register garden fill patterns (before layers reference them)
      registerGardenPatterns(map)

      // Add all custom layers
      addKartverketLayer(map)
      addUserPlotLayer(map)
      addAreaLabelsLayer(map)
      addTextLabelsLayers(map)
      addLineFeatureLayers(map)
      addMeasurementLayers(map)
      addCanopyLinesLayer(map)
      addScaleHandlesLayer(map)

      // Recalculate text and line bbox on map move/zoom
      map.on("move", () => {
        if (selectedTextIdsRef.current.size > 0) {
          updateTextSelectionBbox(map)
        }
        if (selectedLineIdsRef.current.size > 0) {
          syncLineFeatures(map)
        }
        // Update draw feature bounding box (screen-space)
        if (draw.getSelectedIds().length > 0) {
          syncScaleHandles(map, draw)
        }
      })

      // Hover tooltip for garden feature names
      const hoverPopup = new mapboxgl.Popup({
        closeButton: false,
        closeOnClick: false,
        className: "garden-name-tooltip",
        offset: [0, -10],
      })
      const drawLayerIds = (map.getStyle().layers || [])
        .filter((l) => l.id.startsWith("gl-draw-"))
        .map((l) => l.id)

      map.on("mousemove", (e: mapboxgl.MapMouseEvent) => {
        if (drawLayerIds.length === 0) return
        const hits = map.queryRenderedFeatures(e.point, { layers: drawLayerIds })
        const gardenHit = hits.find((f) => f.properties?.user_gardenName)
        if (gardenHit) {
          map.getCanvas().style.cursor = "pointer"
          hoverPopup
            .setLngLat(e.lngLat)
            .setHTML(`<div class="garden-tooltip-text">${gardenHit.properties!.user_gardenName}</div>`)
            .addTo(map)
        } else {
          if (hoverPopup.isOpen()) hoverPopup.remove()
        }
      })

      // Load saved project from localStorage
      let loaded = false
      const saved = loadProject()
      if (saved) {
        for (const feature of saved.drawFeatures || []) {
          draw.add(feature)
        }
        textFeaturesRef.current = saved.textFeatures || []
        lineFeaturesRef.current = saved.lineFeatures || []
        syncTextLabels(map)
        syncLineFeatures(map)
        updateAreaLabels(map, draw)
        syncGardenOverlays(map, draw)
        loaded = true
      }

      history.push({
        drawFeatures: loaded ? draw.getAll().features : [],
        textFeatures: loaded ? [...textFeaturesRef.current] : [],
        lineFeatures: loaded ? [...lineFeaturesRef.current] : [],
      })
    })

    // Draw events
    map.on("draw.create", (e: { features: GeoJSON.Feature[] }) => {
      const gardenType = activeGardenElementRef.current
      for (const feature of e.features) {
        const id = feature.id as string
        const current = draw.get(id)
        if (!current) continue

        if (gardenType) {
          // Garden element — use garden-specific styles
          const el = GARDEN_ELEMENTS[gardenType as GardenElementType]
          const gProps: Record<string, unknown> = {}

          // Calculate diameter for circle elements (tre, busk)
          if (el.drawMode === "circle" && current.geometry.type === "Polygon") {
            const ring = (current.geometry as GeoJSON.Polygon).coordinates[0]
            if (ring && ring.length > 2) {
              const center = centroid(ring)
              const edgePt = ring[0]
              const radiusM = distanceMeters(center, edgePt)
              gProps.diameter = Math.round(radiusM * 2 * 10) / 10 // round to 0.1m
            }
          }

          current.properties = {
            ...current.properties,
            featureType: "garden",
            hagenType: gardenType,
            fillColor: el.style.fillColor,
            fillOpacity: el.style.fillOpacity,
            strokeColor: el.style.strokeColor,
            strokeWidth: el.style.strokeWidth,
            gardenProps: gProps,
          }
        } else {
          // Raw element — use shape defaults
          const defaults = shapeDefaultsRef.current
          current.properties = {
            ...current.properties,
            featureType: "raw",
            fillColor: defaults.fillColor,
            fillOpacity: defaults.fillOpacity,
            strokeColor: defaults.strokeColor,
            strokeWidth: defaults.strokeWidth,
            zone: defaults.zone,
          }
        }
        draw.add(current)
      }
      updateAreaLabels(map, draw)
      syncGardenOverlays(map, draw)
      history.push({
        drawFeatures: draw.getAll().features,
        textFeatures: [...textFeaturesRef.current],
        lineFeatures: [...lineFeaturesRef.current],
      })
      saveToStorageRef.current?.()
    })

    map.on("draw.update", () => {
      updateAreaLabels(map, draw)
      syncGardenOverlays(map, draw)
      history.push({
        drawFeatures: draw.getAll().features,
        textFeatures: [...textFeaturesRef.current],
        lineFeatures: [...lineFeaturesRef.current],
      })
      saveToStorageRef.current?.()
    })

    map.on("draw.delete", () => {
      updateAreaLabels(map, draw)
      syncGardenOverlays(map, draw)
      history.push({
        drawFeatures: draw.getAll().features,
        textFeatures: [...textFeaturesRef.current],
        lineFeatures: [...lineFeaturesRef.current],
      })
      saveToStorageRef.current?.()
    })

    // Auto-switch tool to select after shape completion (not text tool)
    map.on("draw.modechange", (e: { mode: string }) => {
      if (suppressModeSync.current) return
      if (e.mode === "simple_select" && activeToolRef.current !== "select" && activeToolRef.current !== "text" && activeToolRef.current !== "line" && activeToolRef.current !== "measure") {
        onToolChange("select")
      }
    })

    // Track selection and update properties panel
    map.on("draw.selectionchange", (e: { features: GeoJSON.Feature[] }) => {
      if (map.getLayer("area-labels")) {
        map.setLayoutProperty(
          "area-labels",
          "visibility",
          e.features.length > 0 ? "none" : "visible"
        )
      }
      // Update panel with selected feature properties
      if (e.features.length > 0) {
        const f = e.features[0]
        const props = f.properties || {}

        if (props.featureType === "garden" && props.hagenType) {
          // Garden feature selected
          const gProps = typeof props.gardenProps === "string"
            ? JSON.parse(props.gardenProps)
            : (props.gardenProps || {})
          onPanelModeChange("garden")
          onEditingSelectionChange(true)
          onSelectedGardenChange(
            props.hagenType as GardenElementType,
            props.gardenName || null,
            gProps.diameter ?? null,
          )
        } else {
          // Raw feature selected
          onPanelModeChange("shape")
          onEditingSelectionChange(true)
          onSelectedShapeChange({
            fillColor: props.fillColor || "#4ade80",
            fillOpacity: props.fillOpacity ?? 0.4,
            strokeColor: props.strokeColor || "#4ade80",
            strokeWidth: props.strokeWidth ?? 2,
            zone: props.zone || "Lawn",
          })
          onSelectedGardenChange(null, null, null)
        }
      } else if (
        activeToolRef.current === "select"
      ) {
        // Only clear if no text is selected either
        if (selectedTextIdsRef.current.size === 0) {
          onPanelModeChange("none")
          onEditingSelectionChange(false)
        }
      }
      syncScaleHandles(map, draw)
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

      const td = textDefaultsRef.current
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
            textColor: td.textColor,
            fontSize: td.fontSize,
          },
        }
        textFeaturesRef.current = [...textFeaturesRef.current, feature]
        // Auto-select the new text and switch to select tool
        selectedTextIdsRef.current.clear()
        selectedTextIdsRef.current.add(id)
        syncTextLabels(map)
        activeToolRef.current = "select" // Sync ref immediately to prevent text tool click re-firing
        onToolChange("select")
        onPanelModeChange("text")
        onEditingSelectionChange(true)
        onSelectedTextChange({
          textColor: td.textColor,
          fontSize: td.fontSize,
        })
        history.push({
          drawFeatures: draw.getAll().features,
          textFeatures: [...textFeaturesRef.current],
          lineFeatures: [...lineFeaturesRef.current],
        })
        saveToStorageRef.current?.()
      }, { fontSize: td.fontSize, textColor: td.textColor })
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
          if (selectedTextIdsRef.current.has(hitId)) {
            selectedTextIdsRef.current.delete(hitId)
          } else {
            selectedTextIdsRef.current.add(hitId)
          }
        } else {
          selectedTextIdsRef.current.clear()
          selectedTextIdsRef.current.add(hitId)
          draw.changeMode("simple_select")
        }
        syncTextLabels(map)
        // Populate panel with selected text properties
        const feature = textFeaturesRef.current.find(
          (f) => f.properties!.id === hitId
        )
        if (feature) {
          onPanelModeChange("text")
          onEditingSelectionChange(true)
          onSelectedTextChange({
            textColor: feature.properties!.textColor || "#ffffff",
            fontSize: feature.properties!.fontSize || 16,
          })
        }
        return
      }

      // Check line hits
      const lineHits = map.queryRenderedFeatures(e.point, {
        layers: map.getLayer("line-features-hit") ? ["line-features-hit"] : map.getLayer("line-features-stroke") ? ["line-features-stroke"] : [],
      })
      if (lineHits.length > 0) {
        const hitId = lineHits[0].properties!.id as string
        if (hitId) {
          selectedLineIdsRef.current.clear()
          selectedLineIdsRef.current.add(hitId)
          selectedTextIdsRef.current.clear()
          draw.changeMode("simple_select")
          syncTextLabels(map)
          syncLineFeatures(map)
          const lineFeature = lineFeaturesRef.current.find(f => f.properties!.id === hitId)
          if (lineFeature) {
            onPanelModeChange("line")
            onEditingSelectionChange(true)
            onSelectedLineChange({
              strokeColor: lineFeature.properties!.strokeColor || "#ffffff",
              strokeWidth: lineFeature.properties!.strokeWidth ?? 2,
              startArrow: lineFeature.properties!.startArrow || false,
              endArrow: lineFeature.properties!.endArrow || false,
            })
          }
          return
        }
      }

      // Click inside a selected line's bounding box — preserve selection
      const bboxFillHits = map.queryRenderedFeatures(e.point, {
        layers: map.getLayer("line-selection-bbox-fill") ? ["line-selection-bbox-fill"] : [],
      })
      if (bboxFillHits.length > 0) return

      // Click on empty space — exit edit mode or deselect
      if (lineEditIdRef.current) {
        // Exit line edit mode first (keep selection)
        lineEditIdRef.current = null
        syncLineFeatures(map)
        return
      }
      if (selectedTextIdsRef.current.size > 0 || selectedLineIdsRef.current.size > 0) {
        if (justConfirmedTextRef.current) return
        selectedTextIdsRef.current.clear()
        selectedLineIdsRef.current.clear()
        syncTextLabels(map)
        syncLineFeatures(map)
        if (draw.getSelectedIds().length === 0) {
          onPanelModeChange("none")
          onEditingSelectionChange(false)
        }
      }
    })

    // Double-click to enter line edit mode
    map.on("dblclick", (e: mapboxgl.MapMouseEvent) => {
      if (activeToolRef.current !== "select") return
      let hitId: string | null = null
      // Check line stroke first
      const lineHits = map.queryRenderedFeatures(e.point, {
        layers: map.getLayer("line-features-hit") ? ["line-features-hit"] : map.getLayer("line-features-stroke") ? ["line-features-stroke"] : [],
      })
      if (lineHits.length > 0) {
        hitId = lineHits[0].properties!.id as string
      } else {
        // Fall back to bounding box fill area
        const bboxHits = map.queryRenderedFeatures(e.point, {
          layers: map.getLayer("line-selection-bbox-fill") ? ["line-selection-bbox-fill"] : [],
        })
        if (bboxHits.length > 0) {
          hitId = bboxHits[0].properties!.lineId as string
        }
      }
      if (!hitId || !selectedLineIdsRef.current.has(hitId)) return
      e.preventDefault()
      lineEditIdRef.current = hitId
      syncLineFeatures(map)
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
      syncTextLabels(map) // hide the old text while editing
      const coords = (feature.geometry as GeoJSON.Point).coordinates
      const props = feature.properties!
      showTextInput(
        map,
        { lng: coords[0], lat: coords[1] },
        props.label,
        (value) => {
          textFeaturesRef.current = textFeaturesRef.current.map((f) =>
            f.properties!.id === hitId
              ? { ...f, properties: { ...f.properties!, label: value } }
              : f
          )
          editingTextIdRef.current = null
          syncTextLabels(map)
          history.push({
            drawFeatures: draw.getAll().features,
            textFeatures: [...textFeaturesRef.current],
            lineFeatures: [...lineFeaturesRef.current],
          })
          saveToStorageRef.current?.()
        },
        { fontSize: props.fontSize, textColor: props.textColor }
      )
    })

    // Line tool: mousedown to start tracking click vs drag
    map.on("mousedown", (e: mapboxgl.MapMouseEvent) => {
      if (activeToolRef.current !== "line") return
      if (textInputRef.current) return
      map.dragPan.disable()
      lineMouseDownRef.current = {
        time: Date.now(),
        point: [e.point.x, e.point.y],
      }
      isDraggingLineRef.current = false
      freehandPointsRef.current = [[e.lngLat.lng, e.lngLat.lat]]
    })

    // Line tool + Measure tool: mousemove
    map.on("mousemove", (e: mapboxgl.MapMouseEvent) => {
      // Line tool: freehand or preview
      if (activeToolRef.current === "line") {
        const md = lineMouseDownRef.current
        if (md) {
          const dx = e.point.x - md.point[0]
          const dy = e.point.y - md.point[1]
          if (!isDraggingLineRef.current && Math.sqrt(dx * dx + dy * dy) > 5) {
            isDraggingLineRef.current = true
            map.dragPan.disable()
          }
          if (isDraggingLineRef.current) {
            freehandPointsRef.current.push([e.lngLat.lng, e.lngLat.lat])
            // Update preview with freehand path
            const previewSource = map.getSource("line-drawing-preview") as mapboxgl.GeoJSONSource
            if (previewSource) {
              previewSource.setData({
                type: "FeatureCollection",
                features: [{
                  type: "Feature",
                  geometry: { type: "LineString", coordinates: freehandPointsRef.current },
                  properties: {},
                }],
              })
            }
          }
        }
        // Preview line from last polyline point to cursor
        if (!md && drawingLineRef.current && drawingLineRef.current.length > 0) {
          const previewSource = map.getSource("line-drawing-preview") as mapboxgl.GeoJSONSource
          if (previewSource) {
            previewSource.setData({
              type: "FeatureCollection",
              features: [{
                type: "Feature",
                geometry: {
                  type: "LineString",
                  coordinates: [...drawingLineRef.current, [e.lngLat.lng, e.lngLat.lat]],
                },
                properties: {},
              }],
            })
          }
        }
      }

      // Measure tool: live preview
      if (activeToolRef.current === "measure" && measurePointsRef.current.length > 0 && !measureFinishedRef.current) {
        syncMeasurement(map, [e.lngLat.lng, e.lngLat.lat])
      }
    })

    // Line tool: mouseup — finish freehand or register click
    map.on("mouseup", (e: mapboxgl.MapMouseEvent) => {
      if (activeToolRef.current !== "line") return
      const md = lineMouseDownRef.current
      if (!md) return
      lineMouseDownRef.current = null
      map.dragPan.enable()

      if (isDraggingLineRef.current) {
        // Finish freehand drawing
        isDraggingLineRef.current = false
        const simplified = simplify(freehandPointsRef.current, 0.000003)
        freehandPointsRef.current = []
        if (simplified.length < 2) return
        const ld = lineDefaultsRef.current
        const id = crypto.randomUUID()
        const feature: Feature = {
          type: "Feature",
          geometry: { type: "LineString", coordinates: simplified },
          properties: {
            id,
            strokeColor: ld.strokeColor,
            strokeWidth: ld.strokeWidth,
            startArrow: ld.startArrow,
            endArrow: ld.endArrow,
          },
        }
        lineFeaturesRef.current = [...lineFeaturesRef.current, feature]
        selectedLineIdsRef.current.clear()
        selectedLineIdsRef.current.add(id)
        syncLineFeatures(map)
        // Clear preview
        const previewSource = map.getSource("line-drawing-preview") as mapboxgl.GeoJSONSource
        if (previewSource) previewSource.setData({ type: "FeatureCollection", features: [] })
        onToolChange("select")
        onPanelModeChange("line")
        onEditingSelectionChange(true)
        onSelectedLineChange(ld)
        history.push({
          drawFeatures: draw.getAll().features,
          textFeatures: [...textFeaturesRef.current],
          lineFeatures: [...lineFeaturesRef.current],
        })
        saveToStorageRef.current?.()
        return
      }

      // Click (not drag) — polyline mode
      const point: Position = [e.lngLat.lng, e.lngLat.lat]
      if (!drawingLineRef.current) {
        drawingLineRef.current = [point]
      } else {
        drawingLineRef.current.push(point)
      }
    })

    // Line tool: double-click to finish polyline
    map.on("dblclick", (e: mapboxgl.MapMouseEvent) => {
      if (activeToolRef.current !== "line") {
        // Measure tool double-click
        if (activeToolRef.current === "measure" && measurePointsRef.current.length >= 2) {
          e.preventDefault()
          // Remove duplicate last point from double-click
          measurePointsRef.current.pop()
          measureFinishedRef.current = true
          syncMeasurement(map)
          return
        }
        return
      }
      e.preventDefault()
      if (!drawingLineRef.current) return
      // Remove duplicate last point (double-click fires two clicks first)
      if (drawingLineRef.current.length > 1) {
        drawingLineRef.current.pop()
      }
      if (drawingLineRef.current.length < 2) {
        drawingLineRef.current = null
        const previewSource = map.getSource("line-drawing-preview") as mapboxgl.GeoJSONSource
        if (previewSource) previewSource.setData({ type: "FeatureCollection", features: [] })
        return
      }
      const ld = lineDefaultsRef.current
      const id = crypto.randomUUID()
      const feature: Feature = {
        type: "Feature",
        geometry: { type: "LineString", coordinates: drawingLineRef.current },
        properties: {
          id,
          strokeColor: ld.strokeColor,
          strokeWidth: ld.strokeWidth,
          startArrow: ld.startArrow,
          endArrow: ld.endArrow,
        },
      }
      lineFeaturesRef.current = [...lineFeaturesRef.current, feature]
      drawingLineRef.current = null
      selectedLineIdsRef.current.clear()
      selectedLineIdsRef.current.add(id)
      syncLineFeatures(map)
      const previewSource = map.getSource("line-drawing-preview") as mapboxgl.GeoJSONSource
      if (previewSource) previewSource.setData({ type: "FeatureCollection", features: [] })
      onToolChange("select")
      onPanelModeChange("line")
      onEditingSelectionChange(true)
      onSelectedLineChange(ld)
      history.push({
        drawFeatures: draw.getAll().features,
        textFeatures: [...textFeaturesRef.current],
        lineFeatures: [...lineFeaturesRef.current],
      })
      saveToStorageRef.current?.()
    })

    // Measure tool: click to add points
    map.on("click", (e: mapboxgl.MapMouseEvent) => {
      if (activeToolRef.current !== "measure") return
      if (measureFinishedRef.current) {
        // Start new measurement
        measurePointsRef.current = []
        measureFinishedRef.current = false
      }
      measurePointsRef.current.push([e.lngLat.lng, e.lngLat.lat])
      syncMeasurement(map)
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

    // Text label dragging
    map.on("mousedown", (e: mapboxgl.MapMouseEvent) => {
      if (activeToolRef.current !== "select") return
      if (textInputRef.current) return

      const textHits = map.queryRenderedFeatures(e.point, {
        layers: ["text-labels"],
      })
      if (textHits.length === 0) return

      const hitId = textHits[0].properties!.id as string
      if (!selectedTextIdsRef.current.has(hitId)) return

      e.preventDefault()
      draggingTextRef.current = {
        id: hitId,
        startLngLat: e.lngLat,
      }
      map.getCanvas().style.cursor = "move"
      map.dragPan.disable()
    })

    map.on("mousemove", (e: mapboxgl.MapMouseEvent) => {
      if (!draggingTextRef.current) return
      const dragInfo = draggingTextRef.current
      const dLng = e.lngLat.lng - dragInfo.startLngLat.lng
      const dLat = e.lngLat.lat - dragInfo.startLngLat.lat

      // Move all selected text features
      textFeaturesRef.current = textFeaturesRef.current.map((f) => {
        if (!selectedTextIdsRef.current.has(f.properties!.id)) return f
        const coords = (f.geometry as GeoJSON.Point).coordinates
        return {
          ...f,
          geometry: {
            type: "Point" as const,
            coordinates: [coords[0] + dLng, coords[1] + dLat],
          },
        }
      })
      draggingTextRef.current = {
        id: dragInfo.id,
        startLngLat: e.lngLat,
      }
      syncTextLabels(map)
    })

    map.on("mouseup", () => {
      if (!draggingTextRef.current) return
      draggingTextRef.current = null
      map.getCanvas().style.cursor = ""
      if (activeToolRef.current === "select") {
        map.dragPan.enable()
      }
      history.push({
        drawFeatures: draw.getAll().features,
        textFeatures: [...textFeaturesRef.current],
        lineFeatures: [...lineFeaturesRef.current],
      })
      saveToStorageRef.current?.()
    })

    // Line feature dragging + vertex editing
    map.on("mousedown", (e: mapboxgl.MapMouseEvent) => {
      if (activeToolRef.current !== "select") return
      if (textInputRef.current) return
      if (draggingTextRef.current) return

      // In edit mode: check for vertex hits first
      if (lineEditIdRef.current) {
        const vertexHits = map.queryRenderedFeatures(e.point, {
          layers: map.getLayer("line-selection-bbox-corners") ? ["line-selection-bbox-corners"] : [],
        })
        if (vertexHits.length > 0) {
          const props = vertexHits[0].properties
          if (props && props.vertexIndex !== undefined && props.lineId) {
            e.preventDefault()
            draggingVertexRef.current = {
              lineId: props.lineId as string,
              vertexIndex: props.vertexIndex as number,
              startLngLat: e.lngLat,
            }
            map.getCanvas().style.cursor = "move"
            map.dragPan.disable()
            return
          }
        }
      }

      // Normal line dragging
      const lineHits = map.queryRenderedFeatures(e.point, {
        layers: map.getLayer("line-features-hit") ? ["line-features-hit"] : map.getLayer("line-features-stroke") ? ["line-features-stroke"] : [],
      })
      if (lineHits.length === 0) return
      const hitId = lineHits[0].properties!.id as string
      if (!hitId || !selectedLineIdsRef.current.has(hitId)) return
      e.preventDefault()
      draggingLineRef.current = { id: hitId, startLngLat: e.lngLat }
      map.getCanvas().style.cursor = "move"
      map.dragPan.disable()
    })

    map.on("mousemove", (e: mapboxgl.MapMouseEvent) => {
      // Vertex dragging
      if (draggingVertexRef.current) {
        const vd = draggingVertexRef.current
        lineFeaturesRef.current = lineFeaturesRef.current.map((f) => {
          if (f.properties!.id !== vd.lineId) return f
          const coords = [...(f.geometry as GeoJSON.LineString).coordinates]
          coords[vd.vertexIndex] = [e.lngLat.lng, e.lngLat.lat]
          return {
            ...f,
            geometry: { type: "LineString" as const, coordinates: coords },
          }
        })
        syncLineFeatures(map)
        return
      }
      // Line dragging
      if (!draggingLineRef.current) return
      const dLng = e.lngLat.lng - draggingLineRef.current.startLngLat.lng
      const dLat = e.lngLat.lat - draggingLineRef.current.startLngLat.lat
      lineFeaturesRef.current = lineFeaturesRef.current.map((f) => {
        if (!selectedLineIdsRef.current.has(f.properties!.id)) return f
        const coords = (f.geometry as GeoJSON.LineString).coordinates
        return {
          ...f,
          geometry: {
            type: "LineString" as const,
            coordinates: coords.map((c) => [c[0] + dLng, c[1] + dLat]),
          },
        }
      })
      draggingLineRef.current = { ...draggingLineRef.current, startLngLat: e.lngLat }
      syncLineFeatures(map)
    })

    map.on("mouseup", () => {
      if (draggingVertexRef.current) {
        draggingVertexRef.current = null
        map.getCanvas().style.cursor = ""
        map.dragPan.enable()
        history.push({
          drawFeatures: draw.getAll().features,
          textFeatures: [...textFeaturesRef.current],
          lineFeatures: [...lineFeaturesRef.current],
        })
        saveToStorageRef.current?.()
        return
      }
      if (!draggingLineRef.current) return
      draggingLineRef.current = null
      map.getCanvas().style.cursor = ""
      if (activeToolRef.current === "select") {
        map.dragPan.enable()
      }
      history.push({
        drawFeatures: draw.getAll().features,
        textFeatures: [...textFeaturesRef.current],
        lineFeatures: [...lineFeaturesRef.current],
      })
      saveToStorageRef.current?.()
    })

    // Close context menu on map interaction
    map.on("movestart", () => setContextMenu(null))

    // Scale handle dragging — works for all selected draw features
    map.on("mousedown", (e: mapboxgl.MapMouseEvent) => {
      if (activeToolRef.current !== "select") return
      const handleHits = map.queryRenderedFeatures(e.point, {
        layers: map.getLayer("garden-scale-handles") ? ["garden-scale-handles"] : [],
      })
      if (handleHits.length === 0) return

      const featureId = handleHits[0].properties?.featureId as string
      if (!featureId) return

      const feature = draw.get(featureId)
      if (!feature || feature.geometry.type !== "Polygon") return
      const ring = (feature.geometry as GeoJSON.Polygon).coordinates[0]
      if (!ring || ring.length < 4) return

      const center = centroid(ring)
      const cursor: Position = [e.lngLat.lng, e.lngLat.lat]
      const initialDistance = distanceMeters(center, cursor)
      if (initialDistance <= 0) return

      const props = feature.properties || {}
      const el = props.hagenType ? GARDEN_ELEMENTS[props.hagenType as GardenElementType] : null
      const isCircle = !!(el && el.drawMode === "circle")

      e.preventDefault()
      draggingScaleRef.current = {
        featureId,
        center,
        initialDistance,
        isCircle,
        initialCoords: ring.map(c => [...c]),
      }
      map.getCanvas().style.cursor = "nwse-resize"
      map.dragPan.disable()
    })

    map.on("mousemove", (e: mapboxgl.MapMouseEvent) => {
      if (!draggingScaleRef.current) return
      const { featureId, center, initialDistance, isCircle, initialCoords } = draggingScaleRef.current
      const cursor: Position = [e.lngLat.lng, e.lngLat.lat]
      const currentDistance = distanceMeters(center, cursor)
      if (currentDistance <= 0) return
      const scale = currentDistance / initialDistance

      const feature = draw.get(featureId)
      if (!feature) return
      const props = feature.properties || {}

      if (isCircle) {
        // Regenerate circle at new radius
        const newRadiusKm = (currentDistance) / 1000
        const newCoords = createCirclePolygon(center, newRadiusKm, { jagged: true })
        feature.geometry = { type: "Polygon", coordinates: [newCoords] }

        // Update gardenProps diameter
        const gProps = typeof props.gardenProps === "string"
          ? JSON.parse(props.gardenProps)
          : { ...(props.gardenProps || {}) }
        gProps.diameter = Math.round(currentDistance * 2 * 10) / 10
        feature.properties = { ...props, gardenProps: gProps }

        // Update panel
        onSelectedGardenChange(
          props.hagenType as GardenElementType,
          props.gardenName || null,
          gProps.diameter,
        )
      } else {
        // Scale polygon uniformly around center
        const mLat = 111320
        const mLng = 111320 * Math.cos((center[1] * Math.PI) / 180)
        const newCoords = initialCoords.map(c => {
          const dx = (c[0] - center[0]) * mLng
          const dy = (c[1] - center[1]) * mLat
          return [
            center[0] + (dx * scale) / mLng,
            center[1] + (dy * scale) / mLat,
          ]
        })
        feature.geometry = { type: "Polygon", coordinates: [newCoords] }
      }

      draw.add(feature)
      syncGardenOverlays(map, draw)
      syncScaleHandles(map, draw)
    })

    map.on("mouseup", () => {
      if (!draggingScaleRef.current) return
      draggingScaleRef.current = null
      map.getCanvas().style.cursor = ""
      if (activeToolRef.current === "select") {
        map.dragPan.enable()
      }
      updateAreaLabels(map, draw)
      history.push({
        drawFeatures: draw.getAll().features,
        textFeatures: [...textFeaturesRef.current],
        lineFeatures: [...lineFeaturesRef.current],
      })
      saveToStorageRef.current?.()
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
  }, [
    onZoomChange,
    onUndoRedoChange,
    onToolChange,
    onPanelModeChange,
    onEditingSelectionChange,
    onSelectedShapeChange,
    onSelectedTextChange,
    addUserPlotLayer,
    updateAreaLabels,
    syncTextLabels,
    syncLineFeatures,
    syncMeasurement,
    syncGardenOverlays,
    syncScaleHandles,
    showTextInput,
    onSelectedLineChange,
    onSelectedGardenChange,
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
    lineEditIdRef.current = null

    // Cancel any in-progress line drawing when switching away from line tool
    if (activeTool !== "line") {
      drawingLineRef.current = null
      lineMouseDownRef.current = null
      isDraggingLineRef.current = false
      freehandPointsRef.current = []
      const previewSource = map.getSource("line-drawing-preview") as mapboxgl.GeoJSONSource
      if (previewSource) previewSource.setData({ type: "FeatureCollection", features: [] })
    }

    // Clear measurement when switching away from measure tool
    if (activeTool !== "measure") {
      measurePointsRef.current = []
      measureFinishedRef.current = false
      const measSource = map.getSource("measurement-overlay") as mapboxgl.GeoJSONSource
      if (measSource) measSource.setData({ type: "FeatureCollection", features: [] })
    }

    // Build initial properties for draw modes (garden element colors)
    const gardenEl = activeGardenElementRef.current
      ? GARDEN_ELEMENTS[activeGardenElementRef.current as GardenElementType]
      : null
    const drawOpts = gardenEl
      ? { initialProperties: {
          fillColor: gardenEl.style.fillColor,
          fillOpacity: gardenEl.style.fillOpacity,
          strokeColor: gardenEl.style.strokeColor,
          strokeWidth: gardenEl.style.strokeWidth,
          hagenType: gardenEl.type,
        }}
      : {}

    // Suppress mode sync to prevent feedback loop
    suppressModeSync.current = true
    switch (activeTool) {
      case "select":
        if (draw.getMode() !== "simple_select") {
          draw.changeMode("simple_select")
        }
        map.getCanvas().style.cursor = ""
        map.dragPan.enable()
        break
      case "polygon":
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        draw.changeMode("draw_polygon" as any, drawOpts)
        map.getCanvas().style.cursor = "crosshair"
        map.dragPan.disable()
        break
      case "rectangle":
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        draw.changeMode("draw_rectangle" as any, drawOpts)
        map.getCanvas().style.cursor = "crosshair"
        map.dragPan.disable()
        break
      case "circle":
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        draw.changeMode("draw_circle" as any, drawOpts)
        map.getCanvas().style.cursor = "crosshair"
        map.dragPan.disable()
        break
      case "text":
        draw.changeMode("simple_select")
        map.getCanvas().style.cursor = "text"
        map.dragPan.enable()
        break
      case "line":
        draw.changeMode("simple_select")
        map.getCanvas().style.cursor = "crosshair"
        map.dragPan.enable()
        selectedLineIdsRef.current.clear()
        syncLineFeatures(map)
        break
      case "measure":
        draw.changeMode("simple_select")
        map.getCanvas().style.cursor = "crosshair"
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
  }, [activeTool, removeTextInput, syncLineFeatures])

  // Live-edit selected shape features when selectedShapeProps change
  useEffect(() => {
    if (!selectedShapeProps) return
    const draw = drawRef.current
    const map = mapRef.current
    if (!draw || !map) return
    const selectedIds = draw.getSelectedIds()
    if (selectedIds.length === 0) return

    for (const id of selectedIds) {
      const feature = draw.get(id)
      if (!feature) continue
      feature.properties = {
        ...feature.properties,
        fillColor: selectedShapeProps.fillColor,
        fillOpacity: selectedShapeProps.fillOpacity,
        strokeColor: selectedShapeProps.strokeColor,
        strokeWidth: selectedShapeProps.strokeWidth,
        zone: selectedShapeProps.zone,
      }
      draw.add(feature)
    }
    updateAreaLabels(map, draw)
    saveToStorage()
  }, [selectedShapeProps, updateAreaLabels, saveToStorage])

  // Live-edit selected text features when selectedTextProps change
  useEffect(() => {
    if (!selectedTextProps) return
    const map = mapRef.current
    if (!map) return
    if (selectedTextIdsRef.current.size === 0) return

    textFeaturesRef.current = textFeaturesRef.current.map((f) => {
      if (!selectedTextIdsRef.current.has(f.properties!.id)) return f
      return {
        ...f,
        properties: {
          ...f.properties!,
          textColor: selectedTextProps.textColor,
          fontSize: selectedTextProps.fontSize,
        },
      }
    })
    syncTextLabels(map)
    saveToStorage()
  }, [selectedTextProps, syncTextLabels, saveToStorage])

  // Live-edit selected line features when selectedLineProps change
  useEffect(() => {
    if (!selectedLineProps) return
    const map = mapRef.current
    if (!map) return
    if (selectedLineIdsRef.current.size === 0) return

    lineFeaturesRef.current = lineFeaturesRef.current.map((f) => {
      if (!selectedLineIdsRef.current.has(f.properties!.id)) return f
      return {
        ...f,
        properties: {
          ...f.properties!,
          strokeColor: selectedLineProps.strokeColor,
          strokeWidth: selectedLineProps.strokeWidth,
          startArrow: selectedLineProps.startArrow,
          endArrow: selectedLineProps.endArrow,
        },
      }
    })
    syncLineFeatures(map)
    saveToStorage()
  }, [selectedLineProps, syncLineFeatures, saveToStorage])

  // Live-resize garden circle when diameter changes
  useEffect(() => {
    if (selectedGardenDiameter === null) return
    const draw = drawRef.current
    const map = mapRef.current
    if (!draw || !map) return
    const selectedIds = draw.getSelectedIds()
    if (selectedIds.length === 0) return

    for (const id of selectedIds) {
      const feature = draw.get(id)
      if (!feature || feature.geometry.type !== "Polygon") continue
      const props = feature.properties || {}
      if (props.featureType !== "garden") continue
      const el = GARDEN_ELEMENTS[props.hagenType as GardenElementType]
      if (!el || el.drawMode !== "circle") continue

      const ring = (feature.geometry as GeoJSON.Polygon).coordinates[0]
      if (!ring || ring.length < 3) continue
      const center = centroid(ring)
      const radiusKm = selectedGardenDiameter / 2 / 1000
      const newCoords = createCirclePolygon(center, radiusKm, { jagged: true })
      feature.geometry = { type: "Polygon", coordinates: [newCoords] }

      // Update gardenProps
      const gProps = typeof props.gardenProps === "string"
        ? JSON.parse(props.gardenProps)
        : { ...(props.gardenProps || {}) }
      gProps.diameter = selectedGardenDiameter
      feature.properties = { ...props, gardenProps: gProps }

      draw.add(feature)
    }
    updateAreaLabels(map, draw)
    syncGardenOverlays(map, draw)
    syncScaleHandles(map, draw)
    saveToStorage()
  }, [selectedGardenDiameter, updateAreaLabels, syncGardenOverlays, syncScaleHandles, saveToStorage])

  // Export functions
  const handleExportJSON = useCallback(() => {
    const draw = drawRef.current
    if (!draw) return
    exportJSON(draw, textFeaturesRef.current, lineFeaturesRef.current)
  }, [])

  const handleExportPNG = useCallback(() => {
    const map = mapRef.current
    if (!map) return
    exportPNG(map)
  }, [])

  useEffect(() => {
    exportJSONRef.current = handleExportJSON
    exportPNGRef.current = handleExportPNG
  }, [handleExportJSON, handleExportPNG, exportJSONRef, exportPNGRef])

  // Zoom and reset view refs
  useEffect(() => {
    zoomInRef.current = () => mapRef.current?.zoomIn()
    zoomOutRef.current = () => mapRef.current?.zoomOut()
    resetViewRef.current = () => {
      mapRef.current?.flyTo({
        center: CONFIG.defaultCenter,
        zoom: CONFIG.defaultZoom,
      })
    }
  }, [zoomInRef, zoomOutRef, resetViewRef])

  // Map style switching
  const MAP_STYLES: Record<MapStyle, string> = {
    satellite: "mapbox://styles/mapbox/satellite-v9",
    street: "mapbox://styles/mapbox/streets-v12",
    terrain: "mapbox://styles/mapbox/outdoors-v12",
  }

  useEffect(() => {
    const map = mapRef.current
    if (!map) return
    const style = MAP_STYLES[mapStyle]
    if (!style) return

    // Save current state before style change
    const draw = drawRef.current
    const drawFeatures = draw ? draw.getAll().features : []
    const textFeatures = [...textFeaturesRef.current]
    const lineFeatures = [...lineFeaturesRef.current]
    const center = map.getCenter()
    const zoom = map.getZoom()

    map.setStyle(style)

    map.once("style.load", () => {
      restoreLayersAfterStyleChange(map, {
        kartverketOpacity,
        kartverketVisible,
      })
      addUserPlotLayer(map)

      // Restore draw features
      if (draw) {
        for (const feature of drawFeatures) {
          draw.add(feature)
        }
      }

      // Restore text and line features
      textFeaturesRef.current = textFeatures
      lineFeaturesRef.current = lineFeatures
      syncTextLabels(map)
      syncLineFeatures(map)
      if (draw) {
        updateAreaLabels(map, draw)
        syncGardenOverlays(map, draw)
      }

      // Restore view
      map.setCenter(center)
      map.setZoom(zoom)
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mapStyle])

  // Kartverket overlay visibility and opacity
  useEffect(() => {
    const map = mapRef.current
    if (!map) return
    if (!map.getLayer("kartverket-topo")) return
    map.setLayoutProperty(
      "kartverket-topo",
      "visibility",
      kartverketVisible ? "visible" : "none"
    )
    if (kartverketVisible) {
      map.setPaintProperty("kartverket-topo", "raster-opacity", kartverketOpacity)
    }
  }, [kartverketVisible, kartverketOpacity])

  // Area labels visibility
  useEffect(() => {
    const map = mapRef.current
    if (!map) return
    if (!map.getLayer("area-labels")) return
    map.setLayoutProperty(
      "area-labels",
      "visibility",
      areaLabelsVisible ? "visible" : "none"
    )
  }, [areaLabelsVisible])

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
          case "l":
            onToolChange("line")
            return
          case "m":
            onToolChange("measure")
            return
          case "enter": {
            const map = mapRef.current
            if (!map) return
            // Finish polyline drawing
            if (activeToolRef.current === "line" && drawingLineRef.current && drawingLineRef.current.length >= 2) {
              const ld = lineDefaultsRef.current
              const id = crypto.randomUUID()
              const feature: Feature = {
                type: "Feature",
                geometry: { type: "LineString", coordinates: drawingLineRef.current },
                properties: {
                  id,
                  strokeColor: ld.strokeColor,
                  strokeWidth: ld.strokeWidth,
                  startArrow: ld.startArrow,
                  endArrow: ld.endArrow,
                },
              }
              lineFeaturesRef.current = [...lineFeaturesRef.current, feature]
              drawingLineRef.current = null
              selectedLineIdsRef.current.clear()
              selectedLineIdsRef.current.add(id)
              syncLineFeatures(map)
              const previewSource = map.getSource("line-drawing-preview") as mapboxgl.GeoJSONSource
              if (previewSource) previewSource.setData({ type: "FeatureCollection", features: [] })
              onToolChange("select")
              onPanelModeChange("line")
              onEditingSelectionChange(true)
              onSelectedLineChange(ld)
              pushHistory()
              saveToStorageRef.current?.()
              return
            }
            // Finish measurement
            if (activeToolRef.current === "measure" && measurePointsRef.current.length >= 2) {
              measureFinishedRef.current = true
              syncMeasurement(map)
              return
            }
            return
          }
          case "escape": {
            setContextMenu(null)
            removeTextInput()
            const draw = drawRef.current
            const map = mapRef.current
            if (draw) {
              draw.trash()
              draw.changeMode("simple_select")
            }
            // Cancel line drawing
            if (map) {
              drawingLineRef.current = null
              lineMouseDownRef.current = null
              isDraggingLineRef.current = false
              freehandPointsRef.current = []
              const previewSource = map.getSource("line-drawing-preview") as mapboxgl.GeoJSONSource
              if (previewSource) previewSource.setData({ type: "FeatureCollection", features: [] })
              map.dragPan.enable()

              // Clear measurement
              measurePointsRef.current = []
              measureFinishedRef.current = false
              const measSource = map.getSource("measurement-overlay") as mapboxgl.GeoJSONSource
              if (measSource) measSource.setData({ type: "FeatureCollection", features: [] })
            }
            if (map && selectedTextIdsRef.current.size > 0) {
              selectedTextIdsRef.current.clear()
              syncTextLabels(map)
            }
            if (map && lineEditIdRef.current) {
              lineEditIdRef.current = null
              syncLineFeatures(map)
            } else if (map && selectedLineIdsRef.current.size > 0) {
              selectedLineIdsRef.current.clear()
              syncLineFeatures(map)
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

            // Delete selected line features
            if (selectedLineIdsRef.current.size > 0) {
              lineFeaturesRef.current = lineFeaturesRef.current.filter(
                (f) => !selectedLineIdsRef.current.has(f.properties!.id)
              )
              selectedLineIdsRef.current.clear()
              syncLineFeatures(map)
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
    syncLineFeatures,
    syncMeasurement,
    pushHistory,
    removeTextInput,
    onPanelModeChange,
    onEditingSelectionChange,
    onSelectedLineChange,
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
