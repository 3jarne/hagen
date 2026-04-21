import { useState } from "react"
import { MousePointer2, Square, Circle, Type, Pen, Ruler, ChevronDown } from "lucide-react"
import { Separator } from "@/components/ui/separator"
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
  TooltipProvider,
} from "@/components/ui/tooltip"
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover"
import { cn } from "@/lib/utils"
import {
  GARDEN_CATEGORIES,
  type GardenElementType,
  type GardenCategoryDef,
} from "@/lib/garden-types"

export type Tool = "select" | "polygon" | "rectangle" | "circle" | "polyline" | "text" | "line" | "measure"
export type ToolbarMode = "garden" | "raw"

const rawTools: { value: Tool; icon: (active: boolean) => React.ReactNode; label: string; shortcut: string }[] = [
  { value: "select", icon: (a) => <MousePointer2 className={cn("h-5 w-5", a && "stroke-[2.5]")} />, label: "Select / Move", shortcut: "V" },
  { value: "polygon", icon: (a) => (
    <svg className={cn("h-5 w-5", a && "stroke-[2.5]")} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={a ? 2.5 : 2} strokeLinecap="round" strokeLinejoin="round">
      <path d="M9 3 L19 6 L21 15 L14 21 L4 17 Z" />
    </svg>
  ), label: "Shape", shortcut: "P" },
  { value: "rectangle", icon: (a) => <Square className={cn("h-5 w-5", a && "stroke-[2.5]")} />, label: "Rectangle", shortcut: "R" },
  { value: "circle", icon: (a) => <Circle className={cn("h-5 w-5", a && "stroke-[2.5]")} />, label: "Circle", shortcut: "C" },
  { value: "text", icon: (a) => <Type className={cn("h-5 w-5", a && "stroke-[2.5]")} />, label: "Text label", shortcut: "T" },
  { value: "line", icon: (a) => <Pen className={cn("h-5 w-5", a && "stroke-[2.5]")} />, label: "Line / Pen", shortcut: "L" },
  { value: "measure", icon: (a) => <Ruler className={cn("h-5 w-5", a && "stroke-[2.5]")} />, label: "Measure", shortcut: "M" },
]

function ToolButton({
  icon,
  label,
  shortcut,
  isActive,
  onClick,
}: {
  icon: React.ReactNode
  label: string
  shortcut?: string
  isActive: boolean
  onClick: () => void
}) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <button
          onClick={onClick}
          aria-label={label}
          className={cn(
            "h-10 w-10 flex items-center justify-center rounded-full transition-colors",
            isActive
              ? "bg-primary text-primary-foreground shadow-sm"
              : "text-muted-foreground hover:bg-accent hover:text-accent-foreground"
          )}
        >
          {icon}
        </button>
      </TooltipTrigger>
      <TooltipContent side="top">
        <p>{label}{shortcut ? ` (${shortcut})` : ""}</p>
      </TooltipContent>
    </Tooltip>
  )
}

function CategoryButton({
  category,
  activeElement,
  onSelectElement,
}: {
  category: GardenCategoryDef
  activeElement: GardenElementType | null
  onSelectElement: (type: GardenElementType) => void
}) {
  const [open, setOpen] = useState(false)

  // Check if the active element belongs to this category
  const activeInCategory = activeElement
    ? category.elements.find((e) => e.type === activeElement)
    : null

  const TriggerIcon = activeInCategory ? activeInCategory.icon : category.icon

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <Tooltip>
        <TooltipTrigger asChild>
          <PopoverTrigger asChild>
            <button
              aria-label={category.label}
              className={cn(
                "h-10 flex items-center gap-1 px-2.5 rounded-full transition-colors text-sm",
                activeInCategory
                  ? "bg-primary text-primary-foreground shadow-sm"
                  : "text-muted-foreground hover:bg-accent hover:text-accent-foreground"
              )}
            >
              <TriggerIcon className="h-5 w-5" />
              {activeInCategory && <span>{activeInCategory.label}</span>}
              <ChevronDown className="h-3 w-3 opacity-60" />
            </button>
          </PopoverTrigger>
        </TooltipTrigger>
        <TooltipContent side="top">
          <p>{activeInCategory ? activeInCategory.label : category.label}</p>
        </TooltipContent>
      </Tooltip>
      <PopoverContent
        className="w-auto p-1"
        side="top"
        align="center"
        sideOffset={8}
      >
        <div className="flex flex-col gap-0.5">
          {category.elements.map((element) => {
            const ElementIcon = element.icon
            return (
              <button
                key={element.type}
                onClick={() => {
                  onSelectElement(element.type)
                  setOpen(false)
                }}
                className={cn(
                  "flex items-center gap-2 px-3 py-1.5 rounded-md text-sm whitespace-nowrap transition-colors",
                  activeElement === element.type
                    ? "bg-primary text-primary-foreground"
                    : "hover:bg-accent hover:text-accent-foreground"
                )}
              >
                <ElementIcon className="h-4 w-4" />
                <span>{element.label}</span>
              </button>
            )
          })}
        </div>
      </PopoverContent>
    </Popover>
  )
}

