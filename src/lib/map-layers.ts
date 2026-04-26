import type { Map } from "mapbox-gl"
import type { Feature, Polygon } from "geojson"
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
      maxzoom: 20,
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
export function addAreaLabelsLayer(map: Map, opts?: { visible?: boolean }) {
  if (map.getSource("area-labels")) return
  const visible = opts?.visible ?? false

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
      visibility: visible ? "visible" : "none",
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
 * Add selection bounding box + corner handle layers for draw features.
 */
export function addScaleHandlesLayer(map: Map) {
  if (map.getSource("garden-scale-handles")) return

  map.addSource("garden-scale-handles", {
    type: "geojson",
    data: { type: "FeatureCollection", features: [] },
  })
  // Bounding box outline
  map.addLayer({
    id: "garden-scale-bbox",
    type: "line",
    source: "garden-scale-handles",
    filter: ["==", "$type", "Polygon"],
    paint: {
      "line-color": "#93c5fd",
      "line-width": 1,
      "line-dasharray": [4, 3],
    },
  })
  // Corner handles
  map.addLayer({
    id: "garden-scale-handles",
    type: "circle",
    source: "garden-scale-handles",
    filter: ["==", "$type", "Point"],
    paint: {
      "circle-radius": 5,
      "circle-color": "#ffffff",
      "circle-stroke-color": "#93c5fd",
      "circle-stroke-width": 2,
    },
  })
}

/**
 * Add object-shadows source + layer. Shadows cast by drawn garden
 * objects (trees, bushes, hedges, buildings) at the current sun time.
 * Added before solkompass layers so sun indicators render on top.
 */
export function addObjectShadowsLayer(map: Map) {
  if (!map.getSource("object-shadows")) {
    map.addSource("object-shadows", {
      type: "geojson",
      data: { type: "FeatureCollection", features: [] },
    })
  }
  if (!map.getLayer("object-shadows")) {
    map.addLayer({
      id: "object-shadows",
      type: "fill",
      source: "object-shadows",
      paint: {
        "fill-color": "#000000",
        "fill-opacity": 0.18,
      },
    })
  }
}

/**
 * Add solkompass sources + layers (sundial arc, hour markers,
 * current sun ray, sun icon, anchor dot).
 * Added LAST so these render on top of all other map content.
 */
export function addSolkompassLayers(map: Map) {
  if (!map.getSource("solkompass-arc")) {
    map.addSource("solkompass-arc", {
      type: "geojson",
      data: { type: "FeatureCollection", features: [] },
    })
  }
  if (!map.getSource("solkompass-sun")) {
    map.addSource("solkompass-sun", {
      type: "geojson",
      data: { type: "FeatureCollection", features: [] },
    })
  }

  // Arc line (shadow-tip trace)
  if (!map.getLayer("solkompass-arc-line")) {
    map.addLayer({
      id: "solkompass-arc-line",
      type: "line",
      source: "solkompass-arc",
      filter: ["==", "$type", "LineString"],
      paint: {
        "line-color": "#eab308",
        "line-width": 1.5,
        "line-dasharray": [2, 2],
      },
    })
  }
  // Hour-marker dots on the arc
  if (!map.getLayer("solkompass-arc-points")) {
    map.addLayer({
      id: "solkompass-arc-points",
      type: "circle",
      source: "solkompass-arc",
      filter: ["==", ["get", "kind"], "hour"],
      paint: {
        "circle-radius": 3,
        "circle-color": "#eab308",
      },
    })
  }
  // Anchor dot (the "stick" base) — dark, distinct from hour markers
  if (!map.getLayer("solkompass-anchor")) {
    map.addLayer({
      id: "solkompass-anchor",
      type: "circle",
      source: "solkompass-arc",
      filter: ["==", ["get", "kind"], "anchor"],
      paint: {
        "circle-radius": 4,
        "circle-color": "#171717",
        "circle-stroke-color": "#ffffff",
        "circle-stroke-width": 1.5,
      },
    })
  }
  // North label "N"
  if (!map.getLayer("solkompass-north")) {
    map.addLayer({
      id: "solkompass-north",
      type: "symbol",
      source: "solkompass-arc",
      filter: ["==", ["get", "kind"], "north"],
      layout: {
        "text-field": ["get", "label"],
        "text-size": 13,
        "text-font": ["Open Sans Bold", "Arial Unicode MS Bold"],
        "text-anchor": "center",
        "text-allow-overlap": true,
      },
      paint: {
        "text-color": "#dc2626",
        "text-halo-color": "#ffffff",
        "text-halo-width": 2,
      },
    })
  }
  // Sun icon (placed in SUN direction — big and visible)
  // Register a custom sun image for the symbol layer
  if (!map.hasImage("solkompass-sun-img")) {
    const size = 64
    const canvas = document.createElement("canvas")
    canvas.width = size
    canvas.height = size
    const ctx = canvas.getContext("2d")!
    const cx = size / 2
    const cy = size / 2
    const r = size / 2 - 4
    // Outer circle
    ctx.beginPath()
    ctx.arc(cx, cy, r, 0, Math.PI * 2)
    ctx.fillStyle = "#fbbf24"
    ctx.fill()
    ctx.strokeStyle = "#d97706"
    ctx.lineWidth = 3
    ctx.stroke()
    // Sun rays (8 lines radiating outward from inner circle)
    const innerR = r * 0.55
    const outerR = r * 0.82
    ctx.strokeStyle = "#d97706"
    ctx.lineWidth = 2.5
    ctx.lineCap = "round"
    for (let i = 0; i < 8; i++) {
      const angle = (i / 8) * Math.PI * 2
      ctx.beginPath()
      ctx.moveTo(cx + Math.cos(angle) * innerR, cy + Math.sin(angle) * innerR)
      ctx.lineTo(cx + Math.cos(angle) * outerR, cy + Math.sin(angle) * outerR)
      ctx.stroke()
    }
    // Inner circle (sun body)
    ctx.beginPath()
    ctx.arc(cx, cy, r * 0.38, 0, Math.PI * 2)
    ctx.strokeStyle = "#d97706"
    ctx.lineWidth = 2.5
    ctx.stroke()

    const imageData = ctx.getImageData(0, 0, size, size)
    map.addImage("solkompass-sun-img", {
      width: size,
      height: size,
      data: new Uint8Array(imageData.data.buffer),
    })
  }
  if (!map.getLayer("solkompass-sun-icon")) {
    map.addLayer({
      id: "solkompass-sun-icon",
      type: "symbol",
      source: "solkompass-sun",
      filter: ["==", ["get", "kind"], "sun"],
      layout: {
        "icon-image": "solkompass-sun-img",
        "icon-size": 1,
        "icon-allow-overlap": true,
      },
    })
  }
}

/**
 * Fetch eiendomsgrense (gnr/bnr) fra Geonorge WFS og tegn som overlay.
 * Stille fail hvis grensen ikke kan hentes (f.eks. utenlandsk IP).
 */
export async function addUserPlotLayer(
  map: Map,
  gnr: number | null,
  bnr: number | null,
) {
  if (gnr == null || bnr == null) return
  try {
    const url =
      `https://wfs.geonorge.no/skwfs/wfs.matrikkelkart?` +
      `SERVICE=WFS&VERSION=2.0.0&REQUEST=GetFeature&` +
      `TYPENAMES=Eiendomskart:Teig&` +
      `CQL_FILTER=gaardsnummer=${gnr}%20AND%20bruksnummer=${bnr}&` +
      `SRSNAME=EPSG:4326&outputFormat=application/json`
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
    } else {
      ;(map.getSource("user-plot") as import("mapbox-gl").GeoJSONSource).setData(
        data,
      )
    }
  } catch (err) {
    console.error("[eiendom] fetch failed", err)
  }
}

