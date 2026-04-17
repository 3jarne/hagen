import SunCalc from "suncalc"
import type { Position } from "geojson"

const STICK_HEIGHT_M = 3
const MAX_SHADOW_M = 30

export interface SunInfo {
  /** Compass azimuth in degrees (0 = N, 90 = E, 180 = S, 270 = W) */
  azimuthDeg: number
  /** Altitude above horizon in radians (positive = above) */
  altitudeRad: number
  isAboveHorizon: boolean
  sunrise: Date
  sunset: Date
  solarNoon: Date
}

/**
 * Sun position + key times for the given moment and location.
 * suncalc returns azimuth in radians with 0 = south, clockwise.
 * We convert to compass convention (0 = N).
 */
export function getSunInfo(date: Date, lat: number, lng: number): SunInfo {
  const pos = SunCalc.getPosition(date, lat, lng)
  const times = SunCalc.getTimes(date, lat, lng)
  return {
    azimuthDeg: (((pos.azimuth * 180) / Math.PI) + 180 + 360) % 360,
    altitudeRad: pos.altitude,
    isAboveHorizon: pos.altitude > 0,
    sunrise: times.sunrise,
    sunset: times.sunset,
    solarNoon: times.solarNoon,
  }
}

/**
 * Project the shadow tip of a vertical STICK_HEIGHT_M stick at `anchor`
 * onto the ground, for the given sun azimuth (compass) and altitude.
 * Shadow length clamped to MAX_SHADOW_M near horizon.
 * Returns the anchor itself if sun is at or below horizon.
 */
export function projectShadowTip(
  anchor: Position,
  azimuthDeg: number,
  altitudeRad: number,
): Position {
  if (altitudeRad <= 0) return anchor
  const shadowLenM = Math.min(
    STICK_HEIGHT_M / Math.tan(altitudeRad),
    MAX_SHADOW_M,
  )
  // Shadow points opposite to sun
  const bearingDeg = (azimuthDeg + 180) % 360
  const bearingRad = (bearingDeg * Math.PI) / 180
  const dLat = (shadowLenM * Math.cos(bearingRad)) / 111320
  const dLng =
    (shadowLenM * Math.sin(bearingRad)) /
    (111320 * Math.cos((anchor[1] * Math.PI) / 180))
  return [anchor[0] + dLng, anchor[1] + dLat]
}

/**
 * Build the shadow-tip arc for a given date, sampled every 15 min
 * between sunrise and sunset. Returns arc points + hourly markers.
 * Returns empty arrays for polar-night days (invalid sunrise/sunset).
 */
export function buildSundialArc(
  date: Date,
  lat: number,
  lng: number,
  anchor: Position,
): { arc: Position[]; hourMarkers: Position[] } {
  const info = getSunInfo(date, lat, lng)
  const arc: Position[] = []
  const hourMarkers: Position[] = []
  const start = info.sunrise.getTime()
  const end = info.sunset.getTime()
  if (!isFinite(start) || !isFinite(end) || end <= start) {
    return { arc, hourMarkers }
  }

  const step = 15 * 60 * 1000
  for (let t = start; t <= end; t += step) {
    const s = getSunInfo(new Date(t), lat, lng)
    if (s.isAboveHorizon) {
      arc.push(projectShadowTip(anchor, s.azimuthDeg, s.altitudeRad))
    }
  }

  // Hourly marker dots from first full hour after sunrise
  const firstHour = new Date(start)
  firstHour.setMinutes(0, 0, 0)
  firstHour.setHours(firstHour.getHours() + 1)
  for (let t = firstHour.getTime(); t <= end; t += 3600 * 1000) {
    const s = getSunInfo(new Date(t), lat, lng)
    if (s.isAboveHorizon) {
      hourMarkers.push(projectShadowTip(anchor, s.azimuthDeg, s.altitudeRad))
    }
  }

  return { arc, hourMarkers }
}
