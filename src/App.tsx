import { useState, useCallback } from "react"
import { TopBar } from "@/components/TopBar"
import { MapView } from "@/components/MapView"
import { FloatingToolbar } from "@/components/FloatingToolbar"
import { PropertiesPanel } from "@/components/PropertiesPanel"
import { CONFIG } from "@/config"

function App() {
  const [zoomLevel, setZoomLevel] = useState(CONFIG.defaultZoom)

  const handleZoomChange = useCallback((zoom: number) => {
    setZoomLevel(zoom)
  }, [])

  return (
    <div className="h-screen w-screen overflow-hidden relative">
      <TopBar zoomLevel={zoomLevel} />
      <MapView onZoomChange={handleZoomChange} />
      <FloatingToolbar />
      <PropertiesPanel visible={false} />
    </div>
  )
}

export default App
