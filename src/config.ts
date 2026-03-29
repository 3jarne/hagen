import { loadSettings } from "@/components/SettingsDialog"

function getSettings() {
  return loadSettings()
}

export const CONFIG = {
  get mapboxToken(): string {
    return getSettings().mapboxToken || (import.meta.env.VITE_MAPBOX_TOKEN as string) || ""
  },
  get gnr(): number {
    return getSettings().gnr
  },
  get bnr(): number {
    return getSettings().bnr
  },
  get defaultCenter(): [number, number] {
    const s = getSettings()
    return [s.lng, s.lat]
  },
  defaultZoom: 17,
}
