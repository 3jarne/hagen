import { useState, useEffect, useRef, useCallback } from "react"
import mapboxgl from "mapbox-gl"
import "mapbox-gl/dist/mapbox-gl.css"
import { CONFIG } from "@/config"
import { hasValidToken, loadSettings } from "@/components/SettingsDialog"

interface MapViewProps {
  onZoomChange: (zoom: number) => void
}

export function MapView({ onZoomChange }: MapViewProps) {
  const mapContainerRef = useRef<HTMLDivElement>(null)
  const overlayContainerRef = useRef<HTMLDivElement>(null)
  const mapRef = useRef<mapboxgl.Map | null>(null)
  const overlayMapRef = useRef<mapboxgl.Map | null>(null)
  const [overlayVisible, setOverlayVisible] = useState(true)

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
        // Silent fail
      }
    },
    []
  )

  useEffect(() => {
    if (!mapContainerRef.current || !overlayContainerRef.current || mapRef.current) return

    if (!hasValidToken()) return

    mapboxgl.accessToken = CONFIG.mapboxToken

    // Main map — satellite imagery
    const map = new mapboxgl.Map({
      container: mapContainerRef.current,
      style: "mapbox://styles/mapbox/satellite-v9",
      center: CONFIG.defaultCenter,
      zoom: CONFIG.defaultZoom,
      preserveDrawingBuffer: true,
    })

    mapRef.current = map

    // Kartverket overlay map — screen blended on top
    const overlayMap = new mapboxgl.Map({
      container: overlayContainerRef.current,
      style: {
        version: 8,
        sources: {
          "kartverket-topo": {
            type: "raster",
            tiles: [
              "https://cache.kartverket.no/v1/wmts/1.0.0/topograatone/default/webmercator/{z}/{y}/{x}.png",
            ],
            tileSize: 256,
            minzoom: 14,
            maxzoom: 18,
          },
        },
        layers: [
          {
            id: "background",
            type: "background",
            paint: { "background-color": "#000000" },
          },
          {
            id: "kartverket-topo",
            type: "raster",
            source: "kartverket-topo",
            paint: {},
          },
        ],
      },
      center: CONFIG.defaultCenter,
      zoom: CONFIG.defaultZoom,
      interactive: false,
      attributionControl: false,
    })

    overlayMapRef.current = overlayMap

    // Sync overlay to main map
    const syncOverlay = () => {
      overlayMap.jumpTo({
        center: map.getCenter(),
        zoom: map.getZoom(),
        bearing: map.getBearing(),
        pitch: map.getPitch(),
      })
    }

    map.on("move", syncOverlay)

    // Controls on main map only
    map.addControl(new mapboxgl.NavigationControl(), "bottom-right")
    map.addControl(new mapboxgl.ScaleControl({ unit: "metric" }), "bottom-left")

    map.on("zoom", () => {
      const z = map.getZoom()
      onZoomChange(z)
      setOverlayVisible(z >= 13.5)
    })

    onZoomChange(CONFIG.defaultZoom)

    map.on("load", () => {
      addUserPlotLayer(map)
    })

    // Only use GPS if user hasn't configured custom coordinates
    const settings = loadSettings()
    const hasCustomCoords =
      settings.lat !== 60.41601 || settings.lng !== 11.05218

    if (
      !hasCustomCoords &&
      navigator.geolocation &&
      window.location.protocol === "https:"
    ) {
      navigator.geolocation.getCurrentPosition(
        (position) => {
          map.flyTo({
            center: [position.coords.longitude, position.coords.latitude],
            zoom: CONFIG.defaultZoom,
          })
        },
        () => {
          // Silent fail
        }
      )
    }

    return () => {
      map.off("move", syncOverlay)
      overlayMap.remove()
      overlayMapRef.current = null
      map.remove()
      mapRef.current = null
    }
  }, [onZoomChange, addUserPlotLayer])

  if (!hasValidToken()) {
    return (
      <div className="absolute inset-0 flex items-center justify-center bg-muted">
        <div className="rounded-lg border bg-card p-6 shadow-lg max-w-md text-center">
          <p className="text-sm text-card-foreground">
            Open <strong>Settings</strong> (gear icon in the top bar) to add your
            Mapbox token and configure your property location.
          </p>
        </div>
      </div>
    )
  }

  return (
    <>
      <div ref={mapContainerRef} className="absolute inset-0" />
      <div
        ref={overlayContainerRef}
        className="absolute inset-0 pointer-events-none"
        style={{
          mixBlendMode: "screen",
          filter: "invert(1)",
          opacity: overlayVisible ? 1 : 0,
          transition: "opacity 0.3s ease",
        }}
      />
    </>
  )
}
