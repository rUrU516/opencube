import type { Disturbance } from "../cube-disturbance"
import type { CubeState, Vector3 } from "../cube-state"

function randomBetween(min: number, max: number) {
  return min + Math.random() * (max - min)
}

function randomDirection(strength: Vector3): Vector3 {
  return {
    x: randomBetween(-strength.x, strength.x),
    y: randomBetween(-strength.y, strength.y),
    z: randomBetween(-strength.z, strength.z),
  }
}

export class RandomAngularKickDisturbance implements Disturbance {
  interval: number
  strength: Vector3
  elapsed: number
  kickDirection: Vector3

  constructor(options: { interval: number; strength: Vector3 }) {
    this.interval = options.interval
    this.strength = options.strength
    this.elapsed = 0
    this.kickDirection = randomDirection(this.strength)
  }

  apply(state: CubeState, dt: number) {
    this.elapsed += dt

    if (this.elapsed >= this.interval) {
      this.elapsed = 0
      this.kickDirection = randomDirection(this.strength)
    }

    state.angularVelocity.x += this.kickDirection.x * dt
    state.angularVelocity.y += this.kickDirection.y * dt
    state.angularVelocity.z += this.kickDirection.z * dt
  }
}
