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

export interface GardenElement {
  type: GardenElementType
  emoji: string
  label: string
  category: GardenCategory
}

export interface GardenCategoryDef {
  id: GardenCategory
  emoji: string
  label: string
  elements: GardenElement[]
}

export const GARDEN_ELEMENTS: Record<GardenElementType, GardenElement> = {
  tre: { type: "tre", emoji: "🌳", label: "Tre", category: "planter" },
  busk: { type: "busk", emoji: "🌿", label: "Busk", category: "planter" },
  hekk: { type: "hekk", emoji: "🌿", label: "Hekk", category: "planter" },
  bed: { type: "bed", emoji: "🌸", label: "Bed", category: "planter" },
  gressplen: { type: "gressplen", emoji: "🌱", label: "Gressplen", category: "planter" },
  groennsakhage: { type: "groennsakhage", emoji: "🥕", label: "Grønnsakhage", category: "planter" },
  dam: { type: "dam", emoji: "💧", label: "Dam", category: "vann_sti" },
  sti: { type: "sti", emoji: "🪨", label: "Sti", category: "vann_sti" },
  terrasse: { type: "terrasse", emoji: "🪵", label: "Terrasse", category: "konstruksjon" },
  bygning: { type: "bygning", emoji: "🏠", label: "Bygning", category: "konstruksjon" },
}

export const GARDEN_CATEGORIES: GardenCategoryDef[] = [
  {
    id: "planter",
    emoji: "🌿",
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
    emoji: "💧",
    label: "Vann & Sti",
    elements: [
      GARDEN_ELEMENTS.dam,
      GARDEN_ELEMENTS.sti,
    ],
  },
  {
    id: "konstruksjon",
    emoji: "🏗",
    label: "Konstruksjon",
    elements: [
      GARDEN_ELEMENTS.terrasse,
      GARDEN_ELEMENTS.bygning,
    ],
  },
]
