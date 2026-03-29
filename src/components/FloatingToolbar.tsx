import { useState } from "react"
import { MousePointer2, Pentagon, Square, Circle, Type } from "lucide-react"
import { Separator } from "@/components/ui/separator"
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
  TooltipProvider,
} from "@/components/ui/tooltip"
import { cn } from "@/lib/utils"

export type Tool = "select" | "polygon" | "rectangle" | "circle" | "text"

const tools: { value: Tool; icon: (active: boolean) => React.ReactNode; label: string; shortcut: string }[] = [
  { value: "select", icon: (a) => <MousePointer2 className={cn("h-5 w-5", a && "stroke-[2.5]")} />, label: "Select / Move", shortcut: "V" },
  { value: "polygon", icon: (a) => <Pentagon className={cn("h-5 w-5", a && "stroke-[2.5]")} />, label: "Polygon", shortcut: "P" },
  { value: "rectangle", icon: (a) => <Square className={cn("h-5 w-5", a && "stroke-[2.5]")} />, label: "Rectangle", shortcut: "R" },
  { value: "circle", icon: (a) => <Circle className={cn("h-5 w-5", a && "stroke-[2.5]")} />, label: "Circle", shortcut: "C" },
  { value: "text", icon: (a) => <Type className={cn("h-5 w-5", a && "stroke-[2.5]")} />, label: "Text label", shortcut: "T" },
]

function ToolButton({
  tool,
  isActive,
  onClick,
}: {
  tool: (typeof tools)[number]
  isActive: boolean
  onClick: () => void
}) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <button
          onClick={onClick}
          aria-label={tool.label}
          className={cn(
            "h-10 w-10 flex items-center justify-center rounded-full transition-colors",
            isActive
              ? "bg-primary text-primary-foreground shadow-sm"
              : "text-muted-foreground hover:bg-accent hover:text-accent-foreground"
          )}
        >
          {tool.icon(isActive)}
        </button>
      </TooltipTrigger>
      <TooltipContent side="top">
        <p>{tool.label} ({tool.shortcut})</p>
      </TooltipContent>
    </Tooltip>
  )
}

export function FloatingToolbar() {
  const [activeTool, setActiveTool] = useState<Tool>("select")

  return (
    <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-40">
      <TooltipProvider delayDuration={300}>
        <div className="flex items-center gap-1 rounded-full border-2 bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/80 px-3 py-1.5 shadow-lg">
          {/* Select tool */}
          <ToolButton
            tool={tools[0]}
            isActive={activeTool === "select"}
            onClick={() => setActiveTool("select")}
          />

          <Separator orientation="vertical" className="mx-1.5 h-6" />

          {/* Drawing tools */}
          {tools.slice(1, 4).map((tool) => (
            <ToolButton
              key={tool.value}
              tool={tool}
              isActive={activeTool === tool.value}
              onClick={() => setActiveTool(tool.value)}
            />
          ))}

          <Separator orientation="vertical" className="mx-1.5 h-6" />

          {/* Text tool */}
          <ToolButton
            tool={tools[4]}
            isActive={activeTool === "text"}
            onClick={() => setActiveTool("text")}
          />
        </div>
      </TooltipProvider>
    </div>
  )
}
