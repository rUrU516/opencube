"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.ParticleFadeDisturbance = void 0;
class ParticleFadeDisturbance {
    fadeStartDistance;
    maxDistance;
    constructor(options = {}) {
        this.fadeStartDistance = options.fadeStartDistance ?? 1.2;
        this.maxDistance = options.maxDistance ?? 3;
    }
    apply(state) {
        state.particles = state.particles.filter((particle) => {
            const { x, y, z } = particle.position;
            const distance = Math.sqrt(x * x + y * y + z * z);
            if (distance >= this.maxDistance)
                return false;
            if (distance <= this.fadeStartDistance) {
                particle.alpha = 1;
            }
            else {
                const fadeRange = Math.max(0.001, this.maxDistance - this.fadeStartDistance);
                particle.alpha = Math.max(0, 1 - (distance - this.fadeStartDistance) / fadeRange);
            }
            return particle.alpha > 0;
        });
    }
}
exports.ParticleFadeDisturbance = ParticleFadeDisturbance;
