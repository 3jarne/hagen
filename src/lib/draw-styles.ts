// Custom mapbox-gl-draw styles that read per-feature properties for colors
// All custom properties use the `user_` prefix (mapbox-gl-draw requirement)

export const drawStyles: object[] = [
  // Polygon fill
  {
    id: "gl-draw-polygon-fill",
    type: "fill",
    filter: ["all", ["==", "$type", "Polygon"], ["!=", "mode", "static"]],
    paint: {
      "fill-color": ["coalesce", ["get", "user_fillColor"], "#93c5fd"],
      "fill-opacity": ["coalesce", ["get", "user_fillOpacity"], 0.4],
    },
  },
  // Polygon stroke (active)
  {
    id: "gl-draw-polygon-stroke-active",
    type: "line",
    filter: ["all", ["==", "$type", "Polygon"], ["!=", "mode", "static"]],
    paint: {
      "line-color": ["coalesce", ["get", "user_strokeColor"], "#93c5fd"],
      "line-width": ["coalesce", ["get", "user_strokeWidth"], 2],
    },
  },
  // Polygon fill (static/locked)
  {
    id: "gl-draw-polygon-fill-static",
    type: "fill",
    filter: ["all", ["==", "$type", "Polygon"], ["==", "mode", "static"]],
    paint: {
      "fill-color": ["coalesce", ["get", "user_fillColor"], "#93c5fd"],
      "fill-opacity": ["coalesce", ["get", "user_fillOpacity"], 0.4],
    },
  },
  // Polygon stroke (static)
  {
    id: "gl-draw-polygon-stroke-static",
    type: "line",
    filter: ["all", ["==", "$type", "Polygon"], ["==", "mode", "static"]],
    paint: {
      "line-color": ["coalesce", ["get", "user_strokeColor"], "#93c5fd"],
      "line-width": ["coalesce", ["get", "user_strokeWidth"], 2],
    },
  },
  // Line (active, for mid-draw)
  {
    id: "gl-draw-line",
    type: "line",
    filter: ["all", ["==", "$type", "LineString"], ["!=", "mode", "static"]],
    paint: {
      "line-color": "#93c5fd",
      "line-dasharray": [0.2, 2],
      "line-width": 2,
    },
  },
  // Close indicator vertex (first point when cursor is near)
  {
    id: "gl-draw-point-close",
    type: "circle",
    filter: [
      "all",
      ["==", "$type", "Point"],
      ["==", "meta", "vertex"],
      ["==", "close_indicator", "true"],
    ],
    paint: {
      "circle-radius": 8,
      "circle-color": "#93c5fd",
      "circle-stroke-color": "#fff",
      "circle-stroke-width": 2,
    },
  },
  // Vertex points (circles at polygon vertices)
  {
    id: "gl-draw-point",
    type: "circle",
    filter: [
      "all",
      ["==", "$type", "Point"],
      ["==", "meta", "vertex"],
      ["!=", "close_indicator", "true"],
    ],
    paint: {
      "circle-radius": 5,
      "circle-color": "#fff",
      "circle-stroke-color": "#93c5fd",
      "circle-stroke-width": 2,
    },
  },
  // Midpoints
  {
    id: "gl-draw-point-mid",
    type: "circle",
    filter: ["all", ["==", "$type", "Point"], ["==", "meta", "midpoint"]],
    paint: {
      "circle-radius": 3,
      "circle-color": "#93c5fd",
    },
  },
]
