import { useState, useCallback, useEffect, useRef } from "react"
import { TopBar } from "@/components/TopBar"
import { MapView } from "@/components/MapView"
import { FloatingToolbar, type Tool, type ToolbarMode } from "@/components/FloatingToolbar"
import { PropertiesPanel } from "@/components/PropertiesPanel"
import { SettingsDialog, hasValidToken } from "@/components/SettingsDialog"
import { CONFIG } from "@/config"
import {
  DEFAULT_SHAPE,
  DEFAULT_TEXT,
  DEFAULT_LINE,
  ZONE_PRESETS,
  type ShapeProperties,
  type TextProperties,
  type LineProperties,
  type ZoneCategory,
} from "@/lib/zone-defaults"
import type { GardenElementType } from "@/lib/garden-types"
import { GARDEN_ELEMENTS, gardenDrawModeToTool } from "@/lib/garden-types"

export type PanelMode = "shape" | "text" | "line" | "garden" | "none"
export type MapStyle = "satellite" | "street" | "terrain"

function App() {
  const [zoomLevel, setZoomLevel] = useState(CONFIG.defaultZoom)
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [activeTool, setActiveTool] = useState<Tool>("select")
  const [toolbarMode, setToolbarMode] = useState<ToolbarMode>("garden")
  const [activeGardenElement, setActiveGardenElement] = useState<GardenElementType | null>(null)
  const [canUndo, setCanUndo] = useState(false)
  const [canRedo, setCanRedo] = useState(false)
  const undoRef = useRef<(() => void) | null>(null)
  const redoRef = useRef<(() => void) | null>(null)
  const exportJSONRef = useRef<(() => void) | null>(null)
  const exportPNGRef = useRef<(() => void) | null>(null)
  const zoomInRef = useRef<(() => void) | null>(null)
  const zoomOutRef = useRef<(() => void) | null>(null)
  const resetViewRef = useRef<(() => void) | null>(null)

  // View menu state
  const [mapStyle, setMapStyle] = useState<MapStyle>("satellite")
  const [kartverketVisible, setKartverketVisible] = useState(true)
  const [kartverketOpacity, setKartverketOpacity] = useState(0.4)
  const [areaLabelsVisible, setAreaLabelsVisible] = useState(false)
  const [solkompassVisible, setSolkompassVisible] = useState(false)
  const [solkompassDate, setSolkompassDate] = useState<Date>(() => new Date())

  // Properties panel state — global defaults (never overwritten by selection)
  const [shapeDefaults, setShapeDefaults] = useState<ShapeProperties>({
    ...DEFAULT_SHAPE,
  })
  const [textDefaults, setTextDefaults] = useState<TextProperties>({
    ...DEFAULT_TEXT,
  })
  const [lineDefaults, setLineDefaults] = useState<LineProperties>({
    ...DEFAULT_LINE,
  })
  // Selected element properties (null when nothing selected)
  const [selectedShapeProps, setSelectedShapeProps] =
    useState<ShapeProperties | null>(null)
  const [selectedTextProps, setSelectedTextProps] =
    useState<TextProperties | null>(null)
  const [selectedLineProps, setSelectedLineProps] =
    useState<LineProperties | null>(null)

  const [panelMode, setPanelMode] = useState<PanelMode>("none")
  // Track whether we're showing defaults or editing a selection
  const [isEditingSelection, setIsEditingSelection] = useState(false)
  // Selected garden feature state
  const [selectedGardenType, setSelectedGardenType] = useState<GardenElementType | null>(null)
  const [selectedGardenName, setSelectedGardenName] = useState<string | null>(null)
  const [selectedGardenDiameter, setSelectedGardenDiameter] = useState<number | null>(null)
  const [selectedGardenWidth, setSelectedGardenWidth] = useState<number | null>(null)
  const [selectedGardenColor, setSelectedGardenColor] = useState<string | null>(null)

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
    // Switching to a raw tool clears garden element
    if (tool === "select") return
    setActiveGardenElement(null)
  }, [])

  const handleGardenElementChange = useCallback((type: GardenElementType) => {
    setActiveGardenElement(type)
    const el = GARDEN_ELEMENTS[type]
    const tool = gardenDrawModeToTool(el.drawMode)
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

  const handleSelectedGardenChange = useCallback(
    (type: GardenElementType | null, name: string | null, diameter: number | null, width: number | null, color: string | null) => {
      setSelectedGardenType(type)
      setSelectedGardenName(name)
      setSelectedGardenDiameter(diameter)
      setSelectedGardenWidth(width)
      setSelectedGardenColor(color)
    },
    []
  )

  const handleEditingSelectionChange = useCallback((editing: boolean) => {
    setIsEditingSelection(editing)
    if (!editing) {
      setSelectedShapeProps(null)
      setSelectedTextProps(null)
      setSelectedLineProps(null)
      setSelectedGardenType(null)
      setSelectedGardenName(null)
      setSelectedGardenDiameter(null)
      setSelectedGardenWidth(null)
      setSelectedGardenColor(null)
    }
  }, [])

  const handleShapeChange = useCallback(
    (partial: Partial<ShapeProperties>) => {
      // If changing zone category, apply preset colors
      if (partial.zone) {
        const preset = ZONE_PRESETS[partial.zone as ZoneCategory]
        if (preset) {
          if (isEditingSelection) {
            setSelectedShapeProps((prev) => (prev ? { ...prev, ...preset } : prev))
          } else {
            setShapeDefaults((prev) => ({ ...prev, ...preset }))
          }
          return
        }
      }
      if (isEditingSelection) {
        setSelectedShapeProps((prev) => (prev ? { ...prev, ...partial } : prev))
      } else {
        setShapeDefaults((prev) => ({ ...prev, ...partial }))
      }
    },
    [isEditingSelection]
  )

  const handleTextChange = useCallback(
    (partial: Partial<TextProperties>) => {
      if (isEditingSelection) {
        setSelectedTextProps((prev) => (prev ? { ...prev, ...partial } : prev))
      } else {
        setTextDefaults((prev) => ({ ...prev, ...partial }))
      }
    },
    [isEditingSelection]
  )

  const handleLineChange = useCallback(
    (partial: Partial<LineProperties>) => {
      if (isEditingSelection) {
        setSelectedLineProps((prev) => (prev ? { ...prev, ...partial } : prev))
      } else {
        setLineDefaults((prev) => ({ ...prev, ...partial }))
      }
    },
    [isEditingSelection]
  )

  // Determine panel visibility and mode
  const isDrawTool =
    activeTool === "polygon" ||
    activeTool === "rectangle" ||
    activeTool === "circle"
  const isTextTool = activeTool === "text"
  const isLineTool = activeTool === "line"
  const isGardenDraw = activeGardenElement !== null && isDrawTool
  const showPanel =
    isDrawTool || isTextTool || isLineTool || isGardenDraw || panelMode !== "none"

  const isGardenSelected = isEditingSelection && selectedGardenType !== null
  const effectivePanelMode: PanelMode = isGardenDraw || isGardenSelected
    ? "garden"
    : isLineTool
      ? "line"
      : isDrawTool
        ? "shape"
        : isTextTool
          ? "text"
          : panelMode

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
        mapStyle={mapStyle}
        onMapStyleChange={setMapStyle}
        kartverketVisible={kartverketVisible}
        onKartverketVisibleChange={setKartverketVisible}
        kartverketOpacity={kartverketOpacity}
        onKartverketOpacityChange={setKartverketOpacity}
        onZoomIn={() => zoomInRef.current?.()}
        onZoomOut={() => zoomOutRef.current?.()}
        onResetView={() => resetViewRef.current?.()}
        areaLabelsVisible={areaLabelsVisible}
        onAreaLabelsVisibleChange={setAreaLabelsVisible}
        solkompassVisible={solkompassVisible}
        onSolkompassVisibleChange={setSolkompassVisible}
      />
      <MapView
        onZoomChange={handleZoomChange}
        activeTool={activeTool}
        activeGardenElement={activeGardenElement}
        onToolChange={handleToolChange}
        onUndoRedoChange={handleUndoRedoChange}
        undoRef={undoRef}
        redoRef={redoRef}
        shapeDefaults={shapeDefaults}
        textDefaults={textDefaults}
        lineDefaults={lineDefaults}
        selectedShapeProps={selectedShapeProps}
        selectedTextProps={selectedTextProps}
        selectedLineProps={selectedLineProps}
        onSelectedShapeChange={setSelectedShapeProps}
        onSelectedTextChange={setSelectedTextProps}
        onSelectedLineChange={setSelectedLineProps}
        onPanelModeChange={setPanelMode}
        onEditingSelectionChange={handleEditingSelectionChange}
        onSelectedGardenChange={handleSelectedGardenChange}
        exportJSONRef={exportJSONRef}
        exportPNGRef={exportPNGRef}
        mapStyle={mapStyle}
        kartverketVisible={kartverketVisible}
        kartverketOpacity={kartverketOpacity}
        selectedGardenDiameter={selectedGardenDiameter}
        selectedGardenWidth={selectedGardenWidth}
        selectedGardenName={selectedGardenName}
        selectedGardenColor={selectedGardenColor}
        areaLabelsVisible={areaLabelsVisible}
        solkompassVisible={solkompassVisible}
        solkompassDate={solkompassDate}
        onSolkompassDateChange={setSolkompassDate}
        zoomInRef={zoomInRef}
        zoomOutRef={zoomOutRef}
        resetViewRef={resetViewRef}
      />
      <FloatingToolbar
        activeTool={activeTool}
        onToolChange={handleToolChange}
        toolbarMode={toolbarMode}
        onToolbarModeChange={setToolbarMode}
        activeGardenElement={activeGardenElement}
        onGardenElementChange={handleGardenElementChange}
      />
      <PropertiesPanel
        visible={showPanel}
        mode={effectivePanelMode}
        shapeProps={selectedShapeProps ?? shapeDefaults}
        textProps={selectedTextProps ?? textDefaults}
        lineProps={selectedLineProps ?? lineDefaults}
        activeGardenElement={isGardenSelected ? selectedGardenType : activeGardenElement}
        gardenFeatureName={selectedGardenName}
        gardenDiameter={selectedGardenDiameter}
        gardenWidth={selectedGardenWidth}
        onGardenFeatureNameChange={setSelectedGardenName}
        onGardenColorChange={setSelectedGardenColor}
        onGardenDiameterChange={setSelectedGardenDiameter}
        onGardenWidthChange={setSelectedGardenWidth}
        onShapeChange={handleShapeChange}
        onTextChange={handleTextChange}
        onLineChange={handleLineChange}
      />
      <SettingsDialog open={settingsOpen} onOpenChange={setSettingsOpen} />
    </div>
  )
}

export default App
