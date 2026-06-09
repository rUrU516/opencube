import { Cube } from "../cube/cube"
import { CubeState } from "../cube/state"
import { OpenCodeEvent, OpenCodeState } from "../opencode/state"

export class OpenCubeEngine {
  opencodeState: OpenCodeState
  cube: Cube

  constructor() {
    this.opencodeState = new OpenCodeState()
    this.cube = new Cube(new CubeState({
      rotation: { x: -14, y: -28, z: 0 },
      angularVelocity: { x: 0, y: 0, z: 0 },
      faces: Array.from({ length: 6 }, () => ({
        color: { r: 255, g: 255, b: 255 },
        brightness: 1,
      })),
      particles: [],
    }))
  }

  applyEvent(event: OpenCodeEvent) {
    return this.opencodeState.applyEvent(event)
  }

  tick(dt: number) {
    this.cube.tick(dt)
  }

  snapshot() {
    return {
      cube: this.cube.snapshot(),
      opencode: {
        sessions: Array.from(this.opencodeState.sessions.values()).map((session) => ({
          sessionID: session.sessionID,
          status: session.status,
          activeTools: Array.from(session.activeTools),
          pendingPermissions: Array.from(session.pendingPermissions),
          pendingQuestions: Array.from(session.pendingQuestions),
        })),
      },
    }
  }
}
