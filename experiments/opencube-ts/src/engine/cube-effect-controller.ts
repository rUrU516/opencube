import { AngularDampingDisturbance } from "../cube/disturbances/angular-damping"
import { FaceDimDisturbance } from "../cube/disturbances/face-dim"
import { FaceLightUpDisturbance } from "../cube/disturbances/face-light-up"
import type { Cube } from "../cube/cube"
import type { OpenCodeEvent, OpenCodeState, SessionStatus } from "../opencode/state"

const BUSY_DAMPING_REDUCTION_ID = "global:busy-damping-reduction"
const FACE_COUNT = 6

export class CubeEffectController {
  private faceOwners: Array<string | undefined>
  private sessionFaces: Map<string, number>

  constructor(private cube: Cube) {
    this.faceOwners = Array.from({ length: FACE_COUNT })
    this.sessionFaces = new Map()
  }

  sync(openCodeState: OpenCodeState, event: OpenCodeEvent) {
    const previousStatus = this.getSessionStatus(openCodeState, event.sessionID)

    if ((event.type === "session.busy" || event.type === "session.retry") && !this.isBusyOrRetry(previousStatus)) {
      const faceIndex = this.acquireFace(event.sessionID)
      if (faceIndex !== undefined) this.cube.addDisturbance(new FaceLightUpDisturbance({ faceIndex }))

      if (!this.hasBusyOrRetrySession(openCodeState)) {
        this.cube.addDisturbance(new AngularDampingDisturbance(-1.85), BUSY_DAMPING_REDUCTION_ID)
      }
      return
    }

    if (event.type === "session.idle" && this.isBusyOrRetry(previousStatus)) {
      const faceIndex = this.releaseFace(event.sessionID)
        if (faceIndex !== undefined) this.cube.addDisturbance(new FaceDimDisturbance({ faceIndex, brightness: 0 }))

      if (!this.hasOtherBusyOrRetrySession(openCodeState, event.sessionID)) {
        this.cube.markDisturbanceDone(BUSY_DAMPING_REDUCTION_ID)
      }
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
    this.sessionFaces.set(sessionID, freeIndex)
    return freeIndex
  }

  private releaseFace(sessionID: string) {
    const faceIndex = this.sessionFaces.get(sessionID)
    if (faceIndex === undefined) return undefined

    this.sessionFaces.delete(sessionID)
    this.faceOwners[faceIndex] = undefined
    return faceIndex
  }

  private hasBusyOrRetrySession(openCodeState: OpenCodeState) {
    for (const session of openCodeState.sessions.values()) {
      if (this.isBusyOrRetry(session.status)) return true
    }
    return false
  }
}
