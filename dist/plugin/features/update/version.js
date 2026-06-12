"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.getCurrentVersion = getCurrentVersion;
const promises_1 = require("node:fs/promises");
const path = require("node:path");
async function readPackageJson(filePath) {
    try {
        return JSON.parse(await (0, promises_1.readFile)(filePath, "utf8"));
    }
    catch (error) {
        if (error?.code === "ENOENT" || error instanceof SyntaxError)
            return undefined;
        throw error;
    }
}
async function findNearestPackageJson(startDir) {
    let currentDir = startDir;
    while (true) {
        const candidate = path.join(currentDir, "package.json");
        const packageJson = await readPackageJson(candidate);
        if (packageJson?.version)
            return { path: candidate, packageJson };
        const parentDir = path.dirname(currentDir);
        if (parentDir === currentDir)
            return undefined;
        currentDir = parentDir;
    }
}
async function getCurrentVersion(startDir = __dirname) {
    const found = await findNearestPackageJson(startDir);
    const version = found?.packageJson.version;
    if (!found || typeof version !== "string" || version.length === 0) {
        throw new Error("Unable to read OpenCube package version.");
    }
    return {
        name: typeof found.packageJson.name === "string" && found.packageJson.name.length > 0 ? found.packageJson.name : "opencube",
        version,
        packageJsonPath: found.path,
    };
}
