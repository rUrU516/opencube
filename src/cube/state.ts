export type Vector3 = {
  x: number
  y: number
  z: number
}

export type Color = {
  r: number
  g: number
  b: number
}

export type FaceState = {
  color: Color
  brightness: number
}

export type ParticleState = {
  position: Vector3
  velocity: Vector3
  color: Color
  alpha: number
  size: number
}

export class CubeState {
  rotation: Vector3
  angularVelocity: Vector3
  faces: FaceState[]
  particles: ParticleState[]

  constructor(state: {
    rotation: Vector3
    angularVelocity: Vector3
    faces: FaceState[]
    particles: ParticleState[]
  }) {
    this.rotation = state.rotation
    this.angularVelocity = state.angularVelocity
    this.faces = state.faces
    this.particles = state.particles
  }
}
