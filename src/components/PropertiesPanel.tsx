import { HexColorPicker } from "react-colorful"
import { Label } from "@/components/ui/label"
import { Slider } from "@/components/ui/slider"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover"
import { Separator } from "@/components/ui/separator"
import { Switch } from "@/components/ui/switch"
import type { ShapeProperties, TextProperties, LineProperties } from "@/lib/zone-defaults"
import { ZONE_CATEGORIES } from "@/lib/zone-defaults"
import { GARDEN_ELEMENTS, type GardenElementType } from "@/lib/garden-types"

interface PropertiesPanelProps {
  visible: boolean
  mode: "shape" | "text" | "line" | "garden" | "none"
  shapeProps: ShapeProperties
  textProps: TextProperties
  lineProps: LineProperties
  activeGardenElement: GardenElementType | null
  gardenFeatureName: string | null
  gardenDiameter: number | null
  gardenWidth: number | null
  gardenColor: string | null
  onGardenFeatureNameChange: (name: string) => void
  onGardenColorChange: (color: string) => void
  onGardenDiameterChange: (diameter: number) => void
  onGardenWidthChange: (width: number) => void
  onShapeChange: (props: Partial<ShapeProperties>) => void
  onTextChange: (props: Partial<TextProperties>) => void
  onLineChange: (props: Partial<LineProperties>) => void
}

function ColorSwatch({
  color,
  onChange,
  label,
}: {
  color: string
  onChange: (color: string) => void
  label: string
}) {
  return (
    <Popover>
      <PopoverTrigger asChild>
        <button
          className="h-8 w-8 rounded-md border border-input shadow-sm"
          style={{ backgroundColor: color }}
          aria-label={label}
        />
      </PopoverTrigger>
      <PopoverContent className="w-auto p-3" side="left" align="start">
        <HexColorPicker color={color} onChange={onChange} />
      </PopoverContent>
    </Popover>
  )
}

