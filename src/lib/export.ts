import type { Feature } from "geojson"
import type MapboxDraw from "@mapbox/mapbox-gl-draw"
import type { Map } from "mapbox-gl"

interface ExportProject {
  drawFeatures: Feature[]
  textFeatures: Feature[]
  lineFeatures: Feature[]
}

/**
 * Export the current project as a JSON file download.
 */
export function exportJSON(
  draw: MapboxDraw,
  textFeatures: Feature[],
  lineFeatures: Feature[]
) {
  const project: ExportProject = {
    drawFeatures: draw.getAll().features,
    textFeatures: [...textFeatures],
    lineFeatures: [...lineFeatures],
  }
  const blob = new Blob([JSON.stringify(project, null, 2)], {
    type: "application/json",
  })
  const url = URL.createObjectURL(blob)
  const a = document.createElement("a")
  a.href = url
  a.download = "hageplan.json"
  a.click()
  URL.revokeObjectURL(url)
}

/**
 * Export the current map view as a PNG file download.
 */
export function exportPNG(map: Map) {
  const canvas = map.getCanvas()
  canvas.toBlob((blob) => {
    if (!blob) return
    const url = URL.createObjectURL(blob)
    const a = document.createElement("a")
    a.href = url
    a.download = "hageplan.png"
    a.click()
    URL.revokeObjectURL(url)
  })
}
