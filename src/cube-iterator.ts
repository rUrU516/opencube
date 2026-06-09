import type { CubeState } from "./cube-state"
import { DisturbancePool } from "./cube-disturbance"

export class CubeIterator {
  disturbancePool: DisturbancePool

  constructor(disturbancePool = new DisturbancePool()) {
    this.disturbancePool = disturbancePool
  }

  /**
   * Advance CubeState by one frame.
   *
   * Disturbances are applied before natural integration:
   * - disturbances can change velocity, face brightness, particles, etc.
   * - rotation moves by angularVelocity
   * - particles move by velocity
   *
   * Damping, pruning, and bounds handling will be layered here later.
   */
  step(state: CubeState, dt: number) {
    this.disturbancePool.apply(state, dt)

    state.rotation.x += state.angularVelocity.x * dt
    state.rotation.y += state.angularVelocity.y * dt
    state.rotation.z += state.angularVelocity.z * dt

    for (const particle of state.particles) {
      particle.position.x += particle.velocity.x * dt
      particle.position.y += particle.velocity.y * dt
      particle.position.z += particle.velocity.z * dt
    }
  }
}
