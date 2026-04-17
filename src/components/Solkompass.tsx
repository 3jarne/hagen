import { useMemo } from "react"
import { Sun, Sunrise, Sunset, Clock } from "lucide-react"
import { Slider } from "@/components/ui/slider"
import { Button } from "@/components/ui/button"
import { getSunInfo } from "@/lib/sun-calc"

interface Props {
  lat: number
  lng: number
  date: Date
  onDateChange: (d: Date) => void
}

function pad(n: number): string {
  return String(n).padStart(2, "0")
}

function formatLocalDate(d: Date): string {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
}

function formatTime(d: Date): string {
  if (!isFinite(d.getTime())) return "—"
  return `${pad(d.getHours())}:${pad(d.getMinutes())}`
}

export function Solkompass({ lat, lng, date, onDateChange }: Props) {
  const info = useMemo(() => getSunInfo(date, lat, lng), [date, lat, lng])

  const timeValue = date.getHours() + date.getMinutes() / 60

  const handleDateChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const parts = e.target.value.split("-").map(Number)
    if (parts.length !== 3 || parts.some((n) => !isFinite(n))) return
    const [y, m, d] = parts
    const nd = new Date(date)
    nd.setFullYear(y, m - 1, d)
    onDateChange(nd)
  }

  const handleTimeChange = (value: number) => {
    const h = Math.floor(value)
    const m = Math.round((value - h) * 60)
    const nd = new Date(date)
    nd.setHours(h, m, 0, 0)
    onDateChange(nd)
  }

  const handleNow = () => {
    onDateChange(new Date())
  }

  return (
    <div className="absolute top-4 right-4 z-40 bg-white dark:bg-neutral-900 rounded-lg shadow-xl p-3 w-56 text-sm space-y-3 border border-neutral-200 dark:border-neutral-800">
      <div className="flex items-center gap-2 font-semibold">
        <Sun className="h-4 w-4 text-amber-500" />
        <span>Solkompass</span>
      </div>

      <div className="space-y-1">
        <label className="text-xs text-muted-foreground">Dato</label>
        <input
          type="date"
          value={formatLocalDate(date)}
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
            {pad(date.getHours())}:{pad(date.getMinutes())}
            {!info.isAboveHorizon && (
              <span className="ml-1 text-muted-foreground">🌙 Natt</span>
            )}
          </span>
        </div>
        <Slider
          value={[timeValue]}
          min={0}
          max={24}
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
          <span>{isFinite(info.sunrise.getTime()) ? formatTime(info.sunrise) : "—"}</span>
          <Sun className="h-3 w-3 ml-2 text-amber-500" />
          <span>{isFinite(info.solarNoon.getTime()) ? formatTime(info.solarNoon) : "—"}</span>
        </div>
        <div className="flex items-center gap-2">
          <Sunset className="h-3 w-3 text-amber-600" />
          <span>{isFinite(info.sunset.getTime()) ? formatTime(info.sunset) : "—"}</span>
        </div>
      </div>
    </div>
  )
}
