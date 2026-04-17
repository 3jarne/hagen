import { useMemo } from "react"
import { Sun, Sunrise, Sunset, Clock } from "lucide-react"
import { Slider } from "@/components/ui/slider"
import { Button } from "@/components/ui/button"
import {
  getSunInfo,
  toOsloParts,
  fromOsloWallClock,
  formatOsloTime,
} from "@/lib/sun-calc"

interface Props {
  lat: number
  lng: number
  date: Date
  onDateChange: (d: Date) => void
}

function pad(n: number): string {
  return String(n).padStart(2, "0")
}

function formatLocalDateForInput(d: Date): string {
  const p = toOsloParts(d)
  return `${p.year}-${pad(p.month + 1)}-${pad(p.day)}`
}

export function Solkompass({ lat, lng, date, onDateChange }: Props) {
  const info = useMemo(() => getSunInfo(date, lat, lng), [date, lat, lng])
  const parts = useMemo(() => toOsloParts(date), [date])

  const timeValue = parts.hours + parts.minutes / 60

  const handleDateChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const pieces = e.target.value.split("-").map(Number)
    if (pieces.length !== 3 || pieces.some((n) => !isFinite(n))) return
    const [y, m, d] = pieces
    const nd = fromOsloWallClock(y, m - 1, d, parts.hours, parts.minutes)
    onDateChange(nd)
  }

  const handleTimeChange = (value: number) => {
    const clamped = Math.max(0, Math.min(value, 23.75))
    const h = Math.floor(clamped)
    const m = Math.round((clamped - h) * 60)
    const nd = fromOsloWallClock(parts.year, parts.month, parts.day, h, m)
    onDateChange(nd)
  }

  const handleNow = () => {
    onDateChange(new Date())
  }

  return (
    <div className="absolute top-14 right-4 z-40 bg-white dark:bg-neutral-900 rounded-lg shadow-xl p-3 w-60 text-sm space-y-3 border border-neutral-200 dark:border-neutral-800">
      <div className="flex items-center gap-2 font-semibold">
        <Sun className="h-4 w-4 text-amber-500" />
        <span>Solkompass</span>
      </div>

      <div className="rounded-md bg-amber-50 dark:bg-amber-950 border border-amber-200 dark:border-amber-800 px-3 py-2 text-xs leading-snug space-y-1">
        <p><span className="text-amber-600 font-semibold">☀ Sol</span> — hvor solen er nå</p>
        <p><span className="text-amber-500 font-semibold">⌒ Solens vei</span> — sol gjennom dagen</p>
        <p><span className="text-neutral-500 font-semibold">▬ Skygge</span> — hvor skygger faller fra objekter</p>
      </div>

      <div className="space-y-1">
        <label className="text-xs text-muted-foreground">Dato</label>
        <input
          type="date"
          value={formatLocalDateForInput(date)}
          onChange={handleDateChange}
          className="w-full px-2 py-1 rounded border border-neutral-300 dark:border-neutral-700 bg-transparent text-sm"
        />
      </div>

      <div className="space-y-1">
        <div className="flex items-center justify-between">
          <label className="text-xs text-muted-foreground flex items-center gap-1">
            <Clock className="h-3 w-3" />
            Tid
          </label>
          <span className="text-xs font-mono">
            {pad(parts.hours)}:{pad(parts.minutes)}
            {!info.isAboveHorizon && (
              <span className="ml-1 text-muted-foreground">🌙 Natt</span>
            )}
          </span>
        </div>
        <Slider
          value={[timeValue]}
          min={0}
          max={23.75}
          step={0.25}
          onValueChange={([v]) => handleTimeChange(v)}
        />
        <Button
          variant="outline"
          size="sm"
          className="w-full h-7 text-xs"
          onClick={handleNow}
        >
          Nå
        </Button>
      </div>

      <div className="space-y-1 text-xs text-muted-foreground font-mono">
        <div className="flex items-center gap-2">
          <Sunrise className="h-3 w-3 text-amber-500" />
          <span>{formatOsloTime(info.sunrise)}</span>
          <Sun className="h-3 w-3 ml-2 text-amber-500" />
          <span>{formatOsloTime(info.solarNoon)}</span>
        </div>
        <div className="flex items-center gap-2">
          <Sunset className="h-3 w-3 text-amber-600" />
          <span>{formatOsloTime(info.sunset)}</span>
        </div>
      </div>
    </div>
  )
}
