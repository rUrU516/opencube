"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.ParticleEmitterDisturbance = void 0;
const FACE_NORMALS = [
    { x: 0, y: 0, z: 1 },
    { x: 0, y: 0, z: -1 },
    { x: 1, y: 0, z: 0 },
    { x: -1, y: 0, z: 0 },
    { x: 0, y: 1, z: 0 },
    { x: 0, y: -1, z: 0 },
];
function randomBetween(min, max) {
    return min + Math.random() * (max - min);
}
function normalize(vector) {
    const length = Math.sqrt(vector.x * vector.x + vector.y * vector.y + vector.z * vector.z) || 1;
    return { x: vector.x / length, y: vector.y / length, z: vector.z / length };
}
function cross(a, b) {
    return {
        x: a.y * b.z - a.z * b.y,
        y: a.z * b.x - a.x * b.z,
        z: a.x * b.y - a.y * b.x,
    };
}
function add(a, b) {
    return { x: a.x + b.x, y: a.y + b.y, z: a.z + b.z };
}
function scale(vector, value) {
    return { x: vector.x * value, y: vector.y * value, z: vector.z * value };
}
function coneDirection(normal, spread = 0.34) {
    const basisSeed = Math.abs(normal.y) < 0.9 ? { x: 0, y: 1, z: 0 } : { x: 1, y: 0, z: 0 };
    const tangentA = normalize(cross(normal, basisSeed));
    const tangentB = normalize(cross(normal, tangentA));
    const angle = randomBetween(0, Math.PI * 2);
    const radius = randomBetween(0, spread);
    return normalize(add(normal, add(scale(tangentA, Math.cos(angle) * radius), scale(tangentB, Math.sin(angle) * radius))));
}
function rotateVector(vector, rotation) {
    const xRad = rotation.x * Math.PI / 180;
    const yRad = rotation.y * Math.PI / 180;
    const zRad = rotation.z * Math.PI / 180;
    const a = Math.cos(xRad);
    const b = Math.sin(xRad);
    const c = Math.cos(yRad);
    const d = Math.sin(yRad);
    const e = Math.cos(zRad);
    const f = Math.sin(zRad);
    const { x, y, z } = vector;
    // Match Three.js Euler default order: XYZ.
    return {
        x: c * e * x - c * f * y + d * z,
        y: (a * f + b * e * d) * x + (a * e - b * f * d) * y - b * c * z,
        z: (b * f - a * e * d) * x + (b * e + a * f * d) * y + a * c * z,
    };
}
class ParticleEmitterDisturbance {
    faceIndex;
    rate;
    speed;
    color;
    accumulator;
    constructor(options) {
        this.faceIndex = options.faceIndex;
        this.rate = options.rate ?? 7;
        this.speed = options.speed ?? 4.2;
        this.color = options.color;
        this.accumulator = 0;
    }
    apply(state, dt) {
        const localNormal = FACE_NORMALS[this.faceIndex];
        if (!localNormal)
            return;
        const normal = rotateVector(localNormal, state.rotation);
        this.accumulator += this.rate * dt;
        while (this.accumulator >= 1) {
            this.accumulator -= 1;
            const direction = coneDirection(normal);
            state.particles.push({
                position: {
                    x: normal.x * 0.38,
                    y: normal.y * 0.38,
                    z: normal.z * 0.38,
                },
                velocity: {
                    x: direction.x * this.speed,
                    y: direction.y * this.speed,
                    z: direction.z * this.speed,
                },
                color: this.color,
                alpha: 1,
                size: randomBetween(0.16, 0.26),
            });
        }
    }
}
exports.ParticleEmitterDisturbance = ParticleEmitterDisturbance;
