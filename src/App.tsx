import { useState, useCallback, useEffect, useRef } from "react"
import { TopBar } from "@/components/TopBar"
import { MapView } from "@/components/MapView"
import { FloatingToolbar, type Tool } from "@/components/FloatingToolbar"
import { PropertiesPanel } from "@/components/PropertiesPanel"
import { SettingsDialog, hasValidToken } from "@/components/SettingsDialog"
import { CONFIG } from "@/config"
import {
  DEFAULT_SHAPE,
  DEFAULT_TEXT,
  ZONE_PRESETS,
  type ShapeProperties,
  type TextProperties,
  type ZoneCategory,
} from "@/lib/zone-defaults"

export type PanelMode = "shape" | "text" | "none"

function App() {
  const [zoomLevel, setZoomLevel] = useState(CONFIG.defaultZoom)
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [activeTool, setActiveTool] = useState<Tool>("select")
  const [canUndo, setCanUndo] = useState(false)
  const [canRedo, setCanRedo] = useState(false)
  const undoRef = useRef<(() => void) | null>(null)
  const redoRef = useRef<(() => void) | null>(null)
  const exportJSONRef = useRef<(() => void) | null>(null)
  const exportPNGRef = useRef<(() => void) | null>(null)

  // Properties panel state
  const [shapeDefaults, setShapeDefaults] = useState<ShapeProperties>({
    ...DEFAULT_SHAPE,
  })
  const [textDefaults, setTextDefaults] = useState<TextProperties>({
    ...DEFAULT_TEXT,
  })
  const [panelMode, setPanelMode] = useState<PanelMode>("none")
  // Track whether we're showing defaults or editing a selection
  const [isEditingSelection, setIsEditingSelection] = useState(false)

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

  const handleExportJSON = useCallback(() => {
    exportJSONRef.current?.()
  }, [])

  const handleExportPNG = useCallback(() => {
    exportPNGRef.current?.()
  }, [])

  const handleShapeChange = useCallback(
    (partial: Partial<ShapeProperties>) => {
      // If changing zone category, apply preset colors
      if (partial.zone && !isEditingSelection) {
        const preset = ZONE_PRESETS[partial.zone as ZoneCategory]
        if (preset) {
          setShapeDefaults((prev) => ({ ...prev, ...preset }))
          return
        }
      }
      setShapeDefaults((prev) => ({ ...prev, ...partial }))
    },
    [isEditingSelection]
  )

  const handleTextChange = useCallback((partial: Partial<TextProperties>) => {
    setTextDefaults((prev) => ({ ...prev, ...partial }))
  }, [])

  // Determine panel visibility
  const isDrawTool =
    activeTool === "polygon" ||
    activeTool === "rectangle" ||
    activeTool === "circle"
  const isTextTool = activeTool === "text"
  const showPanel =
    isDrawTool || isTextTool || panelMode !== "none"

  return (
    <div className="h-screen w-screen overflow-hidden relative">
      <TopBar
        zoomLevel={zoomLevel}
        onOpenSettings={() => setSettingsOpen(true)}
        canUndo={canUndo}
        canRedo={canRedo}
        onUndo={handleUndo}
        onRedo={handleRedo}
        onExportJSON={handleExportJSON}
        onExportPNG={handleExportPNG}
      />
      <MapView
        onZoomChange={handleZoomChange}
        activeTool={activeTool}
        onToolChange={handleToolChange}
        onUndoRedoChange={handleUndoRedoChange}
        undoRef={undoRef}
        redoRef={redoRef}
        shapeDefaults={shapeDefaults}
        textDefaults={textDefaults}
        onShapeDefaultsChange={setShapeDefaults}
        onTextDefaultsChange={setTextDefaults}
        onPanelModeChange={setPanelMode}
        onEditingSelectionChange={setIsEditingSelection}
        exportJSONRef={exportJSONRef}
        exportPNGRef={exportPNGRef}
      />
      <FloatingToolbar activeTool={activeTool} onToolChange={handleToolChange} />
      <PropertiesPanel
        visible={showPanel}
        mode={isDrawTool ? "shape" : isTextTool ? "text" : panelMode}
        shapeProps={shapeDefaults}
        textProps={textDefaults}
        onShapeChange={handleShapeChange}
        onTextChange={handleTextChange}
      />
      <SettingsDialog open={settingsOpen} onOpenChange={setSettingsOpen} />
    </div>
  )
}

export default App
