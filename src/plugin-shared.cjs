const { spawn } = require("node:child_process")
const fs = require("node:fs")
const os = require("node:os")
const path = require("node:path")

const PET_APP_DIR = path.resolve(__dirname, "..")
const PET_HOST = "127.0.0.1"
const PET_PORT = Number(process.env.OPENCODE_PET_PORT || 47832)
const PET_BASE_URL = `http://${PET_HOST}:${PET_PORT}`

function electronPlatformPath() {
  const platform = process.env.npm_config_platform || os.platform()
  switch (platform) {
    case "mas":
    case "darwin":
      return "Electron.app/Contents/MacOS/Electron"
    case "freebsd":
    case "openbsd":
    case "linux":
      return "electron"
    case "win32":
      return "electron.exe"
    default:
      throw new Error(`Electron builds are not available on platform: ${platform}`)
  }
}

async function installElectronBinary(electronDir) {
  const { downloadArtifact } = require("@electron/get")
  const extract = require("extract-zip")
  const { version } = require(path.join(electronDir, "package.json"))
  const checksums = require(path.join(electronDir, "checksums.json"))
  const platform = process.env.npm_config_platform || process.platform
  const arch = process.env.npm_config_arch || process.arch
  const platformPath = electronPlatformPath()
  const distPath = path.join(electronDir, "dist")
  const executablePath = path.join(distPath, platformPath)

  if (fs.existsSync(executablePath)) return executablePath

  const zipPath = await downloadArtifact({
    version,
    artifactName: "electron",
    cacheRoot: process.env.electron_config_cache,
    checksums,
    platform,
    arch,
  })
  await extract(zipPath, { dir: distPath })
  await fs.promises.writeFile(path.join(electronDir, "path.txt"), platformPath)
  return executablePath
}

async function resolveElectronPath() {
  try {
    return require("electron")
  } catch (error) {
    const electronPackage = require.resolve("electron/package.json")
    const electronDir = path.dirname(electronPackage)
    return await installElectronBinary(electronDir)
  }
}

async function launchPet(args = []) {
  const electronPath = await resolveElectronPath()
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
  await launchPet(["--show"])
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
  await launchPet(["--quit"])
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
