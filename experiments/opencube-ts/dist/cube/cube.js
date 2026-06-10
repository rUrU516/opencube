"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.Cube = void 0;
const disturbance_1 = require("./disturbance");
const iterator_1 = require("./iterator");
class Cube {
    state;
    disturbancePool;
    iterator;
    constructor(state) {
        this.state = state;
        this.disturbancePool = new disturbance_1.DisturbancePool();
        this.iterator = new iterator_1.CubeIterator(this.state, this.disturbancePool);
    }
    addDisturbance(disturbance, id) {
        this.disturbancePool.add(disturbance, id);
    }
    markDisturbanceDone(id) {
        this.disturbancePool.markDone(id);
    }
    tick(dt) {
        this.iterator.step(dt);
    }
    snapshot() {
        return {
            rotation: this.state.rotation,
            angularVelocity: this.state.angularVelocity,
            faces: this.state.faces,
            particles: this.state.particles,
        };
    }
}
exports.Cube = Cube;
