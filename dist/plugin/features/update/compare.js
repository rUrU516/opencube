"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.compareVersions = compareVersions;
function parseVersionParts(version) {
    return version
        .replace(/^v/i, "")
        .split(/[.-]/)
        .map((part) => {
        const parsed = Number.parseInt(part, 10);
        return Number.isFinite(parsed) ? parsed : 0;
    });
}
function compareVersions(left, right) {
    const leftParts = parseVersionParts(left);
    const rightParts = parseVersionParts(right);
    const maxLength = Math.max(leftParts.length, rightParts.length);
    for (let index = 0; index < maxLength; index += 1) {
        const leftPart = leftParts[index] ?? 0;
        const rightPart = rightParts[index] ?? 0;
        if (leftPart > rightPart)
            return 1;
        if (leftPart < rightPart)
            return -1;
    }
    return 0;
}
