import { Undo2, Redo2, Search } from "lucide-react"
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
  MenubarRadioGroup,
  MenubarRadioItem,
} from "@/components/ui/menubar"

interface TopBarProps {
  zoomLevel: number
}

export function TopBar({ zoomLevel }: TopBarProps) {
  return (
    <div className="fixed top-0 left-0 right-0 z-50 flex items-center h-10 border-b bg-background">
      <Menubar className="border-none rounded-none h-full shadow-none">
        <MenubarMenu>
          <MenubarTrigger>File</MenubarTrigger>
          <MenubarContent>
            <MenubarItem disabled>Export JSON</MenubarItem>
            <MenubarItem disabled>Export PNG</MenubarItem>
          </MenubarContent>
        </MenubarMenu>

        <MenubarMenu>
          <MenubarTrigger>Edit</MenubarTrigger>
          <MenubarContent>
            <MenubarItem disabled>
              Undo <MenubarShortcut>⌘Z</MenubarShortcut>
            </MenubarItem>
            <MenubarItem disabled>
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
            <MenubarRadioGroup value="satellite">
              <MenubarRadioItem value="satellite" disabled>
                Satellite
              </MenubarRadioItem>
              <MenubarRadioItem value="street" disabled>
                Street
              </MenubarRadioItem>
              <MenubarRadioItem value="terrain" disabled>
                Terrain
              </MenubarRadioItem>
            </MenubarRadioGroup>
            <MenubarSeparator />
            <MenubarCheckboxItem checked disabled>
              Kartverket overlay
            </MenubarCheckboxItem>
            <MenubarSeparator />
            <MenubarItem disabled>Zoom In</MenubarItem>
            <MenubarItem disabled>Zoom Out</MenubarItem>
            <MenubarItem disabled>Reset to property view</MenubarItem>
          </MenubarContent>
        </MenubarMenu>

        <MenubarMenu>
          <MenubarTrigger>Help</MenubarTrigger>
          <MenubarContent>
            <MenubarItem disabled>Keyboard shortcuts</MenubarItem>
          </MenubarContent>
        </MenubarMenu>
      </Menubar>

      {/* Undo/Redo buttons */}
      <div className="flex items-center gap-0.5 ml-1">
        <Button variant="ghost" size="icon" className="h-8 w-8" disabled>
          <Undo2 className="h-4 w-4" />
        </Button>
        <Button variant="ghost" size="icon" className="h-8 w-8" disabled>
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
      <div className="pr-3 text-xs text-muted-foreground font-mono whitespace-nowrap">
        z{Math.round(zoomLevel)}
      </div>
    </div>
  )
}
