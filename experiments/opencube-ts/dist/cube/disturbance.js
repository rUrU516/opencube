"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.DisturbancePool = void 0;
const angular_damping_1 = require("./disturbances/angular-damping");
const particle_emitter_1 = require("./disturbances/particle-emitter");
const particle_fade_1 = require("./disturbances/particle-fade");
const random_angular_kick_1 = require("./disturbances/random-angular-kick");
class DisturbancePool {
    disturbances;
    constructor(disturbances = []) {
        this.disturbances = [
            {
                id: "global:random-angular-kick",
                disturbance: new random_angular_kick_1.RandomAngularKickDisturbance({
                    interval: 4,
                    strength: { x: 80, y: 80, z: 80 },
                }),
            },
            { id: "global:base-damping", disturbance: new angular_damping_1.AngularDampingDisturbance(2.0) },
            { id: "global:particle-fade", disturbance: new particle_fade_1.ParticleFadeDisturbance({ fadeStartDistance: 0.7, maxDistance: 2.6 }) },
            { id: "test:face-0-particle-emitter", disturbance: new particle_emitter_1.ParticleEmitterDisturbance({ faceIndex: 0 }) },
            ...disturbances.map((disturbance) => ({ disturbance })),
        ];
    }
    add(disturbance, id) {
        if (id)
            this.markDone(id);
        this.disturbances.push({ id, disturbance });
    }
    markDone(id) {
        for (const entry of this.disturbances) {
            if (entry.id === id)
                entry.disturbance.done = true;
        }
    }
    apply(state, dt) {
        for (const entry of this.disturbances) {
            if (entry.disturbance.done)
                continue;
            entry.disturbance.apply(state, dt);
        }
        this.disturbances = this.disturbances.filter((entry) => !entry.disturbance.done);
    }
}
exports.DisturbancePool = DisturbancePool;
