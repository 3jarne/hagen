import { useState, useCallback, useEffect, useRef } from "react"
import { TopBar } from "@/components/TopBar"
import { MapView } from "@/components/MapView"
import { FloatingToolbar, type Tool } from "@/components/FloatingToolbar"
import { PropertiesPanel } from "@/components/PropertiesPanel"
import { SettingsDialog, hasValidToken } from "@/components/SettingsDialog"
import { CONFIG } from "@/config"

function App() {
  const [zoomLevel, setZoomLevel] = useState(CONFIG.defaultZoom)
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [activeTool, setActiveTool] = useState<Tool>("select")
  const [canUndo, setCanUndo] = useState(false)
  const [canRedo, setCanRedo] = useState(false)
  const undoRef = useRef<(() => void) | null>(null)
  const redoRef = useRef<(() => void) | null>(null)

  // Auto-open settings on first visit if no token
  useEffect(() => {
    if (!hasValidToken()) {
      setSettingsOpen(true)
    }
  }, [])

  const handleZoomChange = useCallback((zoom: number) => {
    setZoomLevel(zoom)
  }, [])

  const handleToolChange = useCallback((tool: Tool) => {
    setActiveTool(tool)
  }, [])

  const handleUndoRedoChange = useCallback((undo: boolean, redo: boolean) => {
    setCanUndo(undo)
    setCanRedo(redo)
  }, [])

  const handleUndo = useCallback(() => {
    undoRef.current?.()
  }, [])

  const handleRedo = useCallback(() => {
    redoRef.current?.()
  }, [])

  return (
    <div className="h-screen w-screen overflow-hidden relative">
      <TopBar
        zoomLevel={zoomLevel}
        onOpenSettings={() => setSettingsOpen(true)}
        canUndo={canUndo}
        canRedo={canRedo}
        onUndo={handleUndo}
        onRedo={handleRedo}
      />
      <MapView
        onZoomChange={handleZoomChange}
        activeTool={activeTool}
        onToolChange={handleToolChange}
        onUndoRedoChange={handleUndoRedoChange}
        undoRef={undoRef}
        redoRef={redoRef}
      />
      <FloatingToolbar activeTool={activeTool} onToolChange={handleToolChange} />
      <PropertiesPanel visible={false} />
      <SettingsDialog open={settingsOpen} onOpenChange={setSettingsOpen} />
    </div>
  )
}

export default App
