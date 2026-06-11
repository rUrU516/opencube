import { AngularDampingDisturbance } from "../cube/disturbances/angular-damping"
import { FaceDimDisturbance } from "../cube/disturbances/face-dim"
import { FaceLightUpDisturbance } from "../cube/disturbances/face-light-up"
import { ParticleEmitterDisturbance } from "../cube/disturbances/particle-emitter"
import type { Cube } from "../cube/cube"
import type { Color } from "../cube/state"
import type { OpenCodeEvent, OpenCodeState, SessionStatus } from "../opencode/state"

const BUSY_DAMPING_REDUCTION_ID = "global:busy-damping-reduction"
const FACE_COUNT = 6

function randomBetween(min: number, max: number) {
  return min + Math.random() * (max - min)
}

function randomOwnershipColor(): Color {
  const channels = [Math.round(randomBetween(30, 190)), Math.round(randomBetween(30, 190)), Math.round(randomBetween(30, 190))]
  const hot = Math.floor(randomBetween(0, 3))
  channels[hot] = Math.round(randomBetween(190, 235))
  channels[(hot + 1) % 3] = Math.max(channels[(hot + 1) % 3], Math.round(randomBetween(105, 200)))
  return { r: channels[0], g: channels[1], b: channels[2] }
}

export class CubeEffectController {
  private faceOwners: Array<string | undefined>
  private faceColors: Array<Color | undefined>
  private sessionFaces: Map<string, number>
  private toolParticleDisturbanceIDs: Map<string, string>

  constructor(private cube: Cube) {
    this.faceOwners = Array.from({ length: FACE_COUNT })
    this.faceColors = Array.from({ length: FACE_COUNT })
    this.sessionFaces = new Map()
    this.toolParticleDisturbanceIDs = new Map()
  }

  sync(openCodeState: OpenCodeState, event: OpenCodeEvent) {
    const previousStatus = this.getSessionStatus(openCodeState, event.sessionID)

    if ((event.type === "session.busy" || event.type === "session.retry") && !this.isBusyOrRetry(previousStatus)) {
      const faceIndex = this.acquireFace(event.sessionID)
      if (faceIndex !== undefined) this.cube.addDisturbance(new FaceLightUpDisturbance({ faceIndex, color: this.getFaceColor(faceIndex) }))

      if (!this.hasBusyOrRetrySession(openCodeState)) {
        this.cube.addDisturbance(new AngularDampingDisturbance(-1.85), BUSY_DAMPING_REDUCTION_ID)
      }
      return
    }

    if (event.type === "session.idle" && this.isBusyOrRetry(previousStatus)) {
      const faceIndex = this.releaseFace(event.sessionID)
      if (faceIndex !== undefined) {
        this.stopToolParticles(event.sessionID, faceIndex)
        this.cube.addDisturbance(new FaceDimDisturbance({ faceIndex, brightness: 0 }))
      }

      if (!this.hasOtherBusyOrRetrySession(openCodeState, event.sessionID)) {
        this.cube.markDisturbanceDone(BUSY_DAMPING_REDUCTION_ID)
      }
      return
    }

    if (event.type === "tool.start") {
      this.startToolParticles(openCodeState, event.sessionID)
      return
    }

    if (event.type === "tool.finish") {
      this.stopToolParticlesIfLastTool(openCodeState, event.sessionID, event.callID)
      return
    }
  }

  private getSessionStatus(openCodeState: OpenCodeState, sessionID: string): SessionStatus {
    return openCodeState.sessions.get(sessionID)?.status || "idle"
  }

  private isBusyOrRetry(status: SessionStatus) {
    return status === "busy" || status === "retry"
  }

  private hasOtherBusyOrRetrySession(openCodeState: OpenCodeState, excludedSessionID: string) {
    for (const session of openCodeState.sessions.values()) {
      if (session.sessionID === excludedSessionID) continue
      if (this.isBusyOrRetry(session.status)) return true
    }
    return false
  }

  private acquireFace(sessionID: string) {
    const existing = this.sessionFaces.get(sessionID)
    if (existing !== undefined) return existing

    const freeIndex = this.faceOwners.findIndex((owner) => owner === undefined)
    if (freeIndex === -1) return undefined

    this.faceOwners[freeIndex] = sessionID
    this.faceColors[freeIndex] = randomOwnershipColor()
    this.sessionFaces.set(sessionID, freeIndex)
    return freeIndex
  }

  private releaseFace(sessionID: string) {
    const faceIndex = this.sessionFaces.get(sessionID)
    if (faceIndex === undefined) return undefined

    this.sessionFaces.delete(sessionID)
    this.faceOwners[faceIndex] = undefined
    this.faceColors[faceIndex] = undefined
    return faceIndex
  }

  private getFaceColor(faceIndex: number) {
    const existing = this.faceColors[faceIndex]
    if (existing) return existing

    const color = randomOwnershipColor()
    this.faceColors[faceIndex] = color
    return color
  }

  private getSessionFace(sessionID: string) {
    return this.sessionFaces.get(sessionID)
  }

  private toolParticleDisturbanceID(sessionID: string, faceIndex: number) {
    return `session:${sessionID}:face:${faceIndex}:tool-particles`
  }

  private startToolParticles(openCodeState: OpenCodeState, sessionID: string) {
    const session = openCodeState.sessions.get(sessionID)
    if (!session || session.activeTools.size > 0) return

    const faceIndex = this.getSessionFace(sessionID)
    if (faceIndex === undefined) return

    const id = this.toolParticleDisturbanceID(sessionID, faceIndex)
    this.toolParticleDisturbanceIDs.set(sessionID, id)
    this.cube.addDisturbance(new ParticleEmitterDisturbance({ faceIndex, color: this.getFaceColor(faceIndex) }), id)
  }

  private stopToolParticlesIfLastTool(openCodeState: OpenCodeState, sessionID: string, callID: string) {
    const session = openCodeState.sessions.get(sessionID)
    if (!session || !session.activeTools.has(callID) || session.activeTools.size > 1) return

    const faceIndex = this.getSessionFace(sessionID)
    if (faceIndex === undefined) return

    const id = this.toolParticleDisturbanceIDs.get(sessionID) || this.toolParticleDisturbanceID(sessionID, faceIndex)
    this.stopToolParticles(sessionID, faceIndex, id)
  }

  private stopToolParticles(sessionID: string, faceIndex: number, id = this.toolParticleDisturbanceIDs.get(sessionID) || this.toolParticleDisturbanceID(sessionID, faceIndex)) {
    this.cube.markDisturbanceDone(id)
    this.toolParticleDisturbanceIDs.delete(sessionID)
  }

  private hasBusyOrRetrySession(openCodeState: OpenCodeState) {
    for (const session of openCodeState.sessions.values()) {
      if (this.isBusyOrRetry(session.status)) return true
    }
    return false
  }
}
