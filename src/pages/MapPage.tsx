import { useCallback, useEffect, useRef, useState } from "react"
import { Navigate, useNavigate, useParams } from "react-router-dom"
import { Loader2 } from "lucide-react"
import { TopBar } from "@/components/TopBar"
import { MapView, type SaveStatus } from "@/components/MapView"
import { FloatingToolbar, type Tool, type ToolbarMode } from "@/components/FloatingToolbar"
import { PropertiesPanel } from "@/components/PropertiesPanel"
import { ShareDialog } from "@/components/ShareDialog"
import { getProject, type Project } from "@/lib/projects"
import { loadDrawing, type DrawingData } from "@/lib/drawings"
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

export function MapPage() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()

  const [project, setProject] = useState<Project | null | "notfound">(null)
  const [drawings, setDrawings] = useState<DrawingData | null>(null)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [saveStatus, setSaveStatus] = useState<SaveStatus>("idle")

  useEffect(() => {
    if (!id) return
    let active = true
    ;(async () => {
      try {
        const [p, d] = await Promise.all([getProject(id), loadDrawing(id)])
        if (!active) return
        if (!p) {
          setProject("notfound")
          return
        }
        setProject(p)
        setDrawings(d)
      } catch (err) {
        if (!active) return
        setLoadError(
          err instanceof Error ? err.message : "Kunne ikke åpne prosjektet",
        )
      }
    })()
    return () => {
      active = false
    }
  }, [id])

  const handleBack = useCallback(() => {
    navigate("/prosjekter")
  }, [navigate])

  if (!id) return <Navigate to="/prosjekter" replace />
  if (project === "notfound") return <Navigate to="/prosjekter" replace />

  if (loadError) {
    return (
      <div className="min-h-screen flex items-center justify-center p-4">
        <div className="text-center space-y-3 max-w-md">
          <p className="text-sm text-destructive">{loadError}</p>
          <button
            onClick={handleBack}
            className="text-sm underline underline-offset-4"
          >
            Tilbake til prosjekter
          </button>
        </div>
      </div>
    )
  }

  if (!project || !drawings) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" />
          Laster prosjekt…
        </div>
      </div>
    )
  }

  return (
    <LoadedMap
      project={project}
      initialDrawings={drawings}
      saveStatus={saveStatus}
      onSaveStatusChange={setSaveStatus}
      onBack={handleBack}
    />
  )
}

interface LoadedMapProps {
  project: Project
  initialDrawings: DrawingData
  saveStatus: SaveStatus
  onSaveStatusChange: (s: SaveStatus) => void
  onBack: () => void
}

function LoadedMap({
  project,
  initialDrawings,
  saveStatus,
  onSaveStatusChange,
  onBack,
}: LoadedMapProps) {
  const [zoomLevel, setZoomLevel] = useState(project.zoom)
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
  const [kartverketVisible, setKartverketVisible] = useState(false)
  const [kartverketOpacity, setKartverketOpacity] = useState(0.4)
  const [areaLabelsVisible, setAreaLabelsVisible] = useState(false)
  const [solkompassVisible, setSolkompassVisible] = useState(false)
  const [solkompassDate, setSolkompassDate] = useState<Date>(() => new Date())

  // Sharing state
  const [shareDialogOpen, setShareDialogOpen] = useState(false)
  const [sharingEnabled, setSharingEnabled] = useState(project.sharing_enabled)
  const [shareId, setShareId] = useState<string | null>(project.share_id)

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
        projectTitle={project.address}
        saveStatus={saveStatus}
        onBack={onBack}
        sharingEnabled={sharingEnabled}
        onShareClick={() => setShareDialogOpen(true)}
      />
      <MapView
        projectId={project.id}
        projectCenter={[project.center_lng, project.center_lat]}
        projectZoom={project.zoom}
        projectGnr={project.gnr}
        projectBnr={project.bnr}
        initialDrawings={initialDrawings}
        onSaveStatusChange={onSaveStatusChange}
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
        gardenColor={selectedGardenColor}
        onGardenFeatureNameChange={setSelectedGardenName}
        onGardenColorChange={setSelectedGardenColor}
        onGardenDiameterChange={setSelectedGardenDiameter}
        onGardenWidthChange={setSelectedGardenWidth}
        onShapeChange={handleShapeChange}
        onTextChange={handleTextChange}
        onLineChange={handleLineChange}
      />
      <ShareDialog
        open={shareDialogOpen}
        onOpenChange={setShareDialogOpen}
        projectId={project.id}
        projectCenter={[project.center_lng, project.center_lat]}
        sharingEnabled={sharingEnabled}
        shareId={shareId}
        onShareStateChange={({ sharing_enabled, share_id }) => {
          setSharingEnabled(sharing_enabled)
          setShareId(share_id)
        }}
      />
    </div>
  )
}
