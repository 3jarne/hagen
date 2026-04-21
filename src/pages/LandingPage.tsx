import { useState, type FormEvent } from "react"
import { Navigate } from "react-router-dom"
import { Mail, Sprout } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { useAuth } from "@/auth/useAuth"

export function LandingPage() {
  const { session, loading, signInWithMagicLink } = useAuth()
  const [email, setEmail] = useState("")
  const [status, setStatus] = useState<"idle" | "sending" | "sent" | "error">(
    "idle",
  )
  const [error, setError] = useState<string | null>(null)

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen text-sm text-muted-foreground">
        Laster…
      </div>
    )
  }

  if (session) {
    return <Navigate to="/prosjekter" replace />
  }

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault()
    if (!email) return
    setStatus("sending")
    setError(null)
    try {
      await signInWithMagicLink(email.trim())
      setStatus("sent")
    } catch (err) {
      setStatus("error")
      setError(err instanceof Error ? err.message : "Noe gikk galt")
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-background px-4">
      <div className="w-full max-w-sm space-y-6">
        <div className="flex items-center gap-2 justify-center">
          <Sprout className="h-6 w-6 text-emerald-600" />
          <h1 className="text-xl font-semibold">Hageplan</h1>
        </div>

        <p className="text-sm text-muted-foreground text-center">
          Tegn hageplanen din på satellittkart. Logg inn for å komme i gang.
        </p>

        {status === "sent" ? (
          <div className="rounded-md border bg-card p-4 text-sm space-y-1">
            <p className="font-medium">Sjekk eposten din</p>
            <p className="text-muted-foreground">
              Vi har sendt en innloggingslenke til{" "}
              <span className="font-mono">{email}</span>.
            </p>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-3">
            <div className="space-y-1.5">
              <Label htmlFor="email">Epost</Label>
              <Input
                id="email"
                type="email"
                required
                autoComplete="email"
                placeholder="navn@eksempel.no"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                disabled={status === "sending"}
              />
            </div>

            <Button
              type="submit"
              className="w-full"
              disabled={status === "sending" || !email}
            >
              <Mail className="h-4 w-4 mr-2" />
              {status === "sending" ? "Sender…" : "Logg inn"}
            </Button>

            <p className="text-xs text-muted-foreground text-center">
              Vi sender deg en innloggingslenke på epost.
            </p>

            {status === "error" && error && (
              <p className="text-xs text-destructive text-center">{error}</p>
            )}
          </form>
        )}
      </div>
    </div>
  )
}
