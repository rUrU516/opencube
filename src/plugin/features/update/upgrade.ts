import { spawn } from "node:child_process"

const DEFAULT_UPGRADE_TIMEOUT_MS = 120_000

export type UpgradeResult = {
  command: string
  args: string[]
  exitCode: number | null
  signal: NodeJS.Signals | null
  timedOut: boolean
}

export type UpgradeOptions = {
  packageName: string
  version: string
  timeoutMs?: number
  onLine?: (line: string) => Promise<void> | void
}

async function emitLine(onLine: UpgradeOptions["onLine"], line: string) {
  if (!onLine || line.length === 0) return
  await onLine(line)
}

function createLineEmitter(prefix: string, onLine: UpgradeOptions["onLine"]) {
  let pending = ""

  return {
    async write(chunk: Buffer | string) {
      pending += chunk.toString()
      const lines = pending.split(/\r?\n/)
      pending = lines.pop() ?? ""

      for (const line of lines) {
        await emitLine(onLine, `${prefix}${line}`)
      }
    },

    async flush() {
      if (pending.length === 0) return
      await emitLine(onLine, `${prefix}${pending}`)
      pending = ""
    },
  }
}

export async function runPluginUpgrade({ packageName, version, timeoutMs = DEFAULT_UPGRADE_TIMEOUT_MS, onLine }: UpgradeOptions): Promise<UpgradeResult> {
  const command = "opencode"
  const args = ["plugin", `${packageName}@${version}`, "--global", "--force"]
  const stdout = createLineEmitter("upgrade stdout: ", onLine)
  const stderr = createLineEmitter("upgrade stderr: ", onLine)

  await emitLine(onLine, `upgrade command: ${command} ${args.join(" ")}`)

  return new Promise((resolve, reject) => {
    let timedOut = false
    let settled = false

    const child = spawn(command, args, {
      stdio: ["ignore", "pipe", "pipe"],
    })

    const finish = async (result: UpgradeResult) => {
      if (settled) return
      settled = true
      clearTimeout(timer)

      try {
        await stdout.flush()
        await stderr.flush()
        resolve(result)
      } catch (error) {
        reject(error)
      }
    }

    const timer = setTimeout(() => {
      timedOut = true
      child.kill("SIGTERM")
    }, timeoutMs)

    child.stdout?.on("data", (chunk) => {
      stdout.write(chunk).catch(reject)
    })

    child.stderr?.on("data", (chunk) => {
      stderr.write(chunk).catch(reject)
    })

    child.on("error", (error: any) => {
      if (settled) return
      settled = true
      clearTimeout(timer)

      if (error?.code === "ENOENT") {
        reject(new Error("Unable to find the opencode CLI in PATH."))
        return
      }

      reject(error)
    })

    child.on("close", (exitCode, signal) => {
      finish({ command, args, exitCode, signal, timedOut }).catch(reject)
    })
  })
}