function ModeToggle({
  mode,
  onModeChange,
}: {
  mode: ToolbarMode
  onModeChange: (mode: ToolbarMode) => void
}) {
  return (
    <div className="flex items-center gap-0.5 rounded-full bg-muted p-0.5">
      <button
        onClick={() => onModeChange("garden")}
        className={cn(
          "px-2.5 py-1 rounded-full text-xs font-medium transition-colors",
          mode === "garden"
            ? "bg-background text-foreground shadow-sm"
            : "text-muted-foreground hover:text-foreground"
        )}
      >
        Hage
      </button>
      <button
        onClick={() => onModeChange("raw")}
        className={cn(
          "px-2.5 py-1 rounded-full text-xs font-medium transition-colors",
          mode === "raw"
            ? "bg-background text-foreground shadow-sm"
            : "text-muted-foreground hover:text-foreground"
        )}
      >
        Rå
      </button>
    </div>
  )
}

interface FloatingToolbarProps {
  activeTool: Tool
  onToolChange: (tool: Tool) => void
  toolbarMode: ToolbarMode
  onToolbarModeChange: (mode: ToolbarMode) => void
  activeGardenElement: GardenElementType | null
  onGardenElementChange: (type: GardenElementType) => void
}

export function FloatingToolbar({
  activeTool,
  onToolChange,
  toolbarMode,
  onToolbarModeChange,
  activeGardenElement,
  onGardenElementChange,
}: FloatingToolbarProps) {
  return (
    <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-40">
      <TooltipProvider delayDuration={300}>
        <div className="flex items-center gap-1 rounded-full border-2 bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/80 px-3 py-1.5 shadow-lg">
          {/* Select tool — always visible */}
          <ToolButton
            icon={<MousePointer2 className={cn("h-5 w-5", activeTool === "select" && "stroke-[2.5]")} />}
            label="Select / Move"
            shortcut="V"
            isActive={activeTool === "select"}
            onClick={() => onToolChange("select")}
          />

          <Separator orientation="vertical" className="mx-1.5 h-6" />

          {toolbarMode === "garden" ? (
            <>
              {/* Garden category buttons */}
              {GARDEN_CATEGORIES.map((cat) => (
                <CategoryButton
                  key={cat.id}
                  category={cat}
                  activeElement={activeGardenElement}
                  onSelectElement={onGardenElementChange}
                />
              ))}

              <Separator orientation="vertical" className="mx-1.5 h-6" />

              {/* Text and Measure in garden mode */}
              <ToolButton
                icon={<Type className={cn("h-5 w-5", activeTool === "text" && "stroke-[2.5]")} />}
                label="Text label"
                shortcut="T"
                isActive={activeTool === "text"}
                onClick={() => onToolChange("text")}
              />
              <ToolButton
                icon={<Ruler className={cn("h-5 w-5", activeTool === "measure" && "stroke-[2.5]")} />}
                label="Measure"
                shortcut="M"
                isActive={activeTool === "measure"}
                onClick={() => onToolChange("measure")}
              />
            </>
          ) : (
            <>
              {/* Raw mode — identical to v1 */}
              {rawTools.slice(1, 4).map((tool) => (
                <ToolButton
                  key={tool.value}
                  icon={tool.icon(activeTool === tool.value)}
                  label={tool.label}
                  shortcut={tool.shortcut}
                  isActive={activeTool === tool.value}
                  onClick={() => onToolChange(tool.value)}
                />
              ))}

              <Separator orientation="vertical" className="mx-1.5 h-6" />

              <ToolButton
                icon={rawTools[4].icon(activeTool === "text")}
                label={rawTools[4].label}
                shortcut={rawTools[4].shortcut}
                isActive={activeTool === "text"}
                onClick={() => onToolChange("text")}
              />
              <ToolButton
                icon={rawTools[5].icon(activeTool === "line")}
                label={rawTools[5].label}
                shortcut={rawTools[5].shortcut}
                isActive={activeTool === "line"}
                onClick={() => onToolChange("line")}
              />

              <Separator orientation="vertical" className="mx-1.5 h-6" />

              <ToolButton
                icon={rawTools[6].icon(activeTool === "measure")}
                label={rawTools[6].label}
                shortcut={rawTools[6].shortcut}
                isActive={activeTool === "measure"}
                onClick={() => onToolChange("measure")}
              />
            </>
          )}

          {/* Mode toggle separator and toggle */}
          <Separator orientation="vertical" className="mx-1.5 h-6" />
          <ModeToggle mode={toolbarMode} onModeChange={onToolbarModeChange} />
        </div>
      </TooltipProvider>
    </div>
  )
}
