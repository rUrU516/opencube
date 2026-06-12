import { quitPet, sendEvent, setDragBorder, showPet } from "./electron-bridge"
import { compareVersions } from "./features/update/compare"
import { getLatestNpmVersion } from "./features/update/registry"
import { getCurrentVersion } from "./features/update/version"

const COMMAND_HANDLED_SENTINEL = "__OPENCODE_PET_COMMAND_HANDLED__"

function handled(): never {
  throw new Error(COMMAND_HANDLED_SENTINEL)
}

function delay(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

function textOfArguments(args: unknown) {
  if (typeof args === "string") return args.trim().toLowerCase()
  if (Array.isArray(args)) return args.join(" ").trim().toLowerCase()
  if (args == null) return ""
  return String(args).trim().toLowerCase()
}

function parseDragBorderVisibility(args: unknown) {
  const raw = textOfArguments(args)
  if (/\b(show|on|visible|true|1)\b/.test(raw)) return true
  if (/\b(hide|off|hidden|false|0)\b/.test(raw)) return false
  return undefined
}

async function injectNotice(client: any, sessionID: string | undefined, text: string) {
  if (!sessionID || !client?.session?.prompt) return

  try {
    await client.session.prompt({
      path: { id: sessionID },
      body: {
        noReply: true,
        parts: [{ type: "text", text, ignored: true }],
      },
    })
  } catch {
    // Best-effort only. The test command should still be treated as handled.
  }
}

export const id = "opencube"

export async function server({ client }: { client: any }) {
  const handledCommands = new Set(["pet", "pet_stop", "pet_restart", "pet_say_hello", "pet_update", "pet_upgrade", "pet-drag-border", "pet_drag_border", "pet_test"])

  return {
    config: async (cfg: any) => {
      cfg.command ??= {}
      cfg.command.pet = {
        template: "/pet",
        description: "Start or show the desktop OpenCube pet without sending anything to the agent.",
      }
      cfg.command.pet_stop = {
        template: "/pet_stop",
        description: "Quit the desktop OpenCube pet without sending anything to the agent.",
      }
      cfg.command.pet_restart = {
        template: "/pet_restart",
        description: "Restart the desktop OpenCube pet.",
      }
      cfg.command.pet_say_hello = {
        template: "/pet_say_hello",
        description: "Send a hello test event to OpenCube.",
      }
      cfg.command.pet_update = {
        template: "/pet_update",
        description: "Check npm for a newer OpenCube version.",
      }
      cfg.command.pet_upgrade = {
        template: "/pet_upgrade",
        description: "Alias for /pet_update.",
      }
      cfg.command["pet-drag-border"] = {
        template: "/pet-drag-border",
        description: "Show/hide/toggle the OpenCube drag handle border, e.g. /pet-drag-border hide.",
      }
      cfg.command.pet_drag_border = {
        template: "/pet_drag_border",
        description: "Alias for /pet-drag-border.",
      }
      cfg.command.pet_test = {
        template: "/pet_test",
        description: "Send a minimal test notice from the OpenCube plugin.",
      }
    },

    "command.execute.before": async (input: any) => {
      if (!handledCommands.has(input.command)) return

      if (input.command === "pet_test") {
        await injectNotice(client, input.sessionID, "◈ OpenCube plugin is alive.")
      }

      if (input.command === "pet") {
        const health = await showPet({
          onProgress: (message) => injectNotice(client, input.sessionID, message),
        })
        await injectNotice(client, input.sessionID, health ? "◈ OpenCube started the pet." : "◈ OpenCube asked the pet to start; it may still be warming up.")
      }

      if (input.command === "pet_stop") {
        const stopped = await quitPet()
        await injectNotice(client, input.sessionID, stopped ? "◌ OpenCube stopped the pet." : "◌ OpenCube pet was not running.")
      }

      if (input.command === "pet_restart") {
        await quitPet()
        await delay(300)
        const health = await showPet({
          onProgress: (message) => injectNotice(client, input.sessionID, message),
        })
        await injectNotice(client, input.sessionID, health ? "↻ OpenCube restarted the pet." : "↻ OpenCube restarted the pet; it may still be warming up.")
      }

      if (input.command === "pet_say_hello") {
        const result = await sendEvent({
          type: "hello",
          sessionID: input.sessionID,
        })
        await injectNotice(client, input.sessionID, result ? "✦ OpenCube sent hello." : "☾ OpenCube is sleeping. Start it with /pet first.")
      }

      if (input.command === "pet_update" || input.command === "pet_upgrade") {
        await injectNotice(client, input.sessionID, "↻ OpenCube: checking updates...")
        try {
          const current = await getCurrentVersion()
          await injectNotice(client, input.sessionID, `OpenCube current version: v${current.version}`)
          try {
            const latest = await getLatestNpmVersion(current.name)
            await injectNotice(client, input.sessionID, `OpenCube latest npm version: v${latest.version}`)
            const comparison = compareVersions(current.version, latest.version)
            if (comparison === 0) {
              await injectNotice(client, input.sessionID, "OpenCube is up to date.")
            }
            if (comparison > 0) {
              await injectNotice(client, input.sessionID, "OpenCube is newer than npm latest. This looks like a local/dev build.")
            }
            if (comparison < 0) {
              await injectNotice(client, input.sessionID, `OpenCube update available: v${current.version} → v${latest.version}`)
              await injectNotice(client, input.sessionID, `Run manually: opencode plugin ${current.name}@${latest.version} --global --force`)
            }
          } catch {
            await injectNotice(client, input.sessionID, "OpenCube latest npm version: unknown")
          }
        } catch {
          await injectNotice(client, input.sessionID, "OpenCube current version: unknown")
        }
      }

      if (input.command === "pet-drag-border" || input.command === "pet_drag_border") {
        const visible = parseDragBorderVisibility(input.arguments)
        const result: any = await setDragBorder(visible)
        await injectNotice(
          client,
          input.sessionID,
          result ? `▣ OpenCube drag border ${result.visible ? "shown" : "hidden"}.` : "☾ OpenCube is sleeping. Start it with /pet first.",
        )
      }

      handled()
    },

    event: async ({ event }: { event: any }) => {
      if (event.type === "permission.asked") {
        const permission = event.properties || {}
        await sendEvent({
          type: "permission.ask",
          sessionID: permission.sessionID,
          requestID: permission.id,
          permission: permission.permission,
        })
        return
      }

      if (event.type === "permission.replied") {
        const permission = event.properties || {}
        await sendEvent({
          type: "permission.reply",
          sessionID: permission.sessionID,
          requestID: permission.requestID,
          reply: permission.reply,
        })
        return
      }

      if (event.type === "question.asked") {
        const question = event.properties || {}
        await sendEvent({
          type: "question.ask",
          sessionID: question.sessionID,
          requestID: question.id,
          questionCount: Array.isArray(question.questions) ? question.questions.length : undefined,
        })
        return
      }

      if (event.type === "question.replied") {
        const question = event.properties || {}
        await sendEvent({
          type: "question.reply",
          sessionID: question.sessionID,
          requestID: question.requestID,
        })
        return
      }

      if (event.type === "question.rejected") {
        const question = event.properties || {}
        await sendEvent({
          type: "question.reject",
          sessionID: question.sessionID,
          requestID: question.requestID,
        })
        return
      }

      if (event.type === "session.status") {
        const status = event.properties?.status?.type
        if (status !== "busy" && status !== "retry" && status !== "idle") return
        await sendEvent({
          type: status,
          sessionID: event.properties?.sessionID,
        })
      }
    },

    "tool.execute.before": async (input: any, output: any) => {
      await sendEvent({
        type: "tool.start",
        sessionID: input.sessionID,
        tool: input.tool,
        callID: input.callID,
      })
    },

    "tool.execute.after": async (input: any, output: any) => {
      await sendEvent({
        type: "tool.finish",
        sessionID: input.sessionID,
        tool: input.tool,
        callID: input.callID,
      })
    },
  }
}

export default { id, server }
