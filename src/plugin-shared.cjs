const { spawn } = require("node:child_process")
const path = require("node:path")
const electronPath = require("electron")

const PET_APP_DIR = path.resolve(__dirname, "..")
const PET_HOST = "127.0.0.1"
const PET_PORT = Number(process.env.OPENCODE_PET_PORT || 47832)
const PET_BASE_URL = `http://${PET_HOST}:${PET_PORT}`

function launchPet(args = []) {
  const child = spawn(electronPath, [PET_APP_DIR, ...args], {
    cwd: PET_APP_DIR,
    detached: true,
    stdio: "ignore",
    env: {
      ...process.env,
      OPENCODE_PET_ICON: path.join(PET_APP_DIR, "assets", "opencode-icon.png"),
    },
  })
  child.unref()
}

async function requestPet(pathname, options = {}) {
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), options.timeoutMs ?? 800)
  try {
    const response = await fetch(`${PET_BASE_URL}${pathname}`, {
      method: options.method || "GET",
      headers: {
        "content-type": "application/json",
        ...(options.headers || {}),
      },
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

async function healthPet() {
  const health = await requestPet("/health", { timeoutMs: 500 })
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

async function ensurePet() {
  const existing = await healthPet()
  if (existing) return existing
  launchPet(["--show"])
  return await waitForPet()
}

async function showPet() {
  const health = await ensurePet()
  await requestPet("/show", { method: "POST", timeoutMs: 800 })
  return health
}

async function quitPet() {
  const health = await healthPet()
  if (health) {
    await requestPet("/quit", { method: "POST", timeoutMs: 800 })
    return true
  }
  // Compatibility fallback for an older pet process that was launched before
  // the HTTP API existed.
  launchPet(["--quit"])
  return false
}

async function sendEvent(event) {
  const health = await ensurePet()
  if (!health) return undefined
  return await requestPet("/event", { method: "POST", body: event, timeoutMs: 1000 })
}

module.exports = {
  PET_APP_DIR,
  PET_BASE_URL,
  PET_HOST,
  PET_PORT,
  ensurePet,
  healthPet,
  launchPet,
  quitPet,
  requestPet,
  sendEvent,
  showPet,
}