/**
 * Add fog-of-war mask source + layer. The mask polygon has a large outer
 * ring with the project's allowed area as a hole — everything outside the
 * hole is rendered semi-transparent dark. Optional fade rings sit just
 * inside the hole edge to soften the boundary. Added last so it sits
 * above all other content.
 */
export function addFogOfWarLayer(
  map: Map,
  mask: Feature<Polygon>,
  fadeRings: Feature<Polygon>[] = [],
) {
  if (!map.getSource("fog-of-war")) {
    map.addSource("fog-of-war", {
      type: "geojson",
      data: mask,
    })
  } else {
    ;(map.getSource("fog-of-war") as import("mapbox-gl").GeoJSONSource).setData(
      mask,
    )
  }
  if (!map.getLayer("fog-of-war-fill")) {
    map.addLayer({
      id: "fog-of-war-fill",
      type: "fill",
      source: "fog-of-war",
      paint: {
        "fill-color": "#0a0a0a",
        "fill-opacity": 0.55,
      },
    })
  }

  const fadeData = {
    type: "FeatureCollection" as const,
    features: fadeRings,
  }
  if (!map.getSource("fog-of-war-fade")) {
    map.addSource("fog-of-war-fade", {
      type: "geojson",
      data: fadeData,
    })
  } else {
    ;(
      map.getSource("fog-of-war-fade") as import("mapbox-gl").GeoJSONSource
    ).setData(fadeData)
  }
  if (!map.getLayer("fog-of-war-fade-fill")) {
    map.addLayer({
      id: "fog-of-war-fade-fill",
      type: "fill",
      source: "fog-of-war-fade",
      paint: {
        "fill-color": "#0a0a0a",
        "fill-opacity": ["get", "opacity"],
      },
    })
  }
}

/**
 * Re-add all custom layers after a map style change.
 * Call this inside map.once("style.load", ...).
 */
export function restoreLayersAfterStyleChange(
  map: Map,
  opts?: {
    kartverketOpacity?: number
    kartverketVisible?: boolean
    fogMask?: Feature<Polygon>
    fogFadeRings?: Feature<Polygon>[]
  }
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
  addObjectShadowsLayer(map)
  addSolkompassLayers(map)
  if (opts?.fogMask) {
    addFogOfWarLayer(map, opts.fogMask, opts.fogFadeRings ?? [])
  }
}
