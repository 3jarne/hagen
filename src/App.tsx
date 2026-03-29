import { useState, useCallback, useEffect } from "react"
import { TopBar } from "@/components/TopBar"
import { MapView } from "@/components/MapView"
import { FloatingToolbar } from "@/components/FloatingToolbar"
import { PropertiesPanel } from "@/components/PropertiesPanel"
import { SettingsDialog, hasValidToken } from "@/components/SettingsDialog"
import { CONFIG } from "@/config"

function App() {
  const [zoomLevel, setZoomLevel] = useState(CONFIG.defaultZoom)
  const [settingsOpen, setSettingsOpen] = useState(false)

  // Auto-open settings on first visit if no token
  useEffect(() => {
    if (!hasValidToken()) {
      setSettingsOpen(true)
    }
  }, [])

  const handleZoomChange = useCallback((zoom: number) => {
    setZoomLevel(zoom)
  }, [])

  return (
    <div className="h-screen w-screen overflow-hidden relative">
      <TopBar zoomLevel={zoomLevel} onOpenSettings={() => setSettingsOpen(true)} />
      <MapView onZoomChange={handleZoomChange} />
      <FloatingToolbar />
      <PropertiesPanel visible={false} />
      <SettingsDialog open={settingsOpen} onOpenChange={setSettingsOpen} />
    </div>
  )
}

export default App
