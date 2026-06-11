"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.CubeEffectController = void 0;
const angular_damping_1 = require("../cube/disturbances/angular-damping");
const face_dim_1 = require("../cube/disturbances/face-dim");
const face_light_up_1 = require("../cube/disturbances/face-light-up");
const particle_emitter_1 = require("../cube/disturbances/particle-emitter");
const BUSY_DAMPING_REDUCTION_ID = "global:busy-damping-reduction";
const FACE_COUNT = 6;
function randomBetween(min, max) {
    return min + Math.random() * (max - min);
}
function randomOwnershipColor() {
    const channels = [Math.round(randomBetween(30, 190)), Math.round(randomBetween(30, 190)), Math.round(randomBetween(30, 190))];
    const hot = Math.floor(randomBetween(0, 3));
    channels[hot] = Math.round(randomBetween(190, 235));
    channels[(hot + 1) % 3] = Math.max(channels[(hot + 1) % 3], Math.round(randomBetween(105, 200)));
    return { r: channels[0], g: channels[1], b: channels[2] };
}
class CubeEffectController {
    cube;
    faceOwners;
    faceColors;
    sessionFaces;
    toolParticleDisturbanceIDs;
    constructor(cube) {
        this.cube = cube;
        this.faceOwners = Array.from({ length: FACE_COUNT });
        this.faceColors = Array.from({ length: FACE_COUNT });
        this.sessionFaces = new Map();
        this.toolParticleDisturbanceIDs = new Map();
    }
    sync(openCodeState, event) {
        const previousStatus = this.getSessionStatus(openCodeState, event.sessionID);
        if ((event.type === "session.busy" || event.type === "session.retry") && !this.isBusyOrRetry(previousStatus)) {
            const faceIndex = this.acquireFace(event.sessionID);
            if (faceIndex !== undefined)
                this.cube.addDisturbance(new face_light_up_1.FaceLightUpDisturbance({ faceIndex, color: this.getFaceColor(faceIndex) }));
            if (!this.hasBusyOrRetrySession(openCodeState)) {
                this.cube.addDisturbance(new angular_damping_1.AngularDampingDisturbance(-1.85), BUSY_DAMPING_REDUCTION_ID);
            }
            return;
        }
        if (event.type === "session.idle" && this.isBusyOrRetry(previousStatus)) {
            const faceIndex = this.releaseFace(event.sessionID);
            if (faceIndex !== undefined) {
                this.stopToolParticles(event.sessionID, faceIndex);
                this.cube.addDisturbance(new face_dim_1.FaceDimDisturbance({ faceIndex, brightness: 0 }));
            }
            if (!this.hasOtherBusyOrRetrySession(openCodeState, event.sessionID)) {
                this.cube.markDisturbanceDone(BUSY_DAMPING_REDUCTION_ID);
            }
            return;
        }
        if (event.type === "tool.start") {
            this.startToolParticles(openCodeState, event.sessionID);
            return;
        }
        if (event.type === "tool.finish") {
            this.stopToolParticlesIfLastTool(openCodeState, event.sessionID, event.callID);
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
        this.faceColors[freeIndex] = randomOwnershipColor();
        this.sessionFaces.set(sessionID, freeIndex);
        return freeIndex;
    }
    releaseFace(sessionID) {
        const faceIndex = this.sessionFaces.get(sessionID);
        if (faceIndex === undefined)
            return undefined;
        this.sessionFaces.delete(sessionID);
        this.faceOwners[faceIndex] = undefined;
        this.faceColors[faceIndex] = undefined;
        return faceIndex;
    }
    getFaceColor(faceIndex) {
        const existing = this.faceColors[faceIndex];
        if (existing)
            return existing;
        const color = randomOwnershipColor();
        this.faceColors[faceIndex] = color;
        return color;
    }
    getSessionFace(sessionID) {
        return this.sessionFaces.get(sessionID);
    }
    toolParticleDisturbanceID(sessionID, faceIndex) {
        return `session:${sessionID}:face:${faceIndex}:tool-particles`;
    }
    startToolParticles(openCodeState, sessionID) {
        const session = openCodeState.sessions.get(sessionID);
        if (!session || session.activeTools.size > 0)
            return;
        const faceIndex = this.getSessionFace(sessionID);
        if (faceIndex === undefined)
            return;
        const id = this.toolParticleDisturbanceID(sessionID, faceIndex);
        this.toolParticleDisturbanceIDs.set(sessionID, id);
        this.cube.addDisturbance(new particle_emitter_1.ParticleEmitterDisturbance({ faceIndex, color: this.getFaceColor(faceIndex) }), id);
    }
    stopToolParticlesIfLastTool(openCodeState, sessionID, callID) {
        const session = openCodeState.sessions.get(sessionID);
        if (!session || !session.activeTools.has(callID) || session.activeTools.size > 1)
            return;
        const faceIndex = this.getSessionFace(sessionID);
        if (faceIndex === undefined)
            return;
        const id = this.toolParticleDisturbanceIDs.get(sessionID) || this.toolParticleDisturbanceID(sessionID, faceIndex);
        this.stopToolParticles(sessionID, faceIndex, id);
    }
    stopToolParticles(sessionID, faceIndex, id = this.toolParticleDisturbanceIDs.get(sessionID) || this.toolParticleDisturbanceID(sessionID, faceIndex)) {
        this.cube.markDisturbanceDone(id);
        this.toolParticleDisturbanceIDs.delete(sessionID);
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
