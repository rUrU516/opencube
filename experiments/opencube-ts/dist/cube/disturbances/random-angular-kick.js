"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.RandomAngularKickDisturbance = void 0;
function randomBetween(min, max) {
    return min + Math.random() * (max - min);
}
function randomDirection(strength) {
    return {
        x: randomBetween(-strength.x, strength.x),
        y: randomBetween(-strength.y, strength.y),
        z: randomBetween(-strength.z, strength.z),
    };
}
class RandomAngularKickDisturbance {
    interval;
    strength;
    elapsed;
    kickDirection;
    constructor(options) {
        this.interval = options.interval;
        this.strength = options.strength;
        this.elapsed = 0;
        this.kickDirection = randomDirection(this.strength);
    }
    apply(state, dt) {
        this.elapsed += dt;
        if (this.elapsed >= this.interval) {
            this.elapsed = 0;
            this.kickDirection = randomDirection(this.strength);
        }
        state.angularVelocity.x += this.kickDirection.x * dt;
        state.angularVelocity.y += this.kickDirection.y * dt;
        state.angularVelocity.z += this.kickDirection.z * dt;
    }
}
exports.RandomAngularKickDisturbance = RandomAngularKickDisturbance;
