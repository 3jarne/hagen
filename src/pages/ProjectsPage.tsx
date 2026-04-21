import { LogOut, Sprout } from "lucide-react"
import { Button } from "@/components/ui/button"
import { useAuth } from "@/auth/useAuth"

export function ProjectsPage() {
  const { user, signOut } = useAuth()

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

      <main className="max-w-5xl mx-auto px-4 py-10">
        <h2 className="text-lg font-semibold mb-2">Dine hageplaner</h2>
        <p className="text-sm text-muted-foreground">
          Prosjektliste kommer i Fase 2.
        </p>
      </main>
    </div>
  )
}
