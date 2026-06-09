"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.CubeIterator = void 0;
const disturbance_1 = require("./disturbance");
class CubeIterator {
    state;
    disturbancePool;
    constructor(state, disturbancePool = new disturbance_1.DisturbancePool()) {
        this.state = state;
        this.disturbancePool = disturbancePool;
    }
    /**
     * Advance CubeState by one frame.
     *
     * Disturbances are applied before natural integration:
     * - disturbances can change velocity, face brightness, particles, etc.
     * - rotation moves by angularVelocity
     * - particles move by velocity
     *
     * Damping, pruning, and bounds handling will be layered here later.
     */
    step(dt) {
        this.disturbancePool.apply(this.state, dt);
        this.state.rotation.x += this.state.angularVelocity.x * dt;
        this.state.rotation.y += this.state.angularVelocity.y * dt;
        this.state.rotation.z += this.state.angularVelocity.z * dt;
        for (const particle of this.state.particles) {
            particle.position.x += particle.velocity.x * dt;
            particle.position.y += particle.velocity.y * dt;
            particle.position.z += particle.velocity.z * dt;
        }
    }
}
exports.CubeIterator = CubeIterator;
