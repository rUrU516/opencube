"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.FaceLightUpDisturbance = void 0;
function randomColor() {
    return {
        r: Math.round(80 + Math.random() * 175),
        g: Math.round(80 + Math.random() * 175),
        b: Math.round(80 + Math.random() * 175),
    };
}
class FaceLightUpDisturbance {
    faceIndex;
    color;
    done;
    constructor(options) {
        this.faceIndex = options.faceIndex;
        this.color = randomColor();
        this.done = false;
    }
    apply(state) {
        const face = state.faces[this.faceIndex];
        if (!face) {
            this.done = true;
            return;
        }
        face.color = this.color;
        face.brightness = 1;
        this.done = true;
    }
}
exports.FaceLightUpDisturbance = FaceLightUpDisturbance;
