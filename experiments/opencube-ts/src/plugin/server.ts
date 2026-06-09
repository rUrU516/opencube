import { quitPet, sendEvent, showPet } from "./electron-bridge"

const COMMAND_HANDLED_SENTINEL = "__OPENCUBE_TS_TEST_COMMAND_HANDLED__"

function handled(): never {
  throw new Error(COMMAND_HANDLED_SENTINEL)
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

export const id = "opencube-ts-test"

export async function server({ client }: { client: any }) {
  const handledCommands = new Set(["opencube-ts-test", "opencube-ts-pet", "opencube-ts-stop", "opencube-ts-hello"])

  return {
    config: async (cfg: any) => {
      cfg.command ??= {}
      cfg.command["opencube-ts-test"] = {
        template: "/opencube-ts-test",
        description: "Send a minimal test notice from the experimental TypeScript OpenCube plugin.",
      }
      cfg.command["opencube-ts-pet"] = {
        template: "/opencube-ts-pet",
        description: "Start or show the desktop OpenCube pet from the TypeScript experiment plugin.",
      }
      cfg.command["opencube-ts-stop"] = {
        template: "/opencube-ts-stop",
        description: "Quit the desktop OpenCube pet from the TypeScript experiment plugin.",
      }
      cfg.command["opencube-ts-hello"] = {
        template: "/opencube-ts-hello",
        description: "Send a hello event to OpenCube from the TypeScript experiment plugin.",
      }
    },

    "command.execute.before": async (input: any) => {
      if (!handledCommands.has(input.command)) return

      if (input.command === "opencube-ts-test") {
        await injectNotice(client, input.sessionID, "◈ OpenCube TS experiment plugin is alive.")
      }

      if (input.command === "opencube-ts-pet") {
        const health = await showPet()
        await injectNotice(client, input.sessionID, health ? "◈ OpenCube TS experiment started the pet." : "◈ OpenCube TS experiment asked the pet to start; it may still be warming up.")
      }

      if (input.command === "opencube-ts-stop") {
        const stopped = await quitPet()
        await injectNotice(client, input.sessionID, stopped ? "◌ OpenCube TS experiment stopped the pet." : "◌ OpenCube pet was not running.")
      }

      if (input.command === "opencube-ts-hello") {
        const result = await sendEvent({
          type: "hello",
          message: "hello from OpenCube TS experiment 🐾",
          sessionID: input.sessionID,
          source: "opencube-ts-plugin",
        })
        await injectNotice(client, input.sessionID, result ? "✦ OpenCube TS experiment sent hello." : "☾ OpenCube is sleeping. Start it with /opencube-ts-pet first.")
      }

      handled()
    },
  }
}

export default { id, server }
