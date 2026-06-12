"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.runPluginUpgrade = runPluginUpgrade;
const node_child_process_1 = require("node:child_process");
const DEFAULT_UPGRADE_TIMEOUT_MS = 120_000;
async function emitLine(onLine, line) {
    if (!onLine || line.length === 0)
        return;
    await onLine(line);
}
function createLineEmitter(prefix, onLine) {
    let pending = "";
    return {
        async write(chunk) {
            pending += chunk.toString();
            const lines = pending.split(/\r?\n/);
            pending = lines.pop() ?? "";
            for (const line of lines) {
                await emitLine(onLine, `${prefix}${line}`);
            }
        },
        async flush() {
            if (pending.length === 0)
                return;
            await emitLine(onLine, `${prefix}${pending}`);
            pending = "";
        },
    };
}
async function runPluginUpgrade({ packageName, version, timeoutMs = DEFAULT_UPGRADE_TIMEOUT_MS, onLine }) {
    const command = "opencode";
    const args = ["plugin", `${packageName}@${version}`, "--global", "--force"];
    const stdout = createLineEmitter("upgrade stdout: ", onLine);
    const stderr = createLineEmitter("upgrade stderr: ", onLine);
    await emitLine(onLine, `upgrade command: ${command} ${args.join(" ")}`);
    return new Promise((resolve, reject) => {
        let timedOut = false;
        let settled = false;
        const child = (0, node_child_process_1.spawn)(command, args, {
            stdio: ["ignore", "pipe", "pipe"],
        });
        const finish = async (result) => {
            if (settled)
                return;
            settled = true;
            clearTimeout(timer);
            try {
                await stdout.flush();
                await stderr.flush();
                resolve(result);
            }
            catch (error) {
                reject(error);
            }
        };
        const timer = setTimeout(() => {
            timedOut = true;
            child.kill("SIGTERM");
        }, timeoutMs);
        child.stdout?.on("data", (chunk) => {
            stdout.write(chunk).catch(reject);
        });
        child.stderr?.on("data", (chunk) => {
            stderr.write(chunk).catch(reject);
        });
        child.on("error", (error) => {
            if (settled)
                return;
            settled = true;
            clearTimeout(timer);
            if (error?.code === "ENOENT") {
                reject(new Error("Unable to find the opencode CLI in PATH."));
                return;
            }
            reject(error);
        });
        child.on("close", (exitCode, signal) => {
            finish({ command, args, exitCode, signal, timedOut }).catch(reject);
        });
    });
}
