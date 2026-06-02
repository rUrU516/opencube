const { quitPet, sendEvent, showPet } = require("./plugin-shared.cjs")

const COMMAND_HANDLED_SENTINEL = "__OPENCODE_PET_COMMAND_HANDLED__"

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

module.exports = {
  id: "opencode-pet",
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
          description: "Send a hello test event to OpenCub.",
        }
        cfg.command.pet_fancy_say_hello = {
          template: "/pet_fancy_say_hello",
          description: "Trigger a randomized light show on OpenCub's free faces.",
        }
      },

      "command.execute.before": async (input) => {
        if (!["pet", "pet_stop", "pet_say_hello", "pet_fancy_say_hello"].includes(input.command)) return

        if (shouldQuit(input)) {
          await quitPet()
          await injectNotice(client, input.sessionID, "OpenCub is going to sleep 🐾")
        } else if (isSayHello(input)) {
          await sendEvent({
            type: "hello",
            message: "hello from opencode 🐾",
            command: input.command,
            arguments: input.arguments,
            sessionID: input.sessionID,
            source: "opencode-pet-plugin",
          })
          await injectNotice(client, input.sessionID, "OpenCub got your hello 🐾")
        } else if (isFancySayHello(input)) {
          await sendEvent({
            type: "fancy_hello",
            message: "fancy hello light show from opencode ✨",
            command: input.command,
            arguments: input.arguments,
            sessionID: input.sessionID,
            source: "opencode-pet-plugin",
          })
          await injectNotice(client, input.sessionID, "OpenCub is putting on a light show ✨")
        } else {
          await showPet()
          await injectNotice(client, input.sessionID, "OpenCub is awake 🐾")
        }

        handled()
      },

      event: async ({ event }) => {
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
            source: "opencode-pet-plugin",
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
          source: "opencode-pet-plugin",
        })
      },
    }
  },
}
