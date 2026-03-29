import { useState } from "react"
import { MousePointer2, Pentagon, Square, Circle, Type } from "lucide-react"
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group"
import { Separator } from "@/components/ui/separator"
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
  TooltipProvider,
} from "@/components/ui/tooltip"

export type Tool = "select" | "polygon" | "rectangle" | "circle" | "text"

const tools: { value: Tool; icon: React.ReactNode; label: string; shortcut: string }[] = [
  { value: "select", icon: <MousePointer2 className="h-4 w-4" />, label: "Select / Move", shortcut: "V" },
  { value: "polygon", icon: <Pentagon className="h-4 w-4" />, label: "Polygon", shortcut: "P" },
  { value: "rectangle", icon: <Square className="h-4 w-4" />, label: "Rectangle", shortcut: "R" },
  { value: "circle", icon: <Circle className="h-4 w-4" />, label: "Circle", shortcut: "C" },
  { value: "text", icon: <Type className="h-4 w-4" />, label: "Text label", shortcut: "T" },
]

export function FloatingToolbar() {
  const [activeTool, setActiveTool] = useState<Tool>("select")

  return (
    <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-40">
      <TooltipProvider delayDuration={300}>
        <div className="flex items-center gap-0.5 rounded-full border bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/80 px-2 py-1 shadow-lg">
          <ToggleGroup
            type="single"
            value={activeTool}
            onValueChange={(value) => {
              if (value) setActiveTool(value as Tool)
            }}
            className="gap-0.5"
          >
            {/* Select tool */}
            <Tooltip>
              <TooltipTrigger asChild>
                <ToggleGroupItem
                  value="select"
                  aria-label="Select / Move"
                  className="h-8 w-8 rounded-full"
                >
                  {tools[0].icon}
                </ToggleGroupItem>
              </TooltipTrigger>
              <TooltipContent side="top">
                <p>Select / Move (V)</p>
              </TooltipContent>
            </Tooltip>

            <Separator orientation="vertical" className="mx-1 h-5" />

            {/* Drawing tools */}
            {tools.slice(1, 4).map((tool) => (
              <Tooltip key={tool.value}>
                <TooltipTrigger asChild>
                  <ToggleGroupItem
                    value={tool.value}
                    aria-label={tool.label}
                    className="h-8 w-8 rounded-full"
                  >
                    {tool.icon}
                  </ToggleGroupItem>
                </TooltipTrigger>
                <TooltipContent side="top">
                  <p>{tool.label} ({tool.shortcut})</p>
                </TooltipContent>
              </Tooltip>
            ))}

            <Separator orientation="vertical" className="mx-1 h-5" />

            {/* Text tool */}
            <Tooltip>
              <TooltipTrigger asChild>
                <ToggleGroupItem
                  value="text"
                  aria-label="Text label"
                  className="h-8 w-8 rounded-full"
                >
                  {tools[4].icon}
                </ToggleGroupItem>
              </TooltipTrigger>
              <TooltipContent side="top">
                <p>Text label (T)</p>
              </TooltipContent>
            </Tooltip>
          </ToggleGroup>
        </div>
      </TooltipProvider>
    </div>
  )
}
