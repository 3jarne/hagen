export interface ShapeProperties {
  fillColor: string
  fillOpacity: number
  strokeColor: string
  strokeWidth: number
  zone: string
}

export interface TextProperties {
  fontSize: number
  textColor: string
}

export const ZONE_CATEGORIES = [
  "Lawn",
  "Planting bed",
  "Path/hardscape",
  "Vegetable garden",
  "Water feature",
  "Other",
] as const

export type ZoneCategory = (typeof ZONE_CATEGORIES)[number]

export const ZONE_PRESETS: Record<ZoneCategory, ShapeProperties> = {
  Lawn: {
    fillColor: "#4ade80",
    fillOpacity: 0.4,
    strokeColor: "#4ade80",
    strokeWidth: 2,
    zone: "Lawn",
  },
  "Planting bed": {
    fillColor: "#f472b6",
    fillOpacity: 0.4,
    strokeColor: "#f472b6",
    strokeWidth: 2,
    zone: "Planting bed",
  },
  "Path/hardscape": {
    fillColor: "#a3a3a3",
    fillOpacity: 0.5,
    strokeColor: "#737373",
    strokeWidth: 2,
    zone: "Path/hardscape",
  },
  "Vegetable garden": {
    fillColor: "#a3e635",
    fillOpacity: 0.4,
    strokeColor: "#a3e635",
    strokeWidth: 2,
    zone: "Vegetable garden",
  },
  "Water feature": {
    fillColor: "#38bdf8",
    fillOpacity: 0.5,
    strokeColor: "#0ea5e9",
    strokeWidth: 2,
    zone: "Water feature",
  },
  Other: {
    fillColor: "#fbbf24",
    fillOpacity: 0.4,
    strokeColor: "#fbbf24",
    strokeWidth: 2,
    zone: "Other",
  },
}

export const DEFAULT_SHAPE: ShapeProperties = { ...ZONE_PRESETS.Lawn }

export const DEFAULT_TEXT: TextProperties = {
  fontSize: 16,
  textColor: "#ffffff",
}
