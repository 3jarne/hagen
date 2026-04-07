import type { Map } from "mapbox-gl"
import { registerGardenPatterns } from "@/lib/garden-patterns"

/**
 * Add Kartverket topographic overlay below draw layers.
 */
export function addKartverketLayer(
  map: Map,
  opts?: { opacity?: number; visible?: boolean }
) {
  const opacity = opts?.opacity ?? 0.4
  const visible = opts?.visible ?? true

  if (!map.getSource("kartverket-topo")) {
    map.addSource("kartverket-topo", {
      type: "raster",
      tiles: [
        "https://cache.kartverket.no/v1/wmts/1.0.0/topo/default/webmercator/{z}/{y}/{x}.png",
      ],
      tileSize: 256,
      minzoom: 14,
      maxzoom: 18,
    })
  }

  if (!map.getLayer("kartverket-topo")) {
    const layers = map.getStyle().layers || []
    const firstDrawLayer = layers.find((l) => l.id.startsWith("gl-draw-"))
    map.addLayer(
      {
        id: "kartverket-topo",
        type: "raster",
        source: "kartverket-topo",
        paint: { "raster-opacity": visible ? opacity : 0 },
        layout: { visibility: visible ? "visible" : "none" },
      },
      firstDrawLayer?.id
    )
  }
}

/**
 * Add area labels source + layer (shows area text on polygons).
 */
export function addAreaLabelsLayer(map: Map) {
  if (map.getSource("area-labels")) return

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
      "text-offset": [0, 1.8],
    },
    paint: {
      "text-color": "#ffffff",
      "text-halo-color": "#000000",
      "text-halo-width": 1.5,
    },
  })
}

/**
 * Add text labels source + layers + selection bounding box.
 */