export function PropertiesPanel({
  visible,
  mode,
  shapeProps,
  textProps,
  lineProps,
  activeGardenElement,
  gardenFeatureName,
  gardenDiameter,
  gardenWidth,
  gardenColor,
  onGardenFeatureNameChange,
  onGardenColorChange,
  onGardenDiameterChange,
  onGardenWidthChange,
  onShapeChange,
  onTextChange,
  onLineChange,
}: PropertiesPanelProps) {
  const gardenEl = activeGardenElement ? GARDEN_ELEMENTS[activeGardenElement] : null

  return (
    <div
      className={`fixed top-10 right-0 bottom-0 w-[280px] z-40 border-l bg-background transition-transform duration-200 ease-in-out ${
        visible ? "translate-x-0" : "translate-x-full"
      }`}
    >
      <div className="p-4 space-y-5 overflow-y-auto h-full">
        {mode === "garden" && gardenEl && (
          <>
            {/* Garden element header */}
            <div className="flex items-center gap-2">
              <span className="text-2xl">{gardenEl.emoji}</span>
              <h3 className="text-sm font-semibold">{gardenEl.label}</h3>
            </div>

            {/* Name field — shown whenever a garden feature is selected */}
            <div className="space-y-2">
              <Label className="text-xs text-muted-foreground">Navn</Label>
              <input
                type="text"
                value={gardenFeatureName ?? ""}
                onChange={(e) => onGardenFeatureNameChange(e.target.value)}
                placeholder="Gi elementet et navn..."
                className="w-full rounded-md border border-input bg-background px-3 py-1.5 text-sm shadow-sm placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring"
              />
            </div>
            <Separator />

            {/* Diameter slider for circle elements (tre, busk) */}
            {gardenDiameter !== null && gardenEl.drawMode === "circle" && (
              <>
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <Label className="text-xs text-muted-foreground">
                      Diameter
                    </Label>
                    <span className="text-xs text-muted-foreground font-mono">
                      {gardenDiameter.toFixed(1)} m
                    </span>
                  </div>
                  <Slider
                    value={[gardenDiameter]}
                    min={gardenEl.type === "busk" ? 0.3 : 0.5}
                    max={gardenEl.type === "busk" ? 5 : 20}
                    step={0.1}
                    onValueChange={([v]) => onGardenDiameterChange(v)}
                  />
                </div>
                <Separator />
              </>
            )}

            {/* Width slider for polyline elements (hekk, sti) */}
            {gardenWidth !== null && gardenEl.drawMode === "polyline" && (
              <>
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <Label className="text-xs text-muted-foreground">
                      Bredde
                    </Label>
                    <span className="text-xs text-muted-foreground font-mono">
                      {gardenWidth.toFixed(1)} m
                    </span>
                  </div>
                  <Slider
                    value={[gardenWidth]}
                    min={gardenEl.minWidth ?? 0.2}
                    max={gardenEl.maxWidth ?? 3}
                    step={0.1}
                    onValueChange={([v]) => onGardenWidthChange(v)}
                  />
                </div>
                <Separator />
              </>
            )}

            {/* Color picker */}
            <div className="space-y-4">
              <h3 className="text-sm font-semibold">Farge</h3>
              <div className="flex items-center gap-3">
                <Label className="w-12 text-xs text-muted-foreground">
                  Fyll
                </Label>
                <ColorSwatch
                  color={gardenColor ?? gardenEl.style.fillColor}
                  onChange={onGardenColorChange}
                  label="Fill color"
                />
                <span className="text-xs text-muted-foreground font-mono">
                  {gardenColor ?? gardenEl.style.fillColor}
                </span>
              </div>
            </div>
          </>
        )}

        {mode === "shape" && (
          <>
            <div>
              <h3 className="text-sm font-semibold mb-3">Zone</h3>
              <Select
                value={shapeProps.zone}
                onValueChange={(value) => onShapeChange({ zone: value })}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {ZONE_CATEGORIES.map((cat) => (
                    <SelectItem key={cat} value={cat}>
                      {cat}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <Separator />

            <div className="space-y-4">
              <h3 className="text-sm font-semibold">Fill</h3>

              <div className="flex items-center gap-3">
                <Label className="w-12 text-xs text-muted-foreground">
                  Color
                </Label>
                <ColorSwatch
                  color={shapeProps.fillColor}
                  onChange={(c) => onShapeChange({ fillColor: c })}
                  label="Fill color"
                />
                <span className="text-xs text-muted-foreground font-mono">
                  {shapeProps.fillColor}
                </span>
              </div>

              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <Label className="text-xs text-muted-foreground">
                    Opacity
                  </Label>
                  <span className="text-xs text-muted-foreground font-mono">
                    {Math.round(shapeProps.fillOpacity * 100)}%
                  </span>
                </div>
                <Slider
                  value={[shapeProps.fillOpacity]}
                  min={0}
                  max={1}
                  step={0.05}
                  onValueChange={([v]) => onShapeChange({ fillOpacity: v })}
                />
              </div>
            </div>

            <Separator />

            <div className="space-y-4">
              <h3 className="text-sm font-semibold">Stroke</h3>

              <div className="flex items-center gap-3">
                <Label className="w-12 text-xs text-muted-foreground">
                  Color
                </Label>
                <ColorSwatch
                  color={shapeProps.strokeColor}
                  onChange={(c) => onShapeChange({ strokeColor: c })}
                  label="Stroke color"
                />
                <span className="text-xs text-muted-foreground font-mono">
                  {shapeProps.strokeColor}
                </span>
              </div>

              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <Label className="text-xs text-muted-foreground">Width</Label>
                  <span className="text-xs text-muted-foreground font-mono">
                    {shapeProps.strokeWidth}px
                  </span>
                </div>
                <Slider
                  value={[shapeProps.strokeWidth]}
                  min={0}
                  max={8}
                  step={0.5}
                  onValueChange={([v]) => onShapeChange({ strokeWidth: v })}
                />
              </div>
            </div>
          </>
        )}

        {mode === "line" && (
          <>
            <div className="space-y-4">
              <h3 className="text-sm font-semibold">Stroke</h3>

              <div className="flex items-center gap-3">
                <Label className="w-12 text-xs text-muted-foreground">
                  Color
                </Label>
                <ColorSwatch
                  color={lineProps.strokeColor}
                  onChange={(c) => onLineChange({ strokeColor: c })}
                  label="Stroke color"
                />
                <span className="text-xs text-muted-foreground font-mono">
                  {lineProps.strokeColor}
                </span>
              </div>

              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <Label className="text-xs text-muted-foreground">Width</Label>
                  <span className="text-xs text-muted-foreground font-mono">
                    {lineProps.strokeWidth}px
                  </span>
                </div>
                <Slider
                  value={[lineProps.strokeWidth]}
                  min={0.5}
                  max={8}
                  step={0.5}
                  onValueChange={([v]) => onLineChange({ strokeWidth: v })}
                />
              </div>
            </div>

            <Separator />

            <div className="space-y-4">
              <h3 className="text-sm font-semibold">Arrows</h3>

              <div className="flex items-center justify-between">
                <Label className="text-xs text-muted-foreground">
                  Start arrow
                </Label>
                <Switch
                  checked={lineProps.startArrow}
                  onCheckedChange={(v: boolean) => onLineChange({ startArrow: v })}
                />
              </div>

              <div className="flex items-center justify-between">
                <Label className="text-xs text-muted-foreground">
                  End arrow
                </Label>
                <Switch
                  checked={lineProps.endArrow}
                  onCheckedChange={(v: boolean) => onLineChange({ endArrow: v })}
                />
              </div>
            </div>
          </>
        )}

        {mode === "text" && (
          <>
            <div className="space-y-4">
              <h3 className="text-sm font-semibold">Text</h3>

              <div className="flex items-center gap-3">
                <Label className="w-12 text-xs text-muted-foreground">
                  Color
                </Label>
                <ColorSwatch
                  color={textProps.textColor}
                  onChange={(c) => onTextChange({ textColor: c })}
                  label="Text color"
                />
                <span className="text-xs text-muted-foreground font-mono">
                  {textProps.textColor}
                </span>
              </div>

              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <Label className="text-xs text-muted-foreground">
                    Font size
                  </Label>
                  <span className="text-xs text-muted-foreground font-mono">
                    {textProps.fontSize}px
                  </span>
                </div>
                <Slider
                  value={[textProps.fontSize]}
                  min={8}
                  max={48}
                  step={1}
                  onValueChange={([v]) => onTextChange({ fontSize: v })}
                />
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  )
}
