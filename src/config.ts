export const CONFIG = {
  mapboxToken: (import.meta.env.VITE_MAPBOX_TOKEN as string) || "",
  defaultCenter: [11.05218, 60.41601] as [number, number],
  defaultZoom: 17,
}

export function hasMapboxToken(): boolean {
  return CONFIG.mapboxToken.startsWith("pk.")
}
