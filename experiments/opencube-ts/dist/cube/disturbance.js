"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.DisturbancePool = void 0;
const angular_damping_1 = require("./disturbances/angular-damping");
const random_angular_kick_1 = require("./disturbances/random-angular-kick");
class DisturbancePool {
    disturbances;
    constructor(disturbances = []) {
        this.disturbances = [
            new random_angular_kick_1.RandomAngularKickDisturbance({
                interval: 4,
                strength: { x: 80, y: 80, z: 80 },
            }),
            new angular_damping_1.AngularDampingDisturbance(2.0),
            ...disturbances,
        ];
    }
    add(disturbance) {
        this.disturbances.push(disturbance);
    }
    apply(state, dt) {
        for (const disturbance of this.disturbances) {
            disturbance.apply(state, dt);
        }
        this.disturbances = this.disturbances.filter((disturbance) => !disturbance.done);
    }
}
exports.DisturbancePool = DisturbancePool;
