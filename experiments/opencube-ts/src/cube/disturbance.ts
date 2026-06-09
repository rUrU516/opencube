import type { CubeState } from "./state"
import { AngularDampingDisturbance } from "./disturbances/angular-damping"
import { RandomAngularKickDisturbance } from "./disturbances/random-angular-kick"

export interface Disturbance {
  done?: boolean
  apply(state: CubeState, dt: number): void
}

export class DisturbancePool {
  disturbances: Disturbance[]

  constructor(disturbances: Disturbance[] = []) {
    this.disturbances = [
      new RandomAngularKickDisturbance({
        interval: 4,
        strength: { x: 80, y: 80, z: 80 },
      }),
      new AngularDampingDisturbance(2.0),
      ...disturbances,
    ]
  }

  add(disturbance: Disturbance) {
    this.disturbances.push(disturbance)
  }

  apply(state: CubeState, dt: number) {
    for (const disturbance of this.disturbances) {
      disturbance.apply(state, dt)
    }

    this.disturbances = this.disturbances.filter((disturbance) => !disturbance.done)
  }
}
