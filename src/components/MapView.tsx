import { useEffect, useRef, useCallback, useState } from "react"
import mapboxgl from "mapbox-gl"
import "mapbox-gl/dist/mapbox-gl.css"
import { CONFIG } from "@/config"

interface MapViewProps {
  onZoomChange: (zoom: number) => void
}

function TokenPrompt() {
  const [token, setToken] = useState("")

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (token.trim().startsWith("pk.")) {
      CONFIG.setMapboxToken(token.trim())
      window.location.reload()
    }
  }

  return (
    <div className="absolute inset-0 flex items-center justify-center bg-muted">
      <form
        onSubmit={handleSubmit}
        className="rounded-lg border bg-card p-6 shadow-lg max-w-md w-full mx-4"
      >
        <h2 className="text-lg font-semibold text-card-foreground mb-2">
          Welcome to Hageplan
        </h2>
        <p className="text-sm text-muted-foreground mb-4">
          To display the map, paste your Mapbox public token below.
          Get one free at{" "}
          <a
            href="https://account.mapbox.com/access-tokens/"
            target="_blank"
            rel="noopener noreferrer"
            className="underline text-foreground"
          >
            mapbox.com
          </a>
          . It starts with <code className="rounded bg-muted px-1 py-0.5 text-xs">pk.</code>
        </p>
        <input
          type="text"
          value={token}
          onChange={(e) => setToken(e.target.value)}
          placeholder="pk.eyJ1Ijoi..."
          className="w-full h-9 px-3 text-sm rounded-md border border-input bg-background text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring mb-3"
          autoFocus
        />
        <button
          type="submit"
          disabled={!token.trim().startsWith("pk.")}
          className="w-full h-9 rounded-md bg-primary text-primary-foreground text-sm font-medium hover:bg-primary/90 disabled:opacity-50 disabled:pointer-events-none"
        >
          Load map
        </button>
      </form>
    </div>
  )
}

export function MapView({ onZoomChange }: MapViewProps) {
  const mapContainerRef = useRef<HTMLDivElement>(null)
  const mapRef = useRef<mapboxgl.Map | null>(null)

  const addKartverketLayers = useCallback((map: mapboxgl.Map) => {
    if (!map.getSource("kartverket-wms")) {
      map.addSource("kartverket-wms", {
        type: "raster",
        tiles: [
          "https://wms.geonorge.no/skwms1/wms.matrikkelkart?SERVICE=WMS&VERSION=1.3.0&REQUEST=GetMap&FORMAT=image/png&TRANSPARENT=true&LAYERS=Eiendomskart&CRS=EPSG:3857&WIDTH=256&HEIGHT=256&BBOX={bbox-epsg-3857}",
        ],
        tileSize: 256,
        minzoom: 14,
      })
      map.addLayer({
        id: "kartverket-wms",
        type: "raster",
        source: "kartverket-wms",
      })
    }
  }, [])

  const addUserPlotLayer = useCallback(
    async (map: mapboxgl.Map) => {
      if (CONFIG.gnr === 0 && CONFIG.bnr === 0) return

      try {
        const url = `https://wfs.geonorge.no/skwfs/wfs.matrikkelkart?SERVICE=WFS&VERSION=2.0.0&REQUEST=GetFeature&TYPENAMES=Eiendomskart:Teig&CQL_FILTER=gaardsnummer=${CONFIG.gnr}%20AND%20bruksnummer=${CONFIG.bnr}&SRSNAME=EPSG:4326&outputFormat=application/json`
        const response = await fetch(url)
        if (!response.ok) return

        const data = await response.json() as GeoJSON.FeatureCollection
        if (!data.features || data.features.length === 0) return

        if (!map.getSource("user-plot")) {
          map.addSource("user-plot", {
            type: "geojson",
            data,
          })
          map.addLayer({
            id: "user-plot-fill",
            type: "fill",
            source: "user-plot",
            paint: {
              "fill-color": "#f59e0b",
              "fill-opacity": 0.15,
            },
          })
          map.addLayer({
            id: "user-plot-line",
            type: "line",
            source: "user-plot",
            paint: {
              "line-color": "#f59e0b",
              "line-width": 2,
            },
          })
        }
      } catch {
        // Silent fail — WMS lines still visible
      }
    },
    []
  )

  useEffect(() => {
    if (!mapContainerRef.current || mapRef.current) return

    const token = CONFIG.mapboxToken
    if (!token || token === "your_token_here") return

    mapboxgl.accessToken = token

    const map = new mapboxgl.Map({
      container: mapContainerRef.current,
      style: "mapbox://styles/mapbox/satellite-v9",
      center: CONFIG.defaultCenter,
      zoom: CONFIG.defaultZoom,
      preserveDrawingBuffer: true,
    })

    mapRef.current = map

    map.addControl(
      new mapboxgl.NavigationControl(),
      "bottom-right"
    )
    map.addControl(
      new mapboxgl.ScaleControl({ unit: "metric" }),
      "bottom-left"
    )

    map.on("zoom", () => {
      onZoomChange(map.getZoom())
    })

    onZoomChange(CONFIG.defaultZoom)

    map.on("load", () => {
      addKartverketLayers(map)
      addUserPlotLayer(map)
    })

    if (navigator.geolocation && window.location.protocol === "https:") {
      navigator.geolocation.getCurrentPosition(
        (position) => {
          map.flyTo({
            center: [position.coords.longitude, position.coords.latitude],
            zoom: CONFIG.defaultZoom,
          })
        },
        () => {
          // Silent fail — use default center
        }
      )
    }

    return () => {
      map.remove()
      mapRef.current = null
    }
  }, [onZoomChange, addKartverketLayers, addUserPlotLayer])

  const token = CONFIG.mapboxToken
  if (!token || token === "your_token_here") {
    return <TokenPrompt />
  }

  return (
    <div
      ref={mapContainerRef}
      className="absolute inset-0"
    />
  )
}
