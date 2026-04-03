import { Undo2, Redo2, Search, Settings } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Slider } from "@/components/ui/slider"
import {
  Menubar,
  MenubarContent,
  MenubarItem,
  MenubarMenu,
  MenubarSeparator,
  MenubarShortcut,
  MenubarTrigger,
  MenubarCheckboxItem,
  MenubarRadioGroup,
  MenubarRadioItem,
} from "@/components/ui/menubar"
import type { MapStyle } from "@/App"
import { KeyboardShortcutsDialog } from "@/components/KeyboardShortcutsDialog"
import { useState } from "react"

interface TopBarProps {
  zoomLevel: number
  onOpenSettings: () => void
  canUndo: boolean
  canRedo: boolean
  onUndo: () => void
  onRedo: () => void
  onExportJSON: () => void
  onExportPNG: () => void
  mapStyle: MapStyle
  onMapStyleChange: (style: MapStyle) => void
  kartverketVisible: boolean
  onKartverketVisibleChange: (visible: boolean) => void
  kartverketOpacity: number
  onKartverketOpacityChange: (opacity: number) => void
  onZoomIn: () => void
  onZoomOut: () => void
  onResetView: () => void
  areaLabelsVisible: boolean
  onAreaLabelsVisibleChange: (visible: boolean) => void
}

export function TopBar({
  zoomLevel,
  onOpenSettings,
  canUndo,
  canRedo,
  onUndo,
  onRedo,
  onExportJSON,
  onExportPNG,
  mapStyle,
  onMapStyleChange,
  kartverketVisible,
  onKartverketVisibleChange,
  kartverketOpacity,
  onKartverketOpacityChange,
  onZoomIn,
  onZoomOut,
  onResetView,
  areaLabelsVisible,
  onAreaLabelsVisibleChange,
}: TopBarProps) {
  const [shortcutsOpen, setShortcutsOpen] = useState(false)
  return (
    <div className="fixed top-0 left-0 right-0 z-50 flex items-center h-10 border-b bg-background">
      <Menubar className="border-none rounded-none h-full shadow-none">
        <MenubarMenu>
          <MenubarTrigger>File</MenubarTrigger>
          <MenubarContent>
            <MenubarItem onClick={onExportJSON}>Export JSON</MenubarItem>
            <MenubarItem onClick={onExportPNG}>Export PNG</MenubarItem>
          </MenubarContent>
        </MenubarMenu>

        <MenubarMenu>
          <MenubarTrigger>Edit</MenubarTrigger>
          <MenubarContent>
            <MenubarItem disabled={!canUndo} onClick={onUndo}>
              Undo <MenubarShortcut>⌘Z</MenubarShortcut>
            </MenubarItem>
            <MenubarItem disabled={!canRedo} onClick={onRedo}>
              Redo <MenubarShortcut>⌘⇧Z</MenubarShortcut>
            </MenubarItem>
            <MenubarSeparator />
            <MenubarItem disabled>
              Delete Selected <MenubarShortcut>Del</MenubarShortcut>
            </MenubarItem>
          </MenubarContent>
        </MenubarMenu>

        <MenubarMenu>
          <MenubarTrigger>View</MenubarTrigger>
          <MenubarContent>
            <MenubarRadioGroup
              value={mapStyle}
              onValueChange={(v) => onMapStyleChange(v as MapStyle)}
            >
              <MenubarRadioItem value="satellite">Satellite</MenubarRadioItem>
              <MenubarRadioItem value="street">Street</MenubarRadioItem>
              <MenubarRadioItem value="terrain">Terrain</MenubarRadioItem>
            </MenubarRadioGroup>
            <MenubarSeparator />
            <MenubarCheckboxItem
              checked={kartverketVisible}
              onCheckedChange={onKartverketVisibleChange}
            >
              Kartverket overlay
            </MenubarCheckboxItem>
            {kartverketVisible && (
              <div className="px-2 py-1.5">
                <div className="flex items-center justify-between mb-1">
                  <span className="text-xs text-muted-foreground">Opacity</span>
                  <span className="text-xs text-muted-foreground font-mono">
                    {Math.round(kartverketOpacity * 100)}%
                  </span>
                </div>
                <Slider
                  value={[kartverketOpacity]}
                  min={0.1}
                  max={1}
                  step={0.05}
                  onValueChange={([v]) => onKartverketOpacityChange(v)}
                />
              </div>
            )}
            <MenubarCheckboxItem
              checked={areaLabelsVisible}
              onCheckedChange={onAreaLabelsVisibleChange}
            >
              Vis areal (m²)
            </MenubarCheckboxItem>
            <MenubarSeparator />
            <MenubarItem onClick={onZoomIn}>
              Zoom In <MenubarShortcut>+</MenubarShortcut>
            </MenubarItem>
            <MenubarItem onClick={onZoomOut}>
              Zoom Out <MenubarShortcut>-</MenubarShortcut>
            </MenubarItem>
            <MenubarItem onClick={onResetView}>Reset to property view</MenubarItem>
          </MenubarContent>
        </MenubarMenu>

        <MenubarMenu>
          <MenubarTrigger>Help</MenubarTrigger>
          <MenubarContent>
            <MenubarItem onClick={() => setShortcutsOpen(true)}>Keyboard shortcuts</MenubarItem>
          </MenubarContent>
        </MenubarMenu>
      </Menubar>

      {/* Undo/Redo buttons */}
      <div className="flex items-center gap-0.5 ml-1">
        <Button
          variant="ghost"
          size="icon"
          className="h-8 w-8"
          disabled={!canUndo}
          onClick={onUndo}
        >
          <Undo2 className="h-4 w-4" />
        </Button>
        <Button
          variant="ghost"
          size="icon"
          className="h-8 w-8"
          disabled={!canRedo}
          onClick={onRedo}
        >
          <Redo2 className="h-4 w-4" />
        </Button>
      </div>

      {/* Search input - centered */}
      <div className="flex-1 flex justify-center px-4">
        <div className="relative w-full max-w-xs">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
          <input
            type="text"
            placeholder="Search address..."
            className="w-full h-7 pl-8 pr-3 text-sm rounded-md border border-input bg-background text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring"
            readOnly
          />
        </div>
      </div>

      {/* Zoom level */}
      <div className="pr-1 text-xs text-muted-foreground font-mono whitespace-nowrap">
        z{Math.round(zoomLevel)}
      </div>

      {/* Settings */}
      <Button
        variant="ghost"
        size="icon"
        className="h-8 w-8 mr-2"
        onClick={onOpenSettings}
      >
        <Settings className="h-4 w-4" />
      </Button>
      <KeyboardShortcutsDialog open={shortcutsOpen} onOpenChange={setShortcutsOpen} />
    </div>
  )
}
