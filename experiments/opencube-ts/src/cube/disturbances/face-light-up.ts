import type { Disturbance } from "../disturbance"
import type { Color, CubeState } from "../state"

function randomColor(): Color {
  return {
    r: Math.round(80 + Math.random() * 175),
    g: Math.round(80 + Math.random() * 175),
    b: Math.round(80 + Math.random() * 175),
  }
}

export class FaceLightUpDisturbance implements Disturbance {
  faceIndex: number
  color: Color
  done: boolean

  constructor(options: { faceIndex: number }) {
    this.faceIndex = options.faceIndex
    this.color = randomColor()
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
