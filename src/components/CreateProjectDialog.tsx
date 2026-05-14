import { useEffect, useState } from "react"
import { MapPin, Search, Loader2 } from "lucide-react"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"
import {
  KartverketError,
  searchAddresses,
  type AddressHit,
} from "@/lib/kartverket"
import { fetchMatrikkelData, MatrikkelError } from "@/lib/matrikkel"
import { fetchOsmBuildings, osmBuildingToFeature } from "@/lib/osm-buildings"
import { saveDrawing } from "@/lib/drawings"
import { createProject, type Project } from "@/lib/projects"

interface Props {
  open: boolean
  onOpenChange: (open: boolean) => void
  onCreated: (project: Project, options?: { osmFailed?: boolean }) => void
}

export function CreateProjectDialog({ open, onOpenChange, onCreated }: Props) {
  const [query, setQuery] = useState("")
  const [hits, setHits] = useState<AddressHit[]>([])
  const [searching, setSearching] = useState(false)
  const [searchError, setSearchError] = useState<string | null>(null)
  const [selected, setSelected] = useState<AddressHit | null>(null)
  const [saving, setSaving] = useState(false)
  const [savingStep, setSavingStep] = useState<
    "idle" | "matrikkel" | "osm"
  >("idle")
  const [saveError, setSaveError] = useState<string | null>(null)

  const resetAll = () => {
    setQuery("")
    setHits([])
    setSearching(false)
    setSearchError(null)
    setSelected(null)
    setSaving(false)
    setSavingStep("idle")
    setSaveError(null)
  }

  const handleOpenChange = (next: boolean) => {
    if (!next) resetAll()
    onOpenChange(next)
  }

  // Debounced address search — only runs when query is long enough
  useEffect(() => {
    if (selected) return
    const trimmed = query.trim()
    if (trimmed.length < 3) return

    const ctrl = new AbortController()
    const handle = window.setTimeout(() => {
      setSearching(true)
      setSearchError(null)
      searchAddresses(trimmed, ctrl.signal)
        .then((results) => {
          if (ctrl.signal.aborted) return
          setHits(results)
          setSearching(false)
        })
        .catch((err: unknown) => {
          if (ctrl.signal.aborted) return
          setSearching(false)
          if (err instanceof KartverketError) {
            setSearchError(err.message)
          } else {
            setSearchError(
              err instanceof Error ? err.message : "Kunne ikke søke",
            )
          }
        })
    }, 300)

    return () => {
      window.clearTimeout(handle)
      ctrl.abort()
    }
  }, [query, selected])

  const handleQueryChange = (value: string) => {
    setQuery(value)
    setSelected(null)
    setSaveError(null)
    if (value.trim().length < 3) {
      setHits([])
      setSearching(false)
      setSearchError(null)
    }
  }

  const handlePick = (hit: AddressHit) => {
    setSelected(hit)
    setQuery(hit.address)
    setHits([])
  }

  const handleSave = async () => {
    if (!selected) return
    setSaving(true)
    setSaveError(null)
    try {
      setSavingStep("matrikkel")
      const matrikkel = await fetchMatrikkelData({
        kommunenummer: selected.kommunenummer,
        gardsnummer: selected.gnr,
        bruksnummer: selected.bnr,
        center_lng: selected.lng,
        center_lat: selected.lat,
      })
      const project = await createProject({
        address: selected.address,
        center_lng: selected.lng,
        center_lat: selected.lat,
        gnr: selected.gnr,
        bnr: selected.bnr,
        kommunenummer: selected.kommunenummer,
        property_boundary: matrikkel.boundary,
        buildings: matrikkel.buildings,
      })

      // OSM-bygninger: best-effort. Hvis det feiler eller ikke finnes
      // bygninger, opprettes prosjektet uansett — brukeren kan tegne selv.
      // osmFailed-flagget formidles til MapPage via navigate-state slik at
      // brukeren får en diskret melding der.
      let osmFailed = false
      try {
        setSavingStep("osm")
        const osm = await fetchOsmBuildings(matrikkel.boundary)
        if (osm.length > 0) {
          const features = osm.map(osmBuildingToFeature)
          await saveDrawing(project.id, {
            drawFeatures: features,
            textFeatures: [],
            lineFeatures: [],
          })
        }
      } catch (osmErr) {
        console.warn("[osm-buildings] kunne ikke hente:", osmErr)
        osmFailed = true
      }

      onCreated(project, { osmFailed })
    } catch (err) {
      if (err instanceof MatrikkelError) {
        setSaveError(
          "Kunne ikke hente eiendomsgrenser. Prøv igjen om litt.",
        )
      } else {
        setSaveError(
          err instanceof Error ? err.message : "Kunne ikke lagre prosjekt",
        )
      }
      setSaving(false)
      setSavingStep("idle")
    }
  }

  const savingLabel =
    savingStep === "matrikkel"
      ? "Henter eiendomsgrense…"
      : savingStep === "osm"
        ? "Henter bygninger…"
        : "Oppretter…"

  const displayedHits = selected ? [] : hits
  const showNoResults =
    !selected &&
    !searching &&
    query.trim().length >= 3 &&
    hits.length === 0 &&
    !searchError

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Ny hageplan</DialogTitle>
          <DialogDescription>
            Søk etter adressen til eiendommen. Koordinater og matrikkel
            hentes automatisk fra Kartverket.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          <div className="space-y-1.5">
            <Label htmlFor="address-search">Adresse</Label>
            <div className="relative">
              <span className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground">
                {searching ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Search className="h-4 w-4" />
                )}
              </span>
              <Input
                id="address-search"
                autoComplete="off"
                autoFocus
                placeholder="F.eks. Storgata 1, Oslo"
                value={query}
                onChange={(e) => handleQueryChange(e.target.value)}
                disabled={saving}
                className="pl-8"
              />
            </div>
          </div>

          {displayedHits.length > 0 && (
            <ul className="rounded-md border divide-y max-h-60 overflow-y-auto">
              {displayedHits.map((h) => (
                <li key={h.id}>
                  <button
                    type="button"
                    onClick={() => handlePick(h)}
                    className={cn(
                      "w-full text-left px-3 py-2 text-sm",
                      "hover:bg-accent hover:text-accent-foreground",
                      "focus:outline-none focus:bg-accent focus:text-accent-foreground",
                    )}
                  >
                    <div className="flex items-start gap-2">
                      <MapPin className="h-4 w-4 text-muted-foreground shrink-0 mt-0.5" />
                      <div className="min-w-0">
                        <div className="truncate">{h.address}</div>
                        <div className="text-xs text-muted-foreground">
                          GNR {h.gnr} / BNR {h.bnr}
                          {h.kommunenavn && ` — ${h.kommunenavn}`}
                        </div>
                      </div>
                    </div>
                  </button>
                </li>
              ))}
            </ul>
          )}

          {showNoResults && (
            <p className="text-xs text-muted-foreground">
              Ingen treff. Prøv en mer spesifikk adresse.
            </p>
          )}

          {searchError && (
            <p className="text-xs text-destructive">
              Søkefeil: {searchError}
            </p>
          )}

          {selected && (
            <div className="rounded-md border bg-muted/40 p-3 text-xs space-y-0.5">
              <div>
                <span className="text-muted-foreground">GNR/BNR: </span>
                {selected.gnr} / {selected.bnr}
              </div>
              <div>
                <span className="text-muted-foreground">Koordinater: </span>
                {selected.lat.toFixed(5)}, {selected.lng.toFixed(5)}
              </div>
            </div>
          )}

          {saveError && (
            <p className="text-xs text-destructive">{saveError}</p>
          )}
        </div>

        <div className="flex justify-end gap-2 pt-2">
          <Button
            variant="outline"
            onClick={() => handleOpenChange(false)}
            disabled={saving}
          >
            Avbryt
          </Button>
          <Button onClick={handleSave} disabled={!selected || saving}>
            {saving ? (
              <>
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                {savingLabel}
              </>
            ) : (
              "Opprett"
            )}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}
