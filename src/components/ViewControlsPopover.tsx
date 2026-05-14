import { Layers } from "lucide-react"
import { Button } from "@/components/ui/button"
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover"
import {
  ToggleGroup,
  ToggleGroupItem,
} from "@/components/ui/toggle-group"
import type { MapStyle } from "@/pages/MapPage"

interface ViewControlsPopoverProps {
  mapStyle: MapStyle
  onMapStyleChange: (style: MapStyle) => void
}

export function ViewControlsPopover({
  mapStyle,
  onMapStyleChange,
}: ViewControlsPopoverProps) {
  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button
          variant="secondary"
          size="icon"
          className="h-9 w-9 shadow-md"
          aria-label="Visningsalternativer"
          title="Visningsalternativer"
        >
          <Layers className="h-4 w-4" />
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-64 space-y-4">
        <div className="space-y-2">
          <span className="text-xs text-muted-foreground">Kartstil</span>
          <ToggleGroup
            type="single"
            value={mapStyle}
            onValueChange={(v) => v && onMapStyleChange(v as MapStyle)}
            className="grid grid-cols-3 gap-1"
          >
            <ToggleGroupItem value="satellite" size="sm">
              Satellitt
            </ToggleGroupItem>
            <ToggleGroupItem value="street" size="sm">
              Street
            </ToggleGroupItem>
            <ToggleGroupItem value="terrain" size="sm">
              Terrain
            </ToggleGroupItem>
          </ToggleGroup>
        </div>
      </PopoverContent>
    </Popover>
  )
}
