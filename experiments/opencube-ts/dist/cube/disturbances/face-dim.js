"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.FaceDimDisturbance = void 0;
class FaceDimDisturbance {
    faceIndex;
    brightness;
    done;
    constructor(options) {
        this.faceIndex = options.faceIndex;
        this.brightness = options.brightness;
        this.done = false;
    }
    apply(state) {
        const face = state.faces[this.faceIndex];
        if (!face) {
            this.done = true;
            return;
        }
        face.brightness = this.brightness;
        this.done = true;
    }
}
exports.FaceDimDisturbance = FaceDimDisturbance;