export function addTextLabelsLayers(map: Map) {
  if (map.getSource("text-labels")) return

  map.addSource("text-labels", {
    type: "geojson",
    data: { type: "FeatureCollection", features: [] },
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

  // Selection bounding box
  if (!map.getSource("text-selection-bbox")) {
    map.addSource("text-selection-bbox", {
      type: "geojson",
      data: { type: "FeatureCollection", features: [] },
    })
    map.addLayer({
      id: "text-selection-bbox-outline",
      type: "line",
      source: "text-selection-bbox",
      filter: ["==", "$type", "Polygon"],
      paint: {
        "line-color": "#93c5fd",
        "line-width": 1,
        "line-dasharray": [4, 3],
      },
    })
    map.addLayer({
      id: "text-selection-bbox-corners",
      type: "circle",
      source: "text-selection-bbox",
      filter: ["==", "$type", "Point"],
      paint: {
        "circle-radius": 4,
        "circle-color": "#ffffff",
        "circle-stroke-color": "#93c5fd",
        "circle-stroke-width": 1.5,
      },
    })
  }
}

/**
 * Create and add the arrow-head image used by line arrows.
 */
function ensureArrowHeadImage(map: Map) {
  try {
    if (map.hasImage("arrow-head")) return
  } catch {
    return
  }

  const size = 24
  const canvas = document.createElement("canvas")
  canvas.width = size
  canvas.height = size
  const ctx = canvas.getContext("2d")!
  ctx.fillStyle = "#ffffff"
  ctx.beginPath()
  ctx.moveTo(size / 2, 0)
  ctx.lineTo(size, size)
  ctx.lineTo(size / 2, size * 0.7)
  ctx.lineTo(0, size)
  ctx.closePath()
  ctx.fill()
  const imageData = ctx.getImageData(0, 0, size, size)
  try {
    map.addImage(
      "arrow-head",
      { width: size, height: size, data: imageData.data as unknown as Uint8Array },
      { sdf: true }
    )
  } catch {
    // Image may already exist (e.g. React StrictMode double-mount)
  }
}

/**
 * Add line feature source + all related layers (stroke, arrows, hit area, selection bbox, drawing preview).
 */
export function addLineFeatureLayers(map: Map) {
  ensureArrowHeadImage(map)

  if (!map.getSource("line-features")) {
    map.addSource("line-features", {
      type: "geojson",
      data: { type: "FeatureCollection", features: [] },
    })
  }

  if (!map.getLayer("line-features-stroke")) {
    map.addLayer({
      id: "line-features-stroke",
      type: "line",
      source: "line-features",
      filter: ["==", "$type", "LineString"],
      paint: {
        "line-color": ["coalesce", ["get", "strokeColor"], "#ffffff"],
        "line-width": ["coalesce", ["get", "strokeWidth"], 2],
      },
      layout: { "line-cap": "round", "line-join": "round" },
    })
  }

  if (!map.getLayer("line-features-arrows")) {
    map.addLayer({
      id: "line-features-arrows",
      type: "symbol",
      source: "line-features",
      filter: ["has", "arrowType"],
      layout: {
        "icon-image": "arrow-head",
        "icon-size": 0.6,
        "icon-rotate": ["get", "bearing"],
        "icon-allow-overlap": true,
        "icon-rotation-alignment": "map",
      },
      paint: {
        "icon-color": ["coalesce", ["get", "strokeColor"], "#ffffff"],
      },
    })
  }

  // Selection bbox
  if (!map.getSource("line-selection-bbox")) {
    map.addSource("line-selection-bbox", {
      type: "geojson",
      data: { type: "FeatureCollection", features: [] },
    })
  }

  if (!map.getLayer("line-selection-bbox-fill")) {
    map.addLayer({
      id: "line-selection-bbox-fill",
      type: "fill",
      source: "line-selection-bbox",
      filter: ["==", "$type", "Polygon"],
      paint: { "fill-opacity": 0 },
    })
  }

  if (!map.getLayer("line-selection-bbox-outline")) {
    map.addLayer({
      id: "line-selection-bbox-outline",
      type: "line",
      source: "line-selection-bbox",
      filter: ["==", "$type", "Polygon"],
      paint: {
        "line-color": "#93c5fd",
        "line-width": 1,
        "line-dasharray": [4, 3],
      },
    })
  }

  if (!map.getLayer("line-selection-bbox-corners")) {
    map.addLayer({
      id: "line-selection-bbox-corners",
      type: "circle",
      source: "line-selection-bbox",
      filter: ["==", "$type", "Point"],
      paint: {
        "circle-radius": 4,
        "circle-color": "#ffffff",
        "circle-stroke-color": "#93c5fd",
        "circle-stroke-width": 1.5,
      },
    })
  }

  // Invisible wider hit area for line selection
  if (!map.getLayer("line-features-hit")) {
    map.addLayer({
      id: "line-features-hit",
      type: "line",
      source: "line-features",
      filter: ["==", "$type", "LineString"],
      paint: {
        "line-color": "transparent",
        "line-width": 14,
        "line-opacity": 0,
      },
    })
  }

  // Line drawing preview
  if (!map.getSource("line-drawing-preview")) {
    map.addSource("line-drawing-preview", {
      type: "geojson",
      data: { type: "FeatureCollection", features: [] },
    })
  }

  if (!map.getLayer("line-drawing-preview")) {
    map.addLayer({
      id: "line-drawing-preview",
      type: "line",
      source: "line-drawing-preview",
      paint: {
        "line-color": "#ffffff",
        "line-width": 2,
        "line-dasharray": [4, 3],
      },
      layout: { "line-cap": "round", "line-join": "round" },
    })
  }
}

/**
 * Add measurement overlay source + layers.
 */
export function addMeasurementLayers(map: Map) {
  if (map.getSource("measurement-overlay")) return

  map.addSource("measurement-overlay", {
    type: "geojson",
    data: { type: "FeatureCollection", features: [] },
  })
  map.addLayer({
    id: "measurement-lines",
    type: "line",
    source: "measurement-overlay",
    filter: ["==", ["get", "type"], "line"],
    paint: { "line-color": "#fbbf24", "line-width": 2 },
    layout: { "line-cap": "round" },
  })
  map.addLayer({
    id: "measurement-closing-line",
    type: "line",
    source: "measurement-overlay",
    filter: ["==", ["get", "type"], "closing-line"],
    paint: {
      "line-color": "#fbbf24",
      "line-width": 1.5,
      "line-dasharray": [4, 3],
    },
  })
  map.addLayer({
    id: "measurement-points",
    type: "circle",
    source: "measurement-overlay",
    filter: ["==", ["get", "type"], "dot"],
    paint: {
      "circle-radius": 5,
      "circle-color": "#fbbf24",
      "circle-stroke-color": "#ffffff",
      "circle-stroke-width": 2,
    },
  })
  map.addLayer({
    id: "measurement-labels",
    type: "symbol",
    source: "measurement-overlay",
    filter: [
      "in",
      ["get", "type"],
      ["literal", ["label", "total", "area-label"]],
    ],
    layout: {
      "text-field": ["get", "label"],
      "text-size": 13,
      "text-font": ["Open Sans Regular", "Arial Unicode MS Regular"],
      "text-allow-overlap": true,
      "text-offset": [0, -1.2],
    },
    paint: {
      "text-color": "#fbbf24",
      "text-halo-color": "#000000",
      "text-halo-width": 1.5,
    },
  })
}

/**
 * Add garden canopy lines source + layer (radiating lines for Tre/Busk).
 */
export function addCanopyLinesLayer(map: Map) {
  if (map.getSource("garden-canopy-lines")) return

  map.addSource("garden-canopy-lines", {
    type: "geojson",
    data: { type: "FeatureCollection", features: [] },
  })
  map.addLayer({
    id: "garden-canopy-lines",
    type: "line",
    source: "garden-canopy-lines",
    paint: {
      "line-color": ["coalesce", ["get", "fillColor"], "#166534"],
      "line-width": 1,
      "line-opacity": 0.6,
    },
    layout: {
      "line-cap": "round",
    },
  })
}

/**
 * Add garden scale handles source + layers (4 drag handles for Tre/Busk resize).
 */
export function addScaleHandlesLayer(map: Map) {
  if (map.getSource("garden-scale-handles")) return

  map.addSource("garden-scale-handles", {
    type: "geojson",
    data: { type: "FeatureCollection", features: [] },
  })
  map.addLayer({
    id: "garden-scale-handles",
    type: "circle",
    source: "garden-scale-handles",
    paint: {
      "circle-radius": 5,
      "circle-color": "#ffffff",
      "circle-stroke-color": "#93c5fd",
      "circle-stroke-width": 2,
    },
  })
}

/**
 * Re-add all custom layers after a map style change.
 * Call this inside map.once("style.load", ...).
 */
export function restoreLayersAfterStyleChange(
  map: Map,
  opts?: { kartverketOpacity?: number; kartverketVisible?: boolean }
) {
  registerGardenPatterns(map)
  addKartverketLayer(map, {
    opacity: opts?.kartverketOpacity,
    visible: opts?.kartverketVisible,
  })
  addAreaLabelsLayer(map)
  addTextLabelsLayers(map)
  addLineFeatureLayers(map)
  addMeasurementLayers(map)
  addCanopyLinesLayer(map)
  addScaleHandlesLayer(map)
}
