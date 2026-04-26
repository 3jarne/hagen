import { useEffect, useState } from "react"
import { Link, Navigate, useParams } from "react-router-dom"
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
import { MapShareView } from "@/components/MapShareView"
import { getProjectByShareId, type Project } from "@/lib/projects"
import { loadDrawing, type DrawingData } from "@/lib/drawings"
import type { MapStyle } from "@/pages/MapPage"

export function SharePage() {
  const { shareId } = useParams<{ shareId: string }>()
  const [project, setProject] = useState<Project | null | "notfound">(null)
  const [drawings, setDrawings] = useState<DrawingData | null>(null)

  useEffect(() => {
    if (!shareId) return
    let active = true
    ;(async () => {
      try {
        const p = await getProjectByShareId(shareId)
        if (!active) return
        if (!p) {
          setProject("notfound")
          return
        }
        const d = await loadDrawing(p.id)
        if (!active) return
        setProject(p)
        setDrawings(d)
      } catch {
        if (!active) return
        setProject("notfound")
      }
    })()
    return () => {
      active = false
    }
  }, [shareId])

  if (!shareId) return <Navigate to="/" replace />

  if (project === "notfound") {
    return (
      <div className="min-h-screen flex items-center justify-center p-4">
        <div className="text-center space-y-4 max-w-md">
          <h1 className="text-lg font-semibold">
            Denne hageplanen er ikke tilgjengelig
          </h1>
          <p className="text-sm text-muted-foreground">
            Lenken er ugyldig, eller eieren har slått av deling.
          </p>
          <Button asChild>
            <Link to="/">Lag din egen hageplan</Link>
          </Button>
        </div>
      </div>
    )
  }

  if (!project || !drawings) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" />
          Laster hageplan…
        </div>
      </div>
    )
  }

  return <SharedMap project={project} drawings={drawings} />
}

interface SharedMapProps {
  project: Project
  drawings: DrawingData
}

function SharedMap({ project, drawings }: SharedMapProps) {
  const [mapStyle, setMapStyle] = useState<MapStyle>("satellite")
  const [kartverketVisible, setKartverketVisible] = useState(false)
  const [kartverketOpacity, setKartverketOpacity] = useState(0.4)

  return (
    <div className="h-screen w-screen overflow-hidden relative">
      {/* Minimal topbar: address + CTA */}
      <div className="fixed top-0 left-0 right-0 z-50 flex items-center h-10 border-b bg-background px-3">
        <span
          className="text-sm font-medium truncate max-w-[40ch]"
          title={project.address}
        >
          {project.address}
        </span>
        <div className="flex-1" />
        <Button asChild size="sm" variant="default">
          <Link to="/">Lag din egen hageplan</Link>
        </Button>
      </div>

      <MapShareView
        projectCenter={[project.center_lng, project.center_lat]}
        projectZoom={project.zoom}
        projectGnr={project.gnr}
        projectBnr={project.bnr}
        drawings={drawings}
        mapStyle={mapStyle}
        kartverketVisible={kartverketVisible}
        kartverketOpacity={kartverketOpacity}
      />

      {/* Floating view-popover */}
      <div className="fixed top-12 right-3 z-40">
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
                onValueChange={(v) => v && setMapStyle(v as MapStyle)}
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
                <Switch
                  checked={kartverketVisible}
                  onCheckedChange={setKartverketVisible}
                />
              </div>
              {kartverketVisible && (
                <div>
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-xs text-muted-foreground">
                      Opacity
                    </span>
                    <span className="text-xs text-muted-foreground font-mono">
                      {Math.round(kartverketOpacity * 100)}%
                    </span>
                  </div>
                  <Slider
                    value={[kartverketOpacity]}
                    min={0.1}
                    max={1}
                    step={0.05}
                    onValueChange={([v]) => setKartverketOpacity(v)}
                  />
                </div>
              )}
            </div>
          </PopoverContent>
        </Popover>
      </div>
    </div>
  )
}
