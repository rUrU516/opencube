"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.id = void 0;
exports.server = server;
const electron_bridge_1 = require("./electron-bridge");
const COMMAND_HANDLED_SENTINEL = "__OPENCUBE_TS_TEST_COMMAND_HANDLED__";
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
exports.id = "opencube-ts-test";
async function server({ client }) {
    const handledCommands = new Set(["opencube-ts-test", "opencube-ts-pet", "opencube-ts-stop", "opencube-ts-restart", "opencube-ts-hello", "opencube-ts-drag-border"]);
    return {
        config: async (cfg) => {
            cfg.command ??= {};
            cfg.command["opencube-ts-test"] = {
                template: "/opencube-ts-test",
                description: "Send a minimal test notice from the experimental TypeScript OpenCube plugin.",
            };
            cfg.command["opencube-ts-pet"] = {
                template: "/opencube-ts-pet",
                description: "Start or show the desktop OpenCube pet from the TypeScript experiment plugin.",
            };
            cfg.command["opencube-ts-stop"] = {
                template: "/opencube-ts-stop",
                description: "Quit the desktop OpenCube pet from the TypeScript experiment plugin.",
            };
            cfg.command["opencube-ts-restart"] = {
                template: "/opencube-ts-restart",
                description: "Restart the desktop OpenCube pet from the TypeScript experiment plugin.",
            };
            cfg.command["opencube-ts-hello"] = {
                template: "/opencube-ts-hello",
                description: "Send a hello event to OpenCube from the TypeScript experiment plugin.",
            };
            cfg.command["opencube-ts-drag-border"] = {
                template: "/opencube-ts-drag-border",
                description: "Show/hide/toggle the OpenCube TS drag handle border, e.g. /opencube-ts-drag-border hide.",
            };
        },
        "command.execute.before": async (input) => {
            if (!handledCommands.has(input.command))
                return;
            if (input.command === "opencube-ts-test") {
                await injectNotice(client, input.sessionID, "◈ OpenCube TS experiment plugin is alive.");
            }
            if (input.command === "opencube-ts-pet") {
                const health = await (0, electron_bridge_1.showPet)();
                await injectNotice(client, input.sessionID, health ? "◈ OpenCube TS experiment started the pet." : "◈ OpenCube TS experiment asked the pet to start; it may still be warming up.");
            }
            if (input.command === "opencube-ts-stop") {
                const stopped = await (0, electron_bridge_1.quitPet)();
                await injectNotice(client, input.sessionID, stopped ? "◌ OpenCube TS experiment stopped the pet." : "◌ OpenCube pet was not running.");
            }
            if (input.command === "opencube-ts-restart") {
                await (0, electron_bridge_1.quitPet)();
                await delay(300);
                const health = await (0, electron_bridge_1.showPet)();
                await injectNotice(client, input.sessionID, health ? "↻ OpenCube TS experiment restarted the pet." : "↻ OpenCube TS experiment restarted the pet; it may still be warming up.");
            }
            if (input.command === "opencube-ts-hello") {
                const result = await (0, electron_bridge_1.sendEvent)({
                    type: "hello",
                    sessionID: input.sessionID,
                });
                await injectNotice(client, input.sessionID, result ? "✦ OpenCube TS experiment sent hello." : "☾ OpenCube is sleeping. Start it with /opencube-ts-pet first.");
            }
            if (input.command === "opencube-ts-drag-border") {
                const visible = parseDragBorderVisibility(input.arguments);
                const result = await (0, electron_bridge_1.setDragBorder)(visible);
                await injectNotice(client, input.sessionID, result ? `▣ OpenCube TS drag border ${result.visible ? "shown" : "hidden"}.` : "☾ OpenCube is sleeping. Start it with /opencube-ts-pet first.");
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
