import type { Disturbance } from "../cube-disturbance"
import type { CubeState } from "../cube-state"

export class AngularDampingDisturbance implements Disturbance {
  damping: number

  /**
   * Positive damping slows angularVelocity down.
   * Negative damping amplifies angularVelocity and can be used as a busy-state boost.
   * Keep negative damping magnitude smaller than the base positive damping.
   */
  constructor(damping = 2.0) {
    this.damping = damping
  }

  apply(state: CubeState, dt: number) {
    const factor = Math.exp(-this.damping * dt)
    state.angularVelocity.x *= factor
    state.angularVelocity.y *= factor
    state.angularVelocity.z *= factor
  }
}
