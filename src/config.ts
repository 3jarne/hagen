export const CONFIG = {
  mapboxToken: import.meta.env.VITE_MAPBOX_TOKEN as string,
  gnr: 0,           // replace with actual gårdsnummer from seeiendom.kartverket.no
  bnr: 0,           // replace with actual bruksnummer
  defaultCenter: [11.0701, 60.3723] as [number, number], // replace with property lng/lat
  defaultZoom: 17,  // property level — house clearly visible
}
