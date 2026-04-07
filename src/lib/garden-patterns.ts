import type { Map } from "mapbox-gl"

const PATTERN_SIZE = 32

/**
 * Create a canvas of the given size and return its 2D context.
 */
function makeCanvas(size = PATTERN_SIZE): [HTMLCanvasElement, CanvasRenderingContext2D] {
  const canvas = document.createElement("canvas")
  canvas.width = size
  canvas.height = size
  const ctx = canvas.getContext("2d")!
  return [canvas, ctx]
}

/**
 * Scattered small dots (flower bed).
 */
function createBedPattern(): ImageData {
  const [canvas, ctx] = makeCanvas()
  ctx.fillStyle = "rgba(0,0,0,0.35)"
  // Deterministic scattered dots
  const positions = [
    [5, 7], [18, 4], [28, 12], [8, 22], [22, 26], [14, 15], [26, 20], [3, 30],
  ]
  for (const [x, y] of positions) {
    ctx.beginPath()
    ctx.arc(x, y, 1.5, 0, Math.PI * 2)
    ctx.fill()
  }
  return ctx.getImageData(0, 0, canvas.width, canvas.height)
}

/**
 * Fine diagonal grass lines (lawn).
 */
function createGressplenPattern(): ImageData {
  const [canvas, ctx] = makeCanvas()
  ctx.strokeStyle = "rgba(0,0,0,0.25)"
  ctx.lineWidth = 0.8
  // Diagonal lines from bottom-left to top-right, repeating
  for (let offset = -PATTERN_SIZE; offset < PATTERN_SIZE * 2; offset += 6) {
    ctx.beginPath()
    ctx.moveTo(offset, PATTERN_SIZE)
    ctx.lineTo(offset + PATTERN_SIZE, 0)
    ctx.stroke()
  }
  return ctx.getImageData(0, 0, canvas.width, canvas.height)
}

/**
 * Parallel planting rows (vegetable garden).
 */
function createGroennsakhagePattern(): ImageData {
  const [canvas, ctx] = makeCanvas()
  ctx.strokeStyle = "rgba(0,0,0,0.3)"
  ctx.lineWidth = 0.8
  // Horizontal evenly spaced rows
  for (let y = 4; y < PATTERN_SIZE; y += 8) {
    ctx.beginPath()
    ctx.moveTo(0, y)
    ctx.lineTo(PATTERN_SIZE, y)
    ctx.stroke()
  }
  return ctx.getImageData(0, 0, canvas.width, canvas.height)
}

/**
 * Wavy horizontal lines (pond/water).
 */
function createDamPattern(): ImageData {
  const [canvas, ctx] = makeCanvas()
  ctx.strokeStyle = "rgba(0,0,0,0.25)"
  ctx.lineWidth = 0.8
  for (let y = 6; y < PATTERN_SIZE; y += 10) {
    ctx.beginPath()
    for (let x = 0; x <= PATTERN_SIZE; x += 1) {
      const wy = y + Math.sin((x / PATTERN_SIZE) * Math.PI * 2) * 2
      if (x === 0) ctx.moveTo(x, wy)
      else ctx.lineTo(x, wy)
    }
    ctx.stroke()
  }
  return ctx.getImageData(0, 0, canvas.width, canvas.height)
}

/**
 * Horizontal wood plank lines (terrace).
 */
function createTerrassePattern(): ImageData {
  const [canvas, ctx] = makeCanvas()
  ctx.strokeStyle = "rgba(0,0,0,0.3)"
  ctx.lineWidth = 0.6
  for (let y = 5; y < PATTERN_SIZE; y += 7) {
    ctx.beginPath()
    ctx.moveTo(0, y)
    ctx.lineTo(PATTERN_SIZE, y)
    ctx.stroke()
  }
  // Vertical seam offset per row
  ctx.lineWidth = 0.4
  for (let row = 0; row < 5; row++) {
    const y0 = row * 7 + 1
    const x = (row % 2 === 0) ? PATTERN_SIZE * 0.4 : PATTERN_SIZE * 0.75
    ctx.beginPath()
    ctx.moveTo(x, y0)
    ctx.lineTo(x, y0 + 7)
    ctx.stroke()
  }
  return ctx.getImageData(0, 0, canvas.width, canvas.height)
}

/**
 * Cross-hatch (building).
 */
function createBygningPattern(): ImageData {
  const [canvas, ctx] = makeCanvas()
  ctx.strokeStyle = "rgba(0,0,0,0.3)"
  ctx.lineWidth = 0.6
  // Diagonal lines both directions
  for (let offset = -PATTERN_SIZE; offset < PATTERN_SIZE * 2; offset += 8) {
    ctx.beginPath()
    ctx.moveTo(offset, PATTERN_SIZE)
    ctx.lineTo(offset + PATTERN_SIZE, 0)
    ctx.stroke()
    ctx.beginPath()
    ctx.moveTo(offset, 0)
    ctx.lineTo(offset + PATTERN_SIZE, PATTERN_SIZE)
    ctx.stroke()
  }
  return ctx.getImageData(0, 0, canvas.width, canvas.height)
}

/**
 * Register all garden fill pattern images on the map.
 * Safe to call multiple times (skips already-registered images).
 */
export function registerGardenPatterns(map: Map) {
  const patterns: [string, () => ImageData][] = [
    ["garden-pattern-bed", createBedPattern],
    ["garden-pattern-gressplen", createGressplenPattern],
    ["garden-pattern-groennsakhage", createGroennsakhagePattern],
    ["garden-pattern-dam", createDamPattern],
    ["garden-pattern-terrasse", createTerrassePattern],
    ["garden-pattern-bygning", createBygningPattern],
  ]

  for (const [name, create] of patterns) {
    try {
      if (map.hasImage(name)) continue
      const imageData = create()
      map.addImage(
        name,
        { width: PATTERN_SIZE, height: PATTERN_SIZE, data: new Uint8Array(imageData.data.buffer) },
      )
    } catch {
      // Silently skip if map is in an invalid state
    }
  }
}
