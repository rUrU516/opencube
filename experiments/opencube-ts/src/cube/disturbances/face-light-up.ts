import type { Disturbance } from "../disturbance"
import type { Color, CubeState } from "../state"

export class FaceLightUpDisturbance implements Disturbance {
  faceIndex: number
  color: Color
  done: boolean

  constructor(options: { faceIndex: number; color: Color }) {
    this.faceIndex = options.faceIndex
    this.color = options.color
    this.done = false
  }

  apply(state: CubeState) {
    const face = state.faces[this.faceIndex]
    if (!face) {
      this.done = true
      return
    }

    face.color = this.color
    face.brightness = 1
    this.done = true
  }
}
