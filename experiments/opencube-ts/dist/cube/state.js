"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.CubeState = void 0;
class CubeState {
    rotation;
    angularVelocity;
    faces;
    particles;
    constructor(state) {
        this.rotation = state.rotation;
        this.angularVelocity = state.angularVelocity;
        this.faces = state.faces;
        this.particles = state.particles;
    }
}
exports.CubeState = CubeState;
