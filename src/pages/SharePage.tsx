import { useEffect, useState } from "react"
import { Link, Navigate, useParams } from "react-router-dom"
import { Loader2 } from "lucide-react"
import { Button } from "@/components/ui/button"
import { MapShareView } from "@/components/MapShareView"
import { ViewControlsPopover } from "@/components/ViewControlsPopover"
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
  const [kartverketLoading, setKartverketLoading] = useState(false)

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
        onKartverketLoadingChange={setKartverketLoading}
      />

      <div className="fixed top-12 right-3 z-40">
        <ViewControlsPopover
          mapStyle={mapStyle}
          onMapStyleChange={setMapStyle}
          kartverketVisible={kartverketVisible}
          onKartverketVisibleChange={setKartverketVisible}
          kartverketOpacity={kartverketOpacity}
          onKartverketOpacityChange={setKartverketOpacity}
          kartverketLoading={kartverketLoading}
        />
      </div>
    </div>
  )
}
