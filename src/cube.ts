import { CubeState } from "./cube-state"
import { Disturbance, DisturbancePool } from "./cube-disturbance"
import { CubeIterator } from "./cube-iterator"

export class Cube {
  private state: CubeState
  private disturbancePool: DisturbancePool
  private iterator: CubeIterator

  constructor(state: CubeState) {
    this.state = state
    this.disturbancePool = new DisturbancePool()
    this.iterator = new CubeIterator(this.state, this.disturbancePool)
  }

  addDisturbance(disturbance: Disturbance) {
    this.disturbancePool.add(disturbance)
  }

  tick(dt: number) {
    this.iterator.step(dt)
  }

  snapshot() {
    return {
      rotation: this.state.rotation,
      angularVelocity: this.state.angularVelocity,
      faces: this.state.faces,
      particles: this.state.particles,
    }
  }
}
