"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.OpenCubeEngine = void 0;
const cube_1 = require("../cube/cube");
const state_1 = require("../cube/state");
const state_2 = require("../opencode/state");
class OpenCubeEngine {
    opencodeState;
    cube;
    constructor() {
        this.opencodeState = new state_2.OpenCodeState();
        this.cube = new cube_1.Cube(new state_1.CubeState({
            rotation: { x: -14, y: -28, z: 0 },
            angularVelocity: { x: 0, y: 0, z: 0 },
            faces: Array.from({ length: 6 }, () => ({
                color: { r: 255, g: 255, b: 255 },
                brightness: 1,
            })),
            particles: [],
        }));
    }
    applyEvent(event) {
        return this.opencodeState.applyEvent(event);
    }
    tick(dt) {
        this.cube.tick(dt);
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
        };
    }
}
exports.OpenCubeEngine = OpenCubeEngine;
