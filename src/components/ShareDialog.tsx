import { useEffect, useState } from "react"
import { Check, Copy, Loader2, Share2 } from "lucide-react"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import {
  buildShareUrl,
  disableSharing,
  enableSharing,
} from "@/lib/projects"
import { CONFIG } from "@/config"

interface ShareDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  projectId: string
  projectCenter: [number, number]
  sharingEnabled: boolean
  shareId: string | null
  onShareStateChange: (next: {
    sharing_enabled: boolean
    share_id: string | null
  }) => void
}

export function ShareDialog({
  open,
  onOpenChange,
  projectId,
  projectCenter,
  sharingEnabled,
  shareId,
  onShareStateChange,
}: ShareDialogProps) {
  const [busy, setBusy] = useState(false)
  const [copied, setCopied] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!copied) return
    const timer = setTimeout(() => setCopied(false), 1800)
    return () => clearTimeout(timer)
  }, [copied])

  useEffect(() => {
    if (!open) {
      setError(null)
      setCopied(false)
    }
  }, [open])

  const handleEnable = async () => {
    setBusy(true)
    setError(null)
    try {
      const { share_id } = await enableSharing(projectId, shareId)
      onShareStateChange({ sharing_enabled: true, share_id })
    } catch (e) {
      setError(e instanceof Error ? e.message : "Kunne ikke slå på deling")
    } finally {
      setBusy(false)
    }
  }

  const handleDisable = async () => {
    setBusy(true)
    setError(null)
    try {
      await disableSharing(projectId)
      onShareStateChange({ sharing_enabled: false, share_id: shareId })
    } catch (e) {
      setError(e instanceof Error ? e.message : "Kunne ikke slå av deling")
    } finally {
      setBusy(false)
    }
  }

  const url = sharingEnabled && shareId ? buildShareUrl(shareId) : ""

  const handleCopy = async () => {
    if (!url) return
    try {
      await navigator.clipboard.writeText(url)
      setCopied(true)
    } catch {
      setError("Kunne ikke kopiere — kopier manuelt")
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Del hageplanen</DialogTitle>
          <DialogDescription>
            {sharingEnabled
              ? "Hvem som helst med lenken kan se hageplanen — uten å logge inn."
              : "Slå på deling for å lage en lenke andre kan åpne uten å logge inn."}
          </DialogDescription>
        </DialogHeader>

        {!sharingEnabled && (
          <div className="space-y-4">
            <Button
              size="lg"
              className="w-full"
              onClick={handleEnable}
              disabled={busy}
            >
              {busy ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Share2 className="h-4 w-4" />
              )}
              Slå på deling
            </Button>
          </div>
        )}

        {sharingEnabled && shareId && (
          <div className="space-y-4">
            <SharePreview center={projectCenter} />
            <div className="flex items-center gap-2">
              <Input readOnly value={url} className="font-mono text-xs" />
              <Button
                variant="outline"
                size="icon"
                onClick={handleCopy}
                aria-label="Kopier lenke"
                title="Kopier lenke"
              >
                {copied ? (
                  <Check className="h-4 w-4" />
                ) : (
                  <Copy className="h-4 w-4" />
                )}
              </Button>
            </div>
            <Button
              variant="secondary"
              className="w-full"
              onClick={handleDisable}
              disabled={busy}
            >
              {busy && <Loader2 className="h-4 w-4 animate-spin" />}
              Slå av deling
            </Button>
          </div>
        )}

        {error && (
          <p className="text-xs text-destructive" role="alert">
            {error}
          </p>
        )}
      </DialogContent>
    </Dialog>
  )
}

function SharePreview({ center }: { center: [number, number] }) {
  if (!CONFIG.mapboxToken) {
    return (
      <div className="rounded-md border bg-muted h-32 flex items-center justify-center text-xs text-muted-foreground">
        Forhåndsvisning utilgjengelig
      </div>
    )
  }
  const [lng, lat] = center
  const url =
    `https://api.mapbox.com/styles/v1/mapbox/satellite-v9/static/` +
    `${lng},${lat},15.5,0/600x240@2x` +
    `?access_token=${CONFIG.mapboxToken}&attribution=false&logo=false`
  return (
    <img
      src={url}
      alt="Forhåndsvisning av delt visning"
      className="rounded-md border w-full h-32 object-cover"
      loading="lazy"
    />
  )
}
