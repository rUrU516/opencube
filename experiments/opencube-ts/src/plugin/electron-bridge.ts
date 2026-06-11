const { spawn } = require("node:child_process")
const path = require("node:path")

const PET_HOST = "127.0.0.1"
const PET_PORT = Number(process.env.OPENCODE_TS_PET_PORT || process.env.OPENCODE_PET_PORT || 47833)
const PET_BASE_URL = `http://${PET_HOST}:${PET_PORT}`

function repoRoot() {
  // dist/plugin/electron-bridge.js -> experiments/opencube-ts/dist/plugin
  return path.resolve(__dirname, "../..")
}

async function requestPet(pathname: string, options: { method?: string; body?: unknown; timeoutMs?: number } = {}) {
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), options.timeoutMs ?? 800)
  try {
    const response = await fetch(`${PET_BASE_URL}${pathname}`, {
      method: options.method || "GET",
      headers: { "content-type": "application/json" },
      body: options.body === undefined ? undefined : JSON.stringify(options.body),
      signal: controller.signal,
    })
    if (!response.ok) return undefined
    return await response.json().catch(() => ({}))
  } catch {
    return undefined
  } finally {
    clearTimeout(timeout)
  }
}

export async function healthPet() {
  const health: any = await requestPet("/health", { timeoutMs: 500 })
  return health?.status === "good" ? health : undefined
}

async function waitForPet(timeoutMs = 3500) {
  const startedAt = Date.now()
  while (Date.now() - startedAt < timeoutMs) {
    const health = await healthPet()
    if (health) return health
    await new Promise((resolve) => setTimeout(resolve, 150))
  }
  return undefined
}

export async function showPet() {
  const existing = await healthPet()
  if (existing) {
    await requestPet("/show", { method: "POST", timeoutMs: 800 })
    return existing
  }

  const cwd = repoRoot()
  const child = spawn("npm", ["run", "start:pet"], {
    cwd,
    detached: true,
    stdio: "ignore",
    env: {
      ...process.env,
      OPENCODE_PET_PORT: String(PET_PORT),
    },
  })
  child.unref()
  return await waitForPet()
}

export async function quitPet() {
  const health = await healthPet()
  if (!health) return false
  await requestPet("/quit", { method: "POST", timeoutMs: 800 })
  return true
}

export async function sendEvent(event: Record<string, unknown>) {
  const health = await healthPet()
  if (!health) return undefined
  return await requestPet("/event", { method: "POST", body: event, timeoutMs: 1000 })
}

export async function setDragBorder(visible?: boolean) {
  const health = await healthPet()
  if (!health) return undefined
  return await requestPet("/drag-border", { method: "POST", body: { visible }, timeoutMs: 1000 })
}
