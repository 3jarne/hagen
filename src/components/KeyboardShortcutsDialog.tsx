import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"

interface KeyboardShortcutsDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
}

const shortcuts = [
  { category: "Tools", items: [
    { keys: ["V"], description: "Select tool" },
    { keys: ["P"], description: "Polygon tool" },
    { keys: ["R"], description: "Rectangle tool" },
    { keys: ["C"], description: "Circle tool" },
    { keys: ["T"], description: "Text tool" },
    { keys: ["L"], description: "Line / Pen tool" },
    { keys: ["M"], description: "Measure tool" },
  ]},
  { category: "Edit", items: [
    { keys: ["⌘", "Z"], description: "Undo" },
    { keys: ["⌘", "⇧", "Z"], description: "Redo" },
    { keys: ["Del"], description: "Delete selected" },
    { keys: ["Esc"], description: "Cancel / deselect" },
  ]},
  { category: "Text & Lines", items: [
    { keys: ["Enter"], description: "Confirm text / finish line" },
    { keys: ["Esc"], description: "Cancel text / line / measure" },
    { keys: ["Double-click"], description: "Edit text / finish line" },
  ]},
]

export function KeyboardShortcutsDialog({
  open,
  onOpenChange,
}: KeyboardShortcutsDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>Keyboard Shortcuts</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          {shortcuts.map((group) => (
            <div key={group.category}>
              <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">
                {group.category}
              </h4>
              <div className="space-y-1.5">
                {group.items.map((shortcut) => (
                  <div
                    key={shortcut.description}
                    className="flex items-center justify-between text-sm"
                  >
                    <span>{shortcut.description}</span>
                    <div className="flex gap-1">
                      {shortcut.keys.map((key) => (
                        <kbd
                          key={key}
                          className="inline-flex h-5 min-w-[20px] items-center justify-center rounded border bg-muted px-1 text-[10px] font-medium text-muted-foreground"
                        >
                          {key}
                        </kbd>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      </DialogContent>
    </Dialog>
  )
}
