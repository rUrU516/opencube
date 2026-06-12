import type { Disturbance } from "../disturbance"
import type { Color, CubeState, Vector3 } from "../state"

const FACE_NORMALS: Vector3[] = [
  { x: 0, y: 0, z: 1 },
  { x: 0, y: 0, z: -1 },
  { x: 1, y: 0, z: 0 },
  { x: -1, y: 0, z: 0 },
  { x: 0, y: 1, z: 0 },
  { x: 0, y: -1, z: 0 },
]

let nextParticleID = 1

function randomBetween(min: number, max: number) {
  return min + Math.random() * (max - min)
}

function normalize(vector: Vector3): Vector3 {
  const length = Math.sqrt(vector.x * vector.x + vector.y * vector.y + vector.z * vector.z) || 1
  return { x: vector.x / length, y: vector.y / length, z: vector.z / length }
}

function cross(a: Vector3, b: Vector3): Vector3 {
  return {
    x: a.y * b.z - a.z * b.y,
    y: a.z * b.x - a.x * b.z,
    z: a.x * b.y - a.y * b.x,
  }
}

function add(a: Vector3, b: Vector3): Vector3 {
  return { x: a.x + b.x, y: a.y + b.y, z: a.z + b.z }
}

function scale(vector: Vector3, value: number): Vector3 {
  return { x: vector.x * value, y: vector.y * value, z: vector.z * value }
}

function coneDirection(normal: Vector3, spread = 0.34): Vector3 {
  const basisSeed = Math.abs(normal.y) < 0.9 ? { x: 0, y: 1, z: 0 } : { x: 1, y: 0, z: 0 }
  const tangentA = normalize(cross(normal, basisSeed))
  const tangentB = normalize(cross(normal, tangentA))
  const angle = randomBetween(0, Math.PI * 2)
  const radius = randomBetween(0, spread)
  return normalize(add(normal, add(scale(tangentA, Math.cos(angle) * radius), scale(tangentB, Math.sin(angle) * radius))))
}

function rotateVector(vector: Vector3, rotation: Vector3): Vector3 {
  const xRad = rotation.x * Math.PI / 180
  const yRad = rotation.y * Math.PI / 180
  const zRad = rotation.z * Math.PI / 180

  const a = Math.cos(xRad)
  const b = Math.sin(xRad)
  const c = Math.cos(yRad)
  const d = Math.sin(yRad)
  const e = Math.cos(zRad)
  const f = Math.sin(zRad)
  const { x, y, z } = vector

  // Match Three.js Euler default order: XYZ.
  return {
    x: c * e * x - c * f * y + d * z,
    y: (a * f + b * e * d) * x + (a * e - b * f * d) * y - b * c * z,
    z: (b * f - a * e * d) * x + (b * e + a * f * d) * y + a * c * z,
  }
}

export class ParticleEmitterDisturbance implements Disturbance {
  faceIndex: number
  rate: number
  speed: number
  color: Color
  particleSizeAdd: number
  accumulator: number

  constructor(options: { faceIndex: number; color: Color; rate?: number; speed?: number; particleSizeAdd?: number }) {
    this.faceIndex = options.faceIndex
    this.rate = options.rate ?? 7
    this.speed = options.speed ?? 4.2
    this.color = options.color
    this.particleSizeAdd = options.particleSizeAdd ?? 0
    this.accumulator = 0
  }

  apply(state: CubeState, dt: number) {
    const localNormal = FACE_NORMALS[this.faceIndex]
    if (!localNormal) return

    const normal = rotateVector(localNormal, state.rotation)
    this.accumulator += this.rate * dt

    while (this.accumulator >= 1) {
      this.accumulator -= 1
      const direction = coneDirection(normal)
      state.particles.push({
        id: nextParticleID++,
        position: {
          x: normal.x * 0.38,
          y: normal.y * 0.38,
          z: normal.z * 0.38,
        },
        velocity: {
          x: direction.x * this.speed,
          y: direction.y * this.speed,
          z: direction.z * this.speed,
        },
        travelDistance: 0,
        color: this.color,
        alpha: 1,
        size: randomBetween(0.16, 0.26) + this.particleSizeAdd,
      })
    }
  }
}
