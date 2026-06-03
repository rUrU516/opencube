const { execFile, spawn } = require("node:child_process")
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

async function emitProgress(onProgress, message) {
  if (!onProgress) return
  try {
    await onProgress(message)
  } catch {
    // Progress is best-effort; never block OpenCube startup on UI notices.
  }
}

function execFileAsync(file, args, options = {}) {
  return new Promise((resolve, reject) => {
    const child = execFile(file, args, options, (error, stdout, stderr) => {
      if (error) {
        error.stdout = stdout
        error.stderr = stderr
        reject(error)
        return
      }
      resolve({ stdout, stderr })
    })
    child.on("error", reject)
  })
}

async function extractElectronZip(zipPath, distPath) {
  await fs.promises.rm(distPath, { recursive: true, force: true })
  await fs.promises.mkdir(distPath, { recursive: true })

  // extract-zip can hang under opencode desktop's Electron/Node service on
  // macOS after partially writing Electron.app. Use the native archive tool
  // there; keep extract-zip as the portable fallback for other platforms.
  if ((process.env.npm_config_platform || process.platform) === "darwin") {
    await execFileAsync("/usr/bin/ditto", ["-x", "-k", zipPath, distPath], { timeout: 120000 })
    return
  }

  const extract = require("extract-zip")
  await extract(zipPath, { dir: distPath })
}

async function installElectronBinary(electronDir, options = {}) {
  const { downloadArtifact } = require("@electron/get")
  const { version } = require(path.join(electronDir, "package.json"))
  const checksums = require(path.join(electronDir, "checksums.json"))
  const platform = process.env.npm_config_platform || process.platform
  const arch = process.env.npm_config_arch || process.arch
  const platformPath = electronPlatformPath()
  const distPath = path.join(electronDir, "dist")
  const executablePath = path.join(distPath, platformPath)

  if (fs.existsSync(executablePath)) {
    await emitProgress(options.onProgress, "OpenCube: Electron binary is ready ✅")
    return executablePath
  }

  await emitProgress(options.onProgress, `OpenCube: downloading Electron ${version} for ${platform}/${arch}...`)
  const zipPath = await downloadArtifact({
    version,
    artifactName: "electron",
    cacheRoot: process.env.electron_config_cache,
    checksums,
    platform,
    arch,
  })
  await emitProgress(options.onProgress, "OpenCube: extracting Electron binary...")
  await extractElectronZip(zipPath, distPath)
  await fs.promises.writeFile(path.join(electronDir, "path.txt"), platformPath)
  await emitProgress(options.onProgress, "OpenCube: Electron binary installed ✅")
  return executablePath
}

async function resolveElectronPath(options = {}) {
  await emitProgress(options.onProgress, "OpenCube: checking Electron runtime...")
  try {
    const electronPath = require("electron")
    if (typeof electronPath === "string") {
      await emitProgress(options.onProgress, "OpenCube: Electron runtime is ready ✅")
      return electronPath
    }

    // In opencode desktop, plugins may run inside an Electron process. In that
    // environment require("electron") can resolve to Electron's built-in API
    // object instead of the npm package's executable path string. Fall through
    // to the npm package directory and resolve/repair the packaged binary.
    await emitProgress(options.onProgress, "OpenCube: locating packaged Electron binary...")
    const electronPackage = require.resolve("electron/package.json")
    const electronDir = path.dirname(electronPackage)
    return await installElectronBinary(electronDir, options)
  } catch (error) {
    await emitProgress(options.onProgress, "OpenCube: Electron runtime is incomplete; repairing...")
    const electronPackage = require.resolve("electron/package.json")
    const electronDir = path.dirname(electronPackage)
    return await installElectronBinary(electronDir, options)
  }
}

async function launchPet(args = [], options = {}) {
  const electronPath = await resolveElectronPath(options)
  await emitProgress(options.onProgress, "OpenCube: launching desktop pet...")
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
  await emitProgress(options.onProgress, "OpenCube: launch request sent 🐾")
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

async function waitForPet(timeoutMs = 3500, options = {}) {
  await emitProgress(options.onProgress, "OpenCube: waiting for local server...")
  const startedAt = Date.now()
  while (Date.now() - startedAt < timeoutMs) {
    const health = await healthPet()
    if (health) {
      await emitProgress(options.onProgress, "OpenCube: local server is ready ✅")
      return health
    }
    await new Promise((resolve) => setTimeout(resolve, 150))
  }
  await emitProgress(options.onProgress, "OpenCube: local server did not answer yet")
  return undefined
}

async function ensurePet(options = {}) {
  await emitProgress(options.onProgress, "OpenCube: checking whether it is already running...")
  const existing = await healthPet()
  if (existing) {
    await emitProgress(options.onProgress, "OpenCube: already running; showing window...")
    return existing
  }
  await emitProgress(options.onProgress, "OpenCube: not running; starting now...")
  await launchPet(["--show"], options)
  return await waitForPet(3500, options)
}

async function showPet(options = {}) {
  const health = await ensurePet(options)
  await requestPet("/show", { method: "POST", timeoutMs: 800 })
  await emitProgress(options.onProgress, health ? "OpenCube: shown ✨" : "OpenCube: start requested, still warming up...")
  return health
}

async function quitPet() {
  const health = await healthPet()
  if (health) {
    await requestPet("/quit", { method: "POST", timeoutMs: 800 })
    return true
  }
  return false
}

async function sendEvent(event) {
  // Only /pet is allowed to start OpenCube. Session lifecycle events and hello
  // commands should talk to the desktop pet only if it is already running.
  const health = await healthPet()
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
