import {
  Undo2,
  Redo2,
  Sun,
  ArrowLeft,
  CloudOff,
  Loader2,
  CheckCircle2,
  Share2,
} from "lucide-react"
import { Button } from "@/components/ui/button"
import {
  Menubar,
  MenubarContent,
  MenubarItem,
  MenubarMenu,
  MenubarSeparator,
  MenubarShortcut,
  MenubarTrigger,
  MenubarCheckboxItem,
} from "@/components/ui/menubar"
import type { SaveStatus } from "@/components/MapView"
import { KeyboardShortcutsDialog } from "@/components/KeyboardShortcutsDialog"
import { cn } from "@/lib/utils"
import { useState } from "react"

interface TopBarProps {
  zoomLevel: number
  canUndo: boolean
  canRedo: boolean
  onUndo: () => void
  onRedo: () => void
  onExportJSON: () => void
  onExportPNG: () => void
  onZoomIn: () => void
  onZoomOut: () => void
  onResetView: () => void
  areaLabelsVisible: boolean
  onAreaLabelsVisibleChange: (visible: boolean) => void
  solkompassVisible: boolean
  onSolkompassVisibleChange: (visible: boolean) => void
  projectTitle: string
  saveStatus: SaveStatus
  onBack: () => void
  sharingEnabled: boolean
  onShareClick: () => void
}

export function TopBar({
  zoomLevel,
  canUndo,
  canRedo,
  onUndo,
  onRedo,
  onExportJSON,
  onExportPNG,
  onZoomIn,
  onZoomOut,
  onResetView,
  areaLabelsVisible,
  onAreaLabelsVisibleChange,
  solkompassVisible,
  onSolkompassVisibleChange,
  projectTitle,
  saveStatus,
  onBack,
  sharingEnabled,
  onShareClick,
}: TopBarProps) {
  const [shortcutsOpen, setShortcutsOpen] = useState(false)
  return (
    <div className="fixed top-0 left-0 right-0 z-50 flex items-center h-10 border-b bg-background">
      <Button
        variant="ghost"
        size="sm"
        className="h-8 ml-1 mr-1 gap-1"
        onClick={onBack}
        aria-label="Tilbake til prosjekter"
      >
        <ArrowLeft className="h-4 w-4" />
        <span className="hidden sm:inline">Prosjekter</span>
      </Button>
      <span
        className="text-sm font-medium truncate max-w-[28ch] mr-1"
        title={projectTitle}
      >
        {projectTitle}
      </span>
      <Button
        variant={sharingEnabled ? "secondary" : "ghost"}
        size="sm"
        className="h-8 mr-2 gap-1"
        onClick={onShareClick}
        title={sharingEnabled ? "Deling er på" : "Del hageplanen"}
      >
        <Share2 className="h-4 w-4" />
        <span className="hidden sm:inline">Del</span>
      </Button>

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
            <MenubarCheckboxItem
              checked={areaLabelsVisible}
              onCheckedChange={onAreaLabelsVisibleChange}
            >
              Vis areal (m²)
            </MenubarCheckboxItem>
            <MenubarCheckboxItem
              checked={solkompassVisible}
              onCheckedChange={onSolkompassVisibleChange}
            >
              Vis solkompass
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

      <div className="flex-1" />

      {/* Save status */}
      <SaveStatusBadge status={saveStatus} />

      {/* Zoom level */}
      <div className="px-2 text-xs text-muted-foreground font-mono whitespace-nowrap">
        z{Math.round(zoomLevel)}
      </div>

      <Button
        variant={solkompassVisible ? "secondary" : "ghost"}
        size="icon"
        className="h-8 w-8 mr-2"
        onClick={() => onSolkompassVisibleChange(!solkompassVisible)}
        title="Solkompass"
      >
        <Sun className="h-4 w-4 text-amber-500" />
      </Button>
      <KeyboardShortcutsDialog open={shortcutsOpen} onOpenChange={setShortcutsOpen} />
    </div>
  )
}

function SaveStatusBadge({ status }: { status: SaveStatus }) {
  if (status === "idle") return null
  const config = {
    saving: {
      icon: <Loader2 className="h-3.5 w-3.5 animate-spin" />,
      label: "Lagrer…",
      className: "text-muted-foreground",
    },
    saved: {
      icon: <CheckCircle2 className="h-3.5 w-3.5" />,
      label: "Lagret",
      className: "text-muted-foreground",
    },
    error: {
      icon: <CloudOff className="h-3.5 w-3.5" />,
      label: "Feil ved lagring",
      className: "text-destructive",
    },
  }[status]
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 text-xs whitespace-nowrap px-2",
        config.className,
      )}
    >
      {config.icon}
      {config.label}
    </span>
  )
}
