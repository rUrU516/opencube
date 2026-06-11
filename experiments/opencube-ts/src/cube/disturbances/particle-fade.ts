import type { Disturbance } from "../disturbance"
import type { CubeState } from "../state"

export class ParticleFadeDisturbance implements Disturbance {
  fadeStartDistance: number
  maxDistance: number

  constructor(options: { fadeStartDistance?: number; maxDistance?: number } = {}) {
    this.fadeStartDistance = options.fadeStartDistance ?? 1.2
    this.maxDistance = options.maxDistance ?? 3
  }

  apply(state: CubeState) {
    state.particles = state.particles.filter((particle) => {
      const { x, y, z } = particle.position
      const distance = Math.sqrt(x * x + y * y + z * z)
      if (distance >= this.maxDistance) return false

      if (distance <= this.fadeStartDistance) {
        particle.alpha = 1
      } else {
        const fadeRange = Math.max(0.001, this.maxDistance - this.fadeStartDistance)
        particle.alpha = Math.max(0, 1 - (distance - this.fadeStartDistance) / fadeRange)
      }

      return particle.alpha > 0
    })
  }
}
