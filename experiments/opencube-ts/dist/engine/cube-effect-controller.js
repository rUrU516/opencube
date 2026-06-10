"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.CubeEffectController = void 0;
const angular_damping_1 = require("../cube/disturbances/angular-damping");
const face_dim_1 = require("../cube/disturbances/face-dim");
const face_light_up_1 = require("../cube/disturbances/face-light-up");
const BUSY_DAMPING_REDUCTION_ID = "global:busy-damping-reduction";
const FACE_COUNT = 6;
class CubeEffectController {
    cube;
    faceOwners;
    sessionFaces;
    constructor(cube) {
        this.cube = cube;
        this.faceOwners = Array.from({ length: FACE_COUNT });
        this.sessionFaces = new Map();
    }
    sync(openCodeState, event) {
        const previousStatus = this.getSessionStatus(openCodeState, event.sessionID);
        if ((event.type === "session.busy" || event.type === "session.retry") && !this.isBusyOrRetry(previousStatus)) {
            const faceIndex = this.acquireFace(event.sessionID);
            if (faceIndex !== undefined)
                this.cube.addDisturbance(new face_light_up_1.FaceLightUpDisturbance({ faceIndex }));
            if (!this.hasBusyOrRetrySession(openCodeState)) {
                this.cube.addDisturbance(new angular_damping_1.AngularDampingDisturbance(-1.85), BUSY_DAMPING_REDUCTION_ID);
            }
            return;
        }
        if (event.type === "session.idle" && this.isBusyOrRetry(previousStatus)) {
            const faceIndex = this.releaseFace(event.sessionID);
            if (faceIndex !== undefined)
                this.cube.addDisturbance(new face_dim_1.FaceDimDisturbance({ faceIndex, brightness: 0 }));
            if (!this.hasOtherBusyOrRetrySession(openCodeState, event.sessionID)) {
                this.cube.markDisturbanceDone(BUSY_DAMPING_REDUCTION_ID);
            }
            return;
        }
    }
    getSessionStatus(openCodeState, sessionID) {
        return openCodeState.sessions.get(sessionID)?.status || "idle";
    }
    isBusyOrRetry(status) {
        return status === "busy" || status === "retry";
    }
    hasOtherBusyOrRetrySession(openCodeState, excludedSessionID) {
        for (const session of openCodeState.sessions.values()) {
            if (session.sessionID === excludedSessionID)
                continue;
            if (this.isBusyOrRetry(session.status))
                return true;
        }
        return false;
    }
    acquireFace(sessionID) {
        const existing = this.sessionFaces.get(sessionID);
        if (existing !== undefined)
            return existing;
        const freeIndex = this.faceOwners.findIndex((owner) => owner === undefined);
        if (freeIndex === -1)
            return undefined;
        this.faceOwners[freeIndex] = sessionID;
        this.sessionFaces.set(sessionID, freeIndex);
        return freeIndex;
    }
    releaseFace(sessionID) {
        const faceIndex = this.sessionFaces.get(sessionID);
        if (faceIndex === undefined)
            return undefined;
        this.sessionFaces.delete(sessionID);
        this.faceOwners[faceIndex] = undefined;
        return faceIndex;
    }
    hasBusyOrRetrySession(openCodeState) {
        for (const session of openCodeState.sessions.values()) {
            if (this.isBusyOrRetry(session.status))
                return true;
        }
        return false;
    }
}
exports.CubeEffectController = CubeEffectController;
