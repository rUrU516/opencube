import type { Disturbance } from "../disturbance"
import type { CubeState } from "../state"

export class FaceDimDisturbance implements Disturbance {
  faceIndex: number
  brightness: number
  done: boolean

  constructor(options: { faceIndex: number; brightness: number }) {
    this.faceIndex = options.faceIndex
    this.brightness = options.brightness
    this.done = false
  }

  apply(state: CubeState) {
    const face = state.faces[this.faceIndex]
    if (!face) {
      this.done = true
      return
    }

    face.brightness = this.brightness
    this.done = true
  }
}
