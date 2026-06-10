import type { Disturbance } from "../disturbance"
import type { Color, CubeState } from "../state"

function randomBetween(min: number, max: number) {
  return min + Math.random() * (max - min)
}

function hslToRgb(h: number, s: number, l: number): Color {
  const c = (1 - Math.abs(2 * l - 1)) * s
  const hp = h / 60
  const x = c * (1 - Math.abs((hp % 2) - 1))
  let r = 0
  let g = 0
  let b = 0
  if (hp < 1) [r, g, b] = [c, x, 0]
  else if (hp < 2) [r, g, b] = [x, c, 0]
  else if (hp < 3) [r, g, b] = [0, c, x]
  else if (hp < 4) [r, g, b] = [0, x, c]
  else if (hp < 5) [r, g, b] = [x, 0, c]
  else [r, g, b] = [c, 0, x]
  const m = l - c / 2
  return {
    r: Math.round((r + m) * 255),
    g: Math.round((g + m) * 255),
    b: Math.round((b + m) * 255),
  }
}

function randomColor(): Color {
  return hslToRgb(
    randomBetween(0, 360),
    randomBetween(0.68, 0.94),
    randomBetween(0.5, 0.66),
  )
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
