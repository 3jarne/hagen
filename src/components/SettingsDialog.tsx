import { useState, useEffect } from "react"
import { Settings } from "lucide-react"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog"

const STORAGE_KEY = "hageplan_settings"

export interface HageplanSettings {
  mapboxToken: string
  lat: number
  lng: number
  gnr: number
  bnr: number
}

const DEFAULTS: HageplanSettings = {
  mapboxToken: "",
  lat: 60.3723,
  lng: 11.0701,
  gnr: 0,
  bnr: 0,
}

export function loadSettings(): HageplanSettings {
  try {
    const stored = localStorage.getItem(STORAGE_KEY)
    if (stored) {
      const parsed = JSON.parse(stored) as Partial<HageplanSettings>
      return { ...DEFAULTS, ...parsed }
    }
  } catch {
    // ignore
  }
  // Migrate old token if present
  const oldToken = localStorage.getItem("hageplan_mapbox_token")
  if (oldToken) {
    const settings = { ...DEFAULTS, mapboxToken: oldToken }
    saveSettings(settings)
    localStorage.removeItem("hageplan_mapbox_token")
    return settings
  }
  return DEFAULTS
}

export function saveSettings(settings: HageplanSettings) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(settings))
}

export function hasValidToken(): boolean {
  return loadSettings().mapboxToken.startsWith("pk.")
}

interface SettingsDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
}

export function SettingsDialog({ open, onOpenChange }: SettingsDialogProps) {
  const [form, setForm] = useState<HageplanSettings>(DEFAULTS)

  useEffect(() => {
    if (open) {
      setForm(loadSettings())
    }
  }, [open])

  const handleSave = () => {
    saveSettings(form)
    onOpenChange(false)
    window.location.reload()
  }

  const inputClass =
    "w-full h-9 px-3 text-sm rounded-md border border-input bg-background text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring"

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Settings</DialogTitle>
          <DialogDescription>
            Configure your map token and property location.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 pt-2">
          {/* Mapbox token */}
          <div className="space-y-1.5">
            <label className="text-sm font-medium">Mapbox token</label>
            <input
              type="text"
              value={form.mapboxToken}
              onChange={(e) => setForm({ ...form, mapboxToken: e.target.value })}
              placeholder="pk.eyJ1Ijoi..."
              className={inputClass}
            />
            <p className="text-xs text-muted-foreground">
              Get one free at{" "}
              <a
                href="https://account.mapbox.com/access-tokens/"
                target="_blank"
                rel="noopener noreferrer"
                className="underline"
              >
                mapbox.com
              </a>
            </p>
          </div>

          {/* Coordinates */}
          <div className="space-y-1.5">
            <label className="text-sm font-medium">Property coordinates</label>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="text-xs text-muted-foreground">Latitude</label>
                <input
                  type="number"
                  step="any"
                  value={form.lat}
                  onChange={(e) =>
                    setForm({ ...form, lat: parseFloat(e.target.value) || 0 })
                  }
                  placeholder="60.3723"
                  className={inputClass}
                />
              </div>
              <div>
                <label className="text-xs text-muted-foreground">Longitude</label>
                <input
                  type="number"
                  step="any"
                  value={form.lng}
                  onChange={(e) =>
                    setForm({ ...form, lng: parseFloat(e.target.value) || 0 })
                  }
                  placeholder="11.0701"
                  className={inputClass}
                />
              </div>
            </div>
            <p className="text-xs text-muted-foreground">
              Right-click your home on{" "}
              <a
                href="https://www.google.com/maps"
                target="_blank"
                rel="noopener noreferrer"
                className="underline"
              >
                Google Maps
              </a>
              {" "}→ the first line shows latitude, longitude. Click to copy.
            </p>
          </div>

          {/* GNR/BNR */}
          <div className="space-y-1.5">
            <label className="text-sm font-medium">
              Property number (optional)
            </label>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="text-xs text-muted-foreground">
                  Gårdsnummer (gnr)
                </label>
                <input
                  type="number"
                  value={form.gnr || ""}
                  onChange={(e) =>
                    setForm({ ...form, gnr: parseInt(e.target.value) || 0 })
                  }
                  placeholder="0"
                  className={inputClass}
                />
              </div>
              <div>
                <label className="text-xs text-muted-foreground">
                  Bruksnummer (bnr)
                </label>
                <input
                  type="number"
                  value={form.bnr || ""}
                  onChange={(e) =>
                    setForm({ ...form, bnr: parseInt(e.target.value) || 0 })
                  }
                  placeholder="0"
                  className={inputClass}
                />
              </div>
            </div>
            <p className="text-xs text-muted-foreground">
              Highlights your property in orange on the map.
            </p>
          </div>
        </div>

        <div className="flex justify-end gap-2 pt-2">
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button
            onClick={handleSave}
            disabled={!form.mapboxToken.startsWith("pk.")}
          >
            Save & reload
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}

export function SettingsButton({
  onClick,
}: {
  onClick: () => void
}) {
  return (
    <Button variant="ghost" size="icon" className="h-8 w-8" onClick={onClick}>
      <Settings className="h-4 w-4" />
    </Button>
  )
}
