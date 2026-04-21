import type { LucideIcon } from "lucide-react"
import {
  TentTree,
  Shrub,
  Fence,
  Flower2,
  Sprout,
  Carrot,
  Droplets,
  Footprints,
  Armchair,
  House,
  Leaf,
  Hammer,
} from "lucide-react"
import type { Tool } from "@/components/FloatingToolbar"

export type GardenCategory = "planter" | "vann_sti" | "konstruksjon"

export type GardenElementType =
  | "tre"
  | "busk"
  | "hekk"
  | "bed"
  | "gressplen"
  | "groennsakhage"
  | "dam"
  | "sti"
  | "terrasse"
  | "bygning"

export type GardenDrawMode = "polygon" | "circle" | "polyline" | "rectangle"

export interface GardenElementStyle {
  fillColor: string
  fillOpacity: number
  strokeColor: string
  strokeOpacity: number
  strokeWidth: number
}

export interface GardenElement {
  type: GardenElementType
  icon: LucideIcon
  label: string
  category: GardenCategory
  drawMode: GardenDrawMode
  style: GardenElementStyle
  /** Default width in meters for polyline bands (Hekk/Sti) */
  defaultWidth?: number
  /** Slider min width in meters */
  minWidth?: number
  /** Slider max width in meters */
  maxWidth?: number
}

export interface GardenCategoryDef {
  id: GardenCategory
  icon: LucideIcon
  label: string
  elements: GardenElement[]
}

/** Map garden draw modes to the underlying mapbox-gl-draw Tool */
export function gardenDrawModeToTool(mode: GardenDrawMode): Tool {
  switch (mode) {
    case "polygon": return "polygon"
    case "circle": return "circle"
    case "rectangle": return "rectangle"
    case "polyline": return "polyline"
  }
}

function makeStyle(
  fillColor: string,
  fillOpacity = 0.4,
): GardenElementStyle {
  return {
    fillColor,
    fillOpacity,
    strokeColor: fillColor,
    strokeOpacity: 0.85,
    strokeWidth: 2,
  }
}

export const GARDEN_ELEMENTS: Record<GardenElementType, GardenElement> = {
  tre:            { type: "tre",            icon: TentTree,   label: "Tre",           category: "planter",       drawMode: "circle",   style: makeStyle("#166534") },
  busk:           { type: "busk",           icon: Shrub,      label: "Busk",          category: "planter",       drawMode: "circle",   style: makeStyle("#22c55e") },
  hekk:           { type: "hekk",           icon: Fence,      label: "Hekk",          category: "planter",       drawMode: "polyline", style: makeStyle("#166534"), defaultWidth: 0.5, minWidth: 0.2, maxWidth: 2.0 },
  bed:            { type: "bed",            icon: Flower2,    label: "Bed",           category: "planter",       drawMode: "polygon",  style: makeStyle("#f9a8d4") },
  gressplen:      { type: "gressplen",      icon: Sprout,     label: "Gressplen",     category: "planter",       drawMode: "polygon",  style: makeStyle("#86efac") },
  groennsakhage:  { type: "groennsakhage",  icon: Carrot,     label: "Grønnsakhage",  category: "planter",       drawMode: "polygon",  style: makeStyle("#a3e635") },
  dam:            { type: "dam",            icon: Droplets,   label: "Dam",           category: "vann_sti",      drawMode: "polygon",  style: makeStyle("#38bdf8") },
  sti:            { type: "sti",            icon: Footprints, label: "Sti",           category: "vann_sti",      drawMode: "polyline", style: makeStyle("#d6d3d1"), defaultWidth: 1.0, minWidth: 0.3, maxWidth: 3.0 },
  terrasse:       { type: "terrasse",       icon: Armchair,   label: "Terrasse",      category: "konstruksjon",  drawMode: "polygon",  style: makeStyle("#d4a574", 0.6) },
  bygning:        { type: "bygning",        icon: House,      label: "Bygning",       category: "konstruksjon",  drawMode: "polygon",  style: makeStyle("#d4b896", 0.6) },
}

export const GARDEN_CATEGORIES: GardenCategoryDef[] = [
  {
    id: "planter",
    icon: Leaf,
    label: "Planter",
    elements: [
      GARDEN_ELEMENTS.tre,
      GARDEN_ELEMENTS.busk,
      GARDEN_ELEMENTS.hekk,
      GARDEN_ELEMENTS.bed,
      GARDEN_ELEMENTS.gressplen,
      GARDEN_ELEMENTS.groennsakhage,
    ],
  },
  {
    id: "vann_sti",
    icon: Droplets,
    label: "Vann & Sti",
    elements: [
      GARDEN_ELEMENTS.dam,
      GARDEN_ELEMENTS.sti,
    ],
  },
  {
    id: "konstruksjon",
    icon: Hammer,
    label: "Konstruksjon",
    elements: [
      GARDEN_ELEMENTS.terrasse,
      GARDEN_ELEMENTS.bygning,
    ],
  },
]

/** Polygon-based garden elements handled in Fase 2 */
export const POLYGON_GARDEN_TYPES: GardenElementType[] = [
  "bed", "gressplen", "groennsakhage", "terrasse", "dam",
]
