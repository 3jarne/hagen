import { Layers, Loader2 } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Switch } from "@/components/ui/switch"
import { Slider } from "@/components/ui/slider"
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
  kartverketVisible: boolean
  onKartverketVisibleChange: (visible: boolean) => void
  kartverketOpacity: number
  onKartverketOpacityChange: (opacity: number) => void
  kartverketLoading: boolean
}

export function ViewControlsPopover({
  mapStyle,
  onMapStyleChange,
  kartverketVisible,
  onKartverketVisibleChange,
  kartverketOpacity,
  onKartverketOpacityChange,
  kartverketLoading,
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

        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-sm">Kartverket overlay</span>
            {kartverketLoading ? (
              <span
                className="inline-flex items-center justify-center h-5 w-9"
                aria-label="Laster Kartverket"
                title="Laster Kartverket"
              >
                <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
              </span>
            ) : (
              <Switch
                checked={kartverketVisible}
                onCheckedChange={onKartverketVisibleChange}
              />
            )}
          </div>
          {kartverketVisible && !kartverketLoading && (
            <div>
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
        </div>
      </PopoverContent>
    </Popover>
  )
}
