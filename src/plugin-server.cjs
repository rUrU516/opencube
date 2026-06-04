const { quitPet, sendEvent, showPet } = require("./plugin-shared.cjs")

const COMMAND_HANDLED_SENTINEL = "__OPENCODE_PET_COMMAND_HANDLED__"
const CUB_ICON = "◈"

function handled() {
  throw new Error(COMMAND_HANDLED_SENTINEL)
}

function textOfArguments(args) {
  if (typeof args === "string") return args.trim().toLowerCase()
  if (Array.isArray(args)) return args.join(" ").trim().toLowerCase()
  if (args == null) return ""
  return String(args).trim().toLowerCase()
}

function shouldQuit(input) {
  const args = textOfArguments(input.arguments)
  return input.command === "pet_stop" || ["stop", "quit", "close", "off"].includes(args)
}

function isSayHello(input) {
  return input.command === "pet_say_hello"
}

function isFancySayHello(input) {
  return input.command === "pet_fancy_say_hello"
}

async function injectNotice(client, sessionID, text) {
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
    // Best-effort only: launching/quitting the pet should still count as handled.
  }
}

function cubNotice(text, icon = CUB_ICON) {
  return `${icon} ${text}`
}

function summarizeToolOutput(output) {
  if (!output || typeof output !== "object") return undefined
  const text = typeof output.output === "string" ? output.output : undefined
  return {
    title: output.title,
    output: text && text.length > 2000 ? `${text.slice(0, 2000)}…` : text,
    outputLength: text?.length,
    metadata: output.metadata,
  }
}

module.exports = {
  id: "opencube",
  server: async ({ client }) => {
    const sessionStatus = new Map()

    return {
      // Same trick as @slkiser/opencode-quota: register normal slash commands in
      // config, then abort command.execute.before after doing the side effect.
      // This makes /pet show up in opencode's slash list but avoids an LLM reply.
      config: async (cfg) => {
        cfg.command ??= {}
        cfg.command.pet = {
          template: "/pet",
          description: "Show the desktop opencode pet without sending anything to the agent.",
        }
        cfg.command.pet_stop = {
          template: "/pet_stop",
          description: "Quit the desktop opencode pet without sending anything to the agent.",
        }
        cfg.command.pet_say_hello = {
          template: "/pet_say_hello",
          description: "Send a hello test event to OpenCube.",
        }
        cfg.command.pet_fancy_say_hello = {
          template: "/pet_fancy_say_hello",
          description: "Trigger a randomized light show on OpenCube's free faces.",
        }
      },

      "command.execute.before": async (input, output) => {
        if (!["pet", "pet_stop", "pet_say_hello", "pet_fancy_say_hello"].includes(input.command)) return

        // There is no official cancel primitive in command.execute.before yet.
        // Throwing this sentinel aborts the command flow before opencode sends
        // the slash-command prompt to the model. Desktop may show it as an
        // "Unexpected server error" toast, but this is currently the only path
        // that reliably prevents empty prompts / model continuation.

        if (shouldQuit(input)) {
          await quitPet()
          await injectNotice(client, input.sessionID, cubNotice("OpenCube is going to sleep 🐾", "◌"))
        } else if (isSayHello(input)) {
          const result = await sendEvent({
            type: "hello",
            message: "hello from opencode 🐾",
            command: input.command,
            arguments: input.arguments,
            sessionID: input.sessionID,
            source: "opencube-plugin",
          })
          await injectNotice(
            client,
            input.sessionID,
            result ? cubNotice("OpenCube got your hello 🐾", "✦") : cubNotice("OpenCube is sleeping... zzz  Use /pet to wake it.", "☾"),
          )
        } else if (isFancySayHello(input)) {
          const result = await sendEvent({
            type: "fancy_hello",
            message: "fancy hello light show from opencode ✨",
            command: input.command,
            arguments: input.arguments,
            sessionID: input.sessionID,
            source: "opencube-plugin",
          })
          await injectNotice(
            client,
            input.sessionID,
            result
              ? cubNotice("OpenCube is putting on a light show ✨", "✺")
              : cubNotice("OpenCube is sleeping... zzz  Start it with /pet before the light show.", "☾"),
          )
        } else {
          await showPet({
            onProgress: (message) => injectNotice(client, input.sessionID, message),
          })
        }

        handled()
      },

      event: async ({ event }) => {
        if (event.type === "permission.asked") {
          const permission = event.properties || {}
          await sendEvent({
            type: "permission.ask",
            message: "opencode is waiting for permission",
            sessionID: permission.sessionID,
            requestID: permission.id,
            permission: permission.permission,
            patterns: permission.patterns,
            metadata: permission.metadata,
            always: permission.always,
            tool: permission.tool,
            source: "opencube-plugin",
          })
          return
        }

        if (event.type === "permission.replied") {
          const permission = event.properties || {}
          await sendEvent({
            type: "permission.reply",
            message: "opencode permission was answered",
            sessionID: permission.sessionID,
            requestID: permission.requestID,
            reply: permission.reply,
            source: "opencube-plugin",
          })
          return
        }

        if (event.type !== "session.status") return

        const sessionID = event.properties?.sessionID
        const status = event.properties?.status?.type
        if (!sessionID || !status) return

        const previous = sessionStatus.get(sessionID) || "idle"

        if (status === "busy" || status === "retry") {
          sessionStatus.set(sessionID, status)
          if (previous === "busy" || previous === "retry") return

          await sendEvent({
            type: "session.busy",
            message: "opencode session became busy",
            sessionID,
            status,
            previousStatus: previous,
            source: "opencube-plugin",
          })
          return
        }

        if (status !== "idle") return
        sessionStatus.set(sessionID, status)
        if (previous !== "busy" && previous !== "retry") return

        await sendEvent({
          type: "session.idle",
          message: "opencode session became idle",
          sessionID,
          status,
          previousStatus: previous,
          source: "opencube-plugin",
        })
      },

      "tool.execute.before": async (input, output) => {
        await sendEvent({
          type: "tool.start",
          message: `tool ${input.tool} started`,
          sessionID: input.sessionID,
          tool: input.tool,
          callID: input.callID,
          args: output?.args,
          source: "opencube-plugin",
        })
      },

      "tool.execute.after": async (input, output) => {
        await sendEvent({
          type: "tool.finish",
          message: `tool ${input.tool} finished`,
          sessionID: input.sessionID,
          tool: input.tool,
          callID: input.callID,
          args: input.args,
          result: summarizeToolOutput(output),
          source: "opencube-plugin",
        })
      },
    }
  },
}
