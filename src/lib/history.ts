import type { Feature } from "geojson"

export interface Snapshot {
  drawFeatures: Feature[]
  textFeatures: Feature[]
}

const MAX_HISTORY = 50

export class UndoRedoHistory {
  private stack: Snapshot[] = []
  private pointer = -1
  private onChange: (canUndo: boolean, canRedo: boolean) => void

  constructor(onChange: (canUndo: boolean, canRedo: boolean) => void) {
    this.onChange = onChange
  }

  push(snapshot: Snapshot) {
    // Discard any redo entries ahead of pointer
    this.stack = this.stack.slice(0, this.pointer + 1)
    this.stack.push(JSON.parse(JSON.stringify(snapshot)))
    if (this.stack.length > MAX_HISTORY) {
      this.stack.shift()
    } else {
      this.pointer++
    }
    this.notify()
  }

  undo(): Snapshot | null {
    if (this.pointer <= 0) return null
    this.pointer--
    this.notify()
    return JSON.parse(JSON.stringify(this.stack[this.pointer]))
  }

  redo(): Snapshot | null {
    if (this.pointer >= this.stack.length - 1) return null
    this.pointer++
    this.notify()
    return JSON.parse(JSON.stringify(this.stack[this.pointer]))
  }

  get canUndo(): boolean {
    return this.pointer > 0
  }

  get canRedo(): boolean {
    return this.pointer < this.stack.length - 1
  }

  private notify() {
    this.onChange(this.canUndo, this.canRedo)
  }
}
