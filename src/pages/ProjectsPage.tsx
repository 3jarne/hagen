import { useEffect, useState } from "react"
import { Link, useNavigate } from "react-router-dom"
import {
  LogOut,
  Sprout,
  Plus,
  Trash2,
  MapPin,
  Loader2,
  AlertCircle,
} from "lucide-react"
import { Button } from "@/components/ui/button"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog"
import { CreateProjectDialog } from "@/components/CreateProjectDialog"
import { useAuth } from "@/auth/useAuth"
import {
  deleteProject,
  listProjects,
  type Project,
} from "@/lib/projects"

function formatUpdated(iso: string): string {
  const d = new Date(iso)
  return d.toLocaleString("nb-NO", {
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  })
}

export function ProjectsPage() {
  const { user, signOut } = useAuth()
  const navigate = useNavigate()

  const [projects, setProjects] = useState<Project[] | null>(null)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [createOpen, setCreateOpen] = useState(false)
  const [pendingDelete, setPendingDelete] = useState<Project | null>(null)
  const [deleting, setDeleting] = useState(false)
  const [deleteError, setDeleteError] = useState<string | null>(null)

  useEffect(() => {
    let active = true
    listProjects()
      .then((rows) => {
        if (active) setProjects(rows)
      })
      .catch((err: unknown) => {
        if (!active) return
        setLoadError(
          err instanceof Error ? err.message : "Kunne ikke hente prosjekter",
        )
        setProjects([])
      })
    return () => {
      active = false
    }
  }, [])

  const handleCreated = (project: Project) => {
    setCreateOpen(false)
    navigate(`/prosjekt/${project.id}`)
  }

  const handleConfirmDelete = async () => {
    if (!pendingDelete) return
    setDeleting(true)
    setDeleteError(null)
    try {
      await deleteProject(pendingDelete.id)
      setProjects((prev) =>
        prev ? prev.filter((p) => p.id !== pendingDelete.id) : prev,
      )
      setPendingDelete(null)
    } catch (err) {
      setDeleteError(
        err instanceof Error ? err.message : "Kunne ikke slette",
      )
    } finally {
      setDeleting(false)
    }
  }

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b">
        <div className="max-w-5xl mx-auto px-4 h-14 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Sprout className="h-5 w-5 text-emerald-600" />
            <h1 className="text-sm font-semibold">Hageplan</h1>
          </div>
          <div className="flex items-center gap-3">
            <span className="text-xs text-muted-foreground hidden sm:inline">
              {user?.email}
            </span>
            <Button variant="ghost" size="sm" onClick={() => signOut()}>
              <LogOut className="h-4 w-4 mr-1.5" />
              Logg ut
            </Button>
          </div>
        </div>
      </header>

      <main className="max-w-5xl mx-auto px-4 py-8 space-y-6">
        <div className="flex items-center justify-between gap-4">
          <h2 className="text-lg font-semibold">Dine hageplaner</h2>
          <Button onClick={() => setCreateOpen(true)}>
            <Plus className="h-4 w-4 mr-1.5" />
            Opprett ny hageplan
          </Button>
        </div>

        {loadError && (
          <div className="rounded-md border border-destructive/50 bg-destructive/5 p-3 text-sm flex items-start gap-2">
            <AlertCircle className="h-4 w-4 mt-0.5 text-destructive shrink-0" />
            <div>
              <p className="font-medium">Kunne ikke hente prosjekter</p>
              <p className="text-muted-foreground text-xs">{loadError}</p>
            </div>
          </div>
        )}

        {projects === null ? (
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" />
            Laster prosjekter…
          </div>
        ) : projects.length === 0 ? (
          <Card>
            <CardContent className="pt-6 text-center space-y-3">
              <p className="text-sm text-muted-foreground">
                Du har ingen hageplaner enda. Opprett din første!
              </p>
              <Button onClick={() => setCreateOpen(true)}>
                <Plus className="h-4 w-4 mr-1.5" />
                Opprett ny hageplan
              </Button>
            </CardContent>
          </Card>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {projects.map((p) => (
              <Card key={p.id} className="relative group">
                <Link
                  to={`/prosjekt/${p.id}`}
                  className="block focus:outline-none focus-visible:ring-2 focus-visible:ring-ring rounded-lg"
                >
                  <CardHeader className="pr-12">
                    <CardTitle className="flex items-start gap-2">
                      <MapPin className="h-4 w-4 text-emerald-600 mt-0.5 shrink-0" />
                      <span className="break-words">{p.address}</span>
                    </CardTitle>
                    <CardDescription>
                      Sist redigert {formatUpdated(p.updated_at)}
                    </CardDescription>
                  </CardHeader>
                </Link>
                <Button
                  variant="ghost"
                  size="icon"
                  aria-label="Slett hageplan"
                  className="absolute top-3 right-3 h-8 w-8 text-muted-foreground hover:text-destructive"
                  onClick={(e) => {
                    e.preventDefault()
                    e.stopPropagation()
                    setPendingDelete(p)
                    setDeleteError(null)
                  }}
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
              </Card>
            ))}
          </div>
        )}
      </main>

      <CreateProjectDialog
        open={createOpen}
        onOpenChange={setCreateOpen}
        onCreated={handleCreated}
      />

      <AlertDialog
        open={pendingDelete !== null}
        onOpenChange={(open) => {
          if (!open && !deleting) {
            setPendingDelete(null)
            setDeleteError(null)
          }
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Er du sikker?</AlertDialogTitle>
            <AlertDialogDescription>
              {pendingDelete
                ? `Hageplanen for «${pendingDelete.address}» slettes for godt. Dette kan ikke angres.`
                : "Dette kan ikke angres."}
            </AlertDialogDescription>
          </AlertDialogHeader>
          {deleteError && (
            <p className="text-xs text-destructive">{deleteError}</p>
          )}
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleting}>Avbryt</AlertDialogCancel>
            <AlertDialogAction
              onClick={(e) => {
                e.preventDefault()
                handleConfirmDelete()
              }}
              disabled={deleting}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {deleting ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Sletter…
                </>
              ) : (
                "Slett"
              )}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
