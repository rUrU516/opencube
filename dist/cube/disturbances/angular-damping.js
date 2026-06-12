"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.AngularDampingDisturbance = void 0;
class AngularDampingDisturbance {
    damping;
    /**
     * Positive damping slows angularVelocity down.
     * Negative damping amplifies angularVelocity and can be used as a busy-state boost.
     * Keep negative damping magnitude smaller than the base positive damping.
     */
    constructor(damping = 2.0) {
        this.damping = damping;
    }
    apply(state, dt) {
        const factor = Math.exp(-this.damping * dt);
        state.angularVelocity.x *= factor;
        state.angularVelocity.y *= factor;
        state.angularVelocity.z *= factor;
    }
}
exports.AngularDampingDisturbance = AngularDampingDisturbance;
