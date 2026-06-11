import type { CubeState } from "./state"
import { AngularDampingDisturbance } from "./disturbances/angular-damping"
import { ParticleEmitterDisturbance } from "./disturbances/particle-emitter"
import { ParticleFadeDisturbance } from "./disturbances/particle-fade"
import { RandomAngularKickDisturbance } from "./disturbances/random-angular-kick"

export interface Disturbance {
  done?: boolean
  apply(state: CubeState, dt: number): void
}

type DisturbanceEntry = {
  id?: string
  disturbance: Disturbance
}

export class DisturbancePool {
  disturbances: DisturbanceEntry[]

  constructor(disturbances: Disturbance[] = []) {
    this.disturbances = [
      {
        id: "global:random-angular-kick",
        disturbance: new RandomAngularKickDisturbance({
          interval: 4,
          strength: { x: 80, y: 80, z: 80 },
        }),
      },
      { id: "global:base-damping", disturbance: new AngularDampingDisturbance(2.0) },
      { id: "global:particle-fade", disturbance: new ParticleFadeDisturbance({ fadeStartDistance: 0.55, maxDistance: 1.55 }) },
      { id: "test:face-0-particle-emitter", disturbance: new ParticleEmitterDisturbance({ faceIndex: 0 }) },
      ...disturbances.map((disturbance) => ({ disturbance })),
    ]
  }

  add(disturbance: Disturbance, id?: string) {
    if (id) this.markDone(id)
    this.disturbances.push({ id, disturbance })
  }

  markDone(id: string) {
    for (const entry of this.disturbances) {
      if (entry.id === id) entry.disturbance.done = true
    }
  }

  apply(state: CubeState, dt: number) {
    for (const entry of this.disturbances) {
      if (entry.disturbance.done) continue
      entry.disturbance.apply(state, dt)
    }

    this.disturbances = this.disturbances.filter((entry) => !entry.disturbance.done)
  }
}
