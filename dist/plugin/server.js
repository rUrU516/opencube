"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.id = void 0;
exports.server = server;
const electron_bridge_1 = require("./electron-bridge");
const compare_1 = require("./features/update/compare");
const registry_1 = require("./features/update/registry");
const version_1 = require("./features/update/version");
const COMMAND_HANDLED_SENTINEL = "__OPENCODE_PET_COMMAND_HANDLED__";
function handled() {
    throw new Error(COMMAND_HANDLED_SENTINEL);
}
function delay(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
}
function textOfArguments(args) {
    if (typeof args === "string")
        return args.trim().toLowerCase();
    if (Array.isArray(args))
        return args.join(" ").trim().toLowerCase();
    if (args == null)
        return "";
    return String(args).trim().toLowerCase();
}
function parseDragBorderVisibility(args) {
    const raw = textOfArguments(args);
    if (/\b(show|on|visible|true|1)\b/.test(raw))
        return true;
    if (/\b(hide|off|hidden|false|0)\b/.test(raw))
        return false;
    return undefined;
}
async function injectNotice(client, sessionID, text) {
    if (!sessionID || !client?.session?.prompt)
        return;
    try {
        await client.session.prompt({
            path: { id: sessionID },
            body: {
                noReply: true,
                parts: [{ type: "text", text, ignored: true }],
            },
        });
    }
    catch {
        // Best-effort only. The test command should still be treated as handled.
    }
}
exports.id = "opencube";
async function server({ client }) {
    const handledCommands = new Set(["pet", "pet_stop", "pet_restart", "pet_say_hello", "pet_update", "pet_upgrade", "pet-drag-border", "pet_drag_border", "pet_test"]);
    return {
        config: async (cfg) => {
            cfg.command ??= {};
            cfg.command.pet = {
                template: "/pet",
                description: "Start or show the desktop OpenCube pet without sending anything to the agent.",
            };
            cfg.command.pet_stop = {
                template: "/pet_stop",
                description: "Quit the desktop OpenCube pet without sending anything to the agent.",
            };
            cfg.command.pet_restart = {
                template: "/pet_restart",
                description: "Restart the desktop OpenCube pet.",
            };
            cfg.command.pet_say_hello = {
                template: "/pet_say_hello",
                description: "Send a hello test event to OpenCube.",
            };
            cfg.command.pet_update = {
                template: "/pet_update",
                description: "Check npm for a newer OpenCube version.",
            };
            cfg.command.pet_upgrade = {
                template: "/pet_upgrade",
                description: "Alias for /pet_update.",
            };
            cfg.command["pet-drag-border"] = {
                template: "/pet-drag-border",
                description: "Show/hide/toggle the OpenCube drag handle border, e.g. /pet-drag-border hide.",
            };
            cfg.command.pet_drag_border = {
                template: "/pet_drag_border",
                description: "Alias for /pet-drag-border.",
            };
            cfg.command.pet_test = {
                template: "/pet_test",
                description: "Send a minimal test notice from the OpenCube plugin.",
            };
        },
        "command.execute.before": async (input) => {
            if (!handledCommands.has(input.command))
                return;
            if (input.command === "pet_test") {
                await injectNotice(client, input.sessionID, "◈ OpenCube plugin is alive.");
            }
            if (input.command === "pet") {
                const health = await (0, electron_bridge_1.showPet)({
                    onProgress: (message) => injectNotice(client, input.sessionID, message),
                });
                await injectNotice(client, input.sessionID, health ? "◈ OpenCube started the pet." : "◈ OpenCube asked the pet to start; it may still be warming up.");
            }
            if (input.command === "pet_stop") {
                const stopped = await (0, electron_bridge_1.quitPet)();
                await injectNotice(client, input.sessionID, stopped ? "◌ OpenCube stopped the pet." : "◌ OpenCube pet was not running.");
            }
            if (input.command === "pet_restart") {
                await (0, electron_bridge_1.quitPet)();
                await delay(300);
                const health = await (0, electron_bridge_1.showPet)({
                    onProgress: (message) => injectNotice(client, input.sessionID, message),
                });
                await injectNotice(client, input.sessionID, health ? "↻ OpenCube restarted the pet." : "↻ OpenCube restarted the pet; it may still be warming up.");
            }
            if (input.command === "pet_say_hello") {
                const result = await (0, electron_bridge_1.sendEvent)({
                    type: "hello",
                    sessionID: input.sessionID,
                });
                await injectNotice(client, input.sessionID, result ? "✦ OpenCube sent hello." : "☾ OpenCube is sleeping. Start it with /pet first.");
            }
            if (input.command === "pet_update" || input.command === "pet_upgrade") {
                await injectNotice(client, input.sessionID, "↻ OpenCube: checking updates...");
                try {
                    const current = await (0, version_1.getCurrentVersion)();
                    await injectNotice(client, input.sessionID, `OpenCube current version: v${current.version}`);
                    try {
                        const latest = await (0, registry_1.getLatestNpmVersion)(current.name);
                        await injectNotice(client, input.sessionID, `OpenCube latest npm version: v${latest.version}`);
                        const comparison = (0, compare_1.compareVersions)(current.version, latest.version);
                        if (comparison === 0) {
                            await injectNotice(client, input.sessionID, "OpenCube is up to date.");
                        }
                        if (comparison > 0) {
                            await injectNotice(client, input.sessionID, "OpenCube is newer than npm latest. This looks like a local/dev build.");
                        }
                    }
                    catch {
                        await injectNotice(client, input.sessionID, "OpenCube latest npm version: unknown");
                    }
                }
                catch {
                    await injectNotice(client, input.sessionID, "OpenCube current version: unknown");
                }
            }
            if (input.command === "pet-drag-border" || input.command === "pet_drag_border") {
                const visible = parseDragBorderVisibility(input.arguments);
                const result = await (0, electron_bridge_1.setDragBorder)(visible);
                await injectNotice(client, input.sessionID, result ? `▣ OpenCube drag border ${result.visible ? "shown" : "hidden"}.` : "☾ OpenCube is sleeping. Start it with /pet first.");
            }
            handled();
        },
        event: async ({ event }) => {
            if (event.type === "permission.asked") {
                const permission = event.properties || {};
                await (0, electron_bridge_1.sendEvent)({
                    type: "permission.ask",
                    sessionID: permission.sessionID,
                    requestID: permission.id,
                    permission: permission.permission,
                });
                return;
            }
            if (event.type === "permission.replied") {
                const permission = event.properties || {};
                await (0, electron_bridge_1.sendEvent)({
                    type: "permission.reply",
                    sessionID: permission.sessionID,
                    requestID: permission.requestID,
                    reply: permission.reply,
                });
                return;
            }
            if (event.type === "question.asked") {
                const question = event.properties || {};
                await (0, electron_bridge_1.sendEvent)({
                    type: "question.ask",
                    sessionID: question.sessionID,
                    requestID: question.id,
                    questionCount: Array.isArray(question.questions) ? question.questions.length : undefined,
                });
                return;
            }
            if (event.type === "question.replied") {
                const question = event.properties || {};
                await (0, electron_bridge_1.sendEvent)({
                    type: "question.reply",
                    sessionID: question.sessionID,
                    requestID: question.requestID,
                });
                return;
            }
            if (event.type === "question.rejected") {
                const question = event.properties || {};
                await (0, electron_bridge_1.sendEvent)({
                    type: "question.reject",
                    sessionID: question.sessionID,
                    requestID: question.requestID,
                });
                return;
            }
            if (event.type === "session.status") {
                const status = event.properties?.status?.type;
                if (status !== "busy" && status !== "retry" && status !== "idle")
                    return;
                await (0, electron_bridge_1.sendEvent)({
                    type: status,
                    sessionID: event.properties?.sessionID,
                });
            }
        },
        "tool.execute.before": async (input, output) => {
            await (0, electron_bridge_1.sendEvent)({
                type: "tool.start",
                sessionID: input.sessionID,
                tool: input.tool,
                callID: input.callID,
            });
        },
        "tool.execute.after": async (input, output) => {
            await (0, electron_bridge_1.sendEvent)({
                type: "tool.finish",
                sessionID: input.sessionID,
                tool: input.tool,
                callID: input.callID,
            });
        },
    };
}
exports.default = { id: exports.id, server };
