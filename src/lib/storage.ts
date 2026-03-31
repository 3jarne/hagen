import type { Feature } from "geojson"
import type MapboxDraw from "@mapbox/mapbox-gl-draw"

export const STORAGE_KEY = "hageplan_sketch"

export interface SavedProject {
  drawFeatures: Feature[]
  textFeatures: Feature[]
  lineFeatures?: Feature[]
}

/**
 * Load project from localStorage, migrating old user_-prefixed properties.
 * Returns null if no saved project or data is corrupt.
 */
export function loadProject(): SavedProject | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return null

    const saved: SavedProject = JSON.parse(raw)
    if (
      !saved.drawFeatures?.length &&
      !saved.textFeatures?.length &&
      !saved.lineFeatures?.length
    ) {
      return null
    }

    // Migrate old user_-prefixed property names
    for (const feature of saved.drawFeatures || []) {
      if (feature.properties) {
        for (const key of Object.keys(feature.properties)) {
          if (key.startsWith("user_")) {
            feature.properties[key.slice(5)] = feature.properties[key]
            delete feature.properties[key]
          }
        }
      }
    }

    return saved
  } catch {
    return null
  }
}

/**
 * Save project to localStorage. Meant to be called inside a debounced wrapper.
 */
export function saveProject(
  draw: MapboxDraw,
  textFeatures: Feature[],
  lineFeatures: Feature[]
) {
  const project: SavedProject = {
    drawFeatures: draw.getAll().features,
    textFeatures: [...textFeatures],
    lineFeatures: [...lineFeatures],
  }
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(project))
  } catch {
    // Storage full or unavailable — silent fail
  }
}
