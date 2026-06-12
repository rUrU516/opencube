const { execFile, spawn } = require("node:child_process")
const fs = require("node:fs")
const os = require("node:os")
const path = require("node:path")

const PET_HOST = "127.0.0.1"
const PET_PORT = Number(process.env.OPENCODE_PET_PORT || 47832)
const PET_BASE_URL = `http://${PET_HOST}:${PET_PORT}`

function repoRoot() {
  // dist/plugin/electron-bridge.js -> dist/plugin
  return path.resolve(__dirname, "../..")
}

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

async function emitProgress(onProgress: ((message: string) => unknown) | undefined, message: string) {
  if (!onProgress) return
  try {
    await onProgress(message)
  } catch {
    // Progress is best-effort; never block OpenCube startup on UI notices.
  }
}

function execFileAsync(file: string, args: string[], options: Record<string, unknown> = {}) {
  return new Promise<{ stdout: string; stderr: string }>((resolve, reject) => {
    const child = execFile(file, args, options, (error: any, stdout: string, stderr: string) => {
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

async function extractElectronZip(zipPath: string, distPath: string) {
  await fs.promises.rm(distPath, { recursive: true, force: true })
  await fs.promises.mkdir(distPath, { recursive: true })

  // Match OpenCube: extract-zip can hang under opencode desktop's
  // Electron/Node service on macOS after partially writing Electron.app.
  if ((process.env.npm_config_platform || process.platform) === "darwin") {
    await execFileAsync("/usr/bin/ditto", ["-x", "-k", zipPath, distPath], { timeout: 120000 })
    return
  }

  const extract = require("extract-zip")
  await extract(zipPath, { dir: distPath })
}

async function installElectronBinary(electronDir: string, options: { onProgress?: (message: string) => unknown } = {}) {
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

async function resolveElectronPath(options: { onProgress?: (message: string) => unknown } = {}) {
  await emitProgress(options.onProgress, "OpenCube: checking Electron runtime...")
  try {
    const electronPath = require("electron")
    if (typeof electronPath === "string") {
      await emitProgress(options.onProgress, "OpenCube: Electron runtime is ready ✅")
      return electronPath
    }

    await emitProgress(options.onProgress, "OpenCube: locating packaged Electron binary...")
    const electronPackage = require.resolve("electron/package.json")
    const electronDir = path.dirname(electronPackage)
    return await installElectronBinary(electronDir, options)
  } catch {
    await emitProgress(options.onProgress, "OpenCube: Electron runtime is incomplete; repairing...")
    const electronPackage = require.resolve("electron/package.json")
    const electronDir = path.dirname(electronPackage)
    return await installElectronBinary(electronDir, options)
  }
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

async function waitForPet(timeoutMs = 3500, options: { onProgress?: (message: string) => unknown } = {}) {
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

export async function showPet(options: { onProgress?: (message: string) => unknown } = {}) {
  await emitProgress(options.onProgress, "OpenCube: checking whether it is already running...")
  const existing = await healthPet()
  if (existing) {
    await emitProgress(options.onProgress, "OpenCube: already running; showing window...")
    await requestPet("/show", { method: "POST", timeoutMs: 800 })
    await emitProgress(options.onProgress, "OpenCube: shown ✨")
    return existing
  }

  await emitProgress(options.onProgress, "OpenCube: not running; starting now...")
  const cwd = repoRoot()
  const electronPath = await resolveElectronPath(options)
  await emitProgress(options.onProgress, "OpenCube: launching desktop pet...")
  const child = spawn(electronPath, [path.join(cwd, "dist/pet/main.js")], {
    cwd,
    detached: true,
    stdio: "ignore",
    env: {
      ...process.env,
      OPENCODE_PET_PORT: String(PET_PORT),
    },
  })
  child.unref()
  await emitProgress(options.onProgress, "OpenCube: launch request sent 🐾")
  const health = await waitForPet(3500, options)
  await requestPet("/show", { method: "POST", timeoutMs: 800 })
  await emitProgress(options.onProgress, health ? "OpenCube: shown ✨" : "OpenCube: start requested, still warming up...")
  return health
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
