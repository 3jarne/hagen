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
import type { ShapeProperties, TextProperties } from "@/lib/zone-defaults"
import { ZONE_CATEGORIES } from "@/lib/zone-defaults"

interface PropertiesPanelProps {
  visible: boolean
  mode: "shape" | "text" | "none"
  shapeProps: ShapeProperties
  textProps: TextProperties
  onShapeChange: (props: Partial<ShapeProperties>) => void
  onTextChange: (props: Partial<TextProperties>) => void
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
  onShapeChange,
  onTextChange,
}: PropertiesPanelProps) {
  return (
    <div
      className={`fixed top-10 right-0 bottom-0 w-[280px] z-40 border-l bg-background transition-transform duration-200 ease-in-out ${
        visible ? "translate-x-0" : "translate-x-full"
      }`}
    >
      <div className="p-4 space-y-5 overflow-y-auto h-full">
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
