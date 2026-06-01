const { app, BrowserWindow, Menu, nativeImage, screen } = require("electron")
const fs = require("node:fs")
const http = require("node:http")
const os = require("node:os")
const path = require("node:path")

const APP_NAME = "opencode pet"
const HOST = "127.0.0.1"
const PORT = Number(process.env.OPENCODE_PET_PORT || 47832)
const DATA_DIR = path.join(os.homedir(), ".local", "share", "opencode-pet")
const STATE_FILE = path.join(DATA_DIR, "state.json")
const ICON_PATH = process.env.OPENCODE_PET_ICON || path.join(__dirname, "..", "assets", "opencode-icon.png")
const MAX_EVENTS = 100
const IDLE_TTL_MS = 5 * 60 * 1000

let petWindow = null
let panelWindow = null
let server = null
let events = []
let sessionMap = new Map()
let cleanupTimer = null

function ensureDataDir() {
  fs.mkdirSync(DATA_DIR, { recursive: true })
}

function writeState(extra = {}) {
  ensureDataDir()
  fs.writeFileSync(
    STATE_FILE,
    JSON.stringify(
      {
        pid: process.pid,
        startedAt: Date.now(),
        iconPath: ICON_PATH,
        ...extra,
      },
      null,
      2,
    ),
  )
}

function shouldQuit(argv = process.argv) {
  return argv.includes("--quit") || argv.includes("--stop") || argv.includes("stop") || argv.includes("quit")
}

function createPetImage() {
  let image = nativeImage.createFromPath(ICON_PATH)
  if (image.isEmpty()) {
    image = nativeImage.createFromDataURL(
      "data:image/svg+xml;charset=utf-8," +
        encodeURIComponent(
          `<svg xmlns="http://www.w3.org/2000/svg" width="64" height="64" viewBox="0 0 64 64"><rect width="64" height="64" rx="14" fill="#111"/><text x="32" y="42" text-anchor="middle" font-size="34" fill="white">oc</text></svg>`,
        ),
    )
  }
  return image.resize({ width: 72, height: 72 })
}

function createPetImageDataUrl() {
  return createPetImage().toDataURL()
}

function json(res, status, body) {
  const text = JSON.stringify(body)
  res.writeHead(status, {
    "content-type": "application/json; charset=utf-8",
    "access-control-allow-origin": "*",
    "access-control-allow-methods": "GET,POST,OPTIONS",
    "access-control-allow-headers": "content-type",
  })
  res.end(text)
}

function readRequestJson(req) {
  return new Promise((resolve, reject) => {
    let raw = ""
    req.on("data", (chunk) => {
      raw += chunk
      if (raw.length > 1024 * 1024) {
        reject(new Error("request body too large"))
        req.destroy()
      }
    })
    req.on("end", () => {
      if (!raw.trim()) return resolve({})
      try {
        resolve(JSON.parse(raw))
      } catch (error) {
        reject(error)
      }
    })
    req.on("error", reject)
  })
}

function recordEvent(event) {
  const item = {
    id: `${Date.now()}-${Math.random().toString(16).slice(2)}`,
    receivedAt: Date.now(),
    ...event,
  }
  applySessionEvent(item)
  events.unshift(item)
  events = events.slice(0, MAX_EVENTS)
  updatePanel()
  updatePet()
  return item
}

function applySessionEvent(event) {
  if (!event || typeof event.sessionID !== "string") return
  const now = event.receivedAt || Date.now()
  const current = sessionMap.get(event.sessionID)

  if (event.type === "session.busy") {
    sessionMap.set(event.sessionID, {
      sessionID: event.sessionID,
      state: "busy",
      busyAt: current?.state === "busy" ? current.busyAt : now,
      idleAt: undefined,
      lastAt: now,
      status: event.status || "busy",
    })
    return
  }

  if (event.type === "session.idle") {
    sessionMap.set(event.sessionID, {
      sessionID: event.sessionID,
      state: "idle",
      busyAt: current?.busyAt,
      idleAt: now,
      lastAt: now,
      status: event.status || "idle",
    })
  }
}

function pruneIdleSessions(refresh = true) {
  const now = Date.now()
  let changed = false
  for (const [sessionID, session] of sessionMap) {
    if (session.state === "idle" && session.idleAt && now - session.idleAt > IDLE_TTL_MS) {
      sessionMap.delete(sessionID)
      changed = true
    }
  }
  if (changed && refresh) updatePet()
}

function getPetState() {
  pruneIdleSessions(false)
  return {
    now: Date.now(),
    layout: {
      width: 230,
      height: 210,
      center: { x: 98, y: 100 },
      core: { x: 62, y: 64, size: 72 },
      orbit: { baseRadius: 62, radiusStep: 13 },
      idleStack: { x: 184, y: 34, yStep: 13, xJitter: 8 },
      dot: { size: 12 },
    },
    sessions: Array.from(sessionMap.values()).map((session, index) => ({
      sessionID: session.sessionID,
      state: session.state,
      busyAt: session.busyAt,
      idleAt: session.idleAt,
      lastAt: session.lastAt,
      index,
    })),
  }
}

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;")
}

function panelHtml() {
  const rows = events
    .map((event) => {
      const time = new Date(event.receivedAt).toLocaleTimeString()
      const payload = JSON.stringify(event, null, 2)
      return `<div class="event"><div class="meta">${escapeHtml(time)} · ${escapeHtml(event.type || "event")}</div><pre>${escapeHtml(payload)}</pre></div>`
    })
    .join("")

  return `<!doctype html>
<html>
  <head>
    <meta charset="utf-8" />
    <style>
      html, body { margin: 0; width: 100%; height: 100%; background: transparent; font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; }
      .panel { box-sizing: border-box; width: 100%; height: 100%; padding: 12px; border-radius: 16px; background: rgba(24, 24, 27, 0.94); color: white; box-shadow: 0 14px 42px rgba(0,0,0,.28); overflow: hidden; }
      .header { display: flex; align-items: center; justify-content: space-between; margin-bottom: 8px; font-size: 13px; font-weight: 700; }
      .hint { color: rgba(255,255,255,.6); font-size: 11px; font-weight: 500; }
      .list { height: 292px; overflow: auto; padding-right: 4px; }
      .empty { color: rgba(255,255,255,.6); font-size: 13px; padding: 18px 4px; }
      .event { border: 1px solid rgba(255,255,255,.12); border-radius: 10px; padding: 8px; margin-bottom: 8px; background: rgba(255,255,255,.06); }
      .meta { color: #a7f3d0; font-size: 11px; margin-bottom: 5px; }
      pre { margin: 0; color: rgba(255,255,255,.88); white-space: pre-wrap; word-break: break-word; font: 11px ui-monospace, SFMono-Regular, Menlo, monospace; }
    </style>
  </head>
  <body>
    <div class="panel">
      <div class="header"><span>opencode pet inbox</span><span class="hint">${events.length}/${MAX_EVENTS}</span></div>
      <div class="list">${rows || `<div class="empty">还没有收到事件。试试 /pet 或 /pet_stop。</div>`}</div>
    </div>
  </body>
</html>`
}

function updatePanel() {
  if (!panelWindow || panelWindow.isDestroyed()) return
  panelWindow.loadURL("data:text/html;charset=utf-8," + encodeURIComponent(panelHtml()))
}

function petHtml() {
  const iconDataUrl = createPetImageDataUrl()
  const initialStateJson = JSON.stringify(getPetState()).replaceAll("<", "\\u003c")
  return `<!doctype html>
<html>
  <head>
    <meta charset="utf-8" />
    <style>
      html, body {
        margin: 0;
        width: 100%;
        height: 100%;
        background: transparent;
        overflow: hidden;
      }
      .stage {
        box-sizing: border-box;
        width: 100%;
        height: 100%;
        position: relative;
        background: transparent;
        -webkit-app-region: drag;
        user-select: none;
      }
      #field {
        position: absolute;
        inset: 0;
        pointer-events: none;
      }
      .core {
        position: absolute;
        left: 62px;
        top: 64px;
        width: 72px;
        height: 72px;
        border-radius: 18px;
      }
      img { width: 100%; height: 100%; border-radius: inherit; pointer-events: none; }
      .dot {
        position: absolute;
        left: 0;
        top: 0;
        width: 12px;
        height: 12px;
        margin-left: -6px;
        margin-top: -6px;
        border-radius: 999px;
        background: #111;
        border: 2px solid rgba(255,255,255,.95);
        box-sizing: border-box;
        box-shadow: 0 2px 7px rgba(0,0,0,.22), 0 0 0 1px rgba(0,0,0,.14);
        will-change: transform, opacity;
      }
    </style>
  </head>
  <body>
    <div class="stage" title="opencode pet：拖拽移动，右键打开菜单">
      <div class="core"><img src="${iconDataUrl}" /></div>
      <div id="field"></div>
    </div>
    <script>
      window.__PET_STATE = ${initialStateJson}
      const field = document.getElementById("field")
      const center = { x: 98, y: 100 }
      const idleBase = { x: 184, y: 34 }
      const dots = new Map()
      let lastFrame = performance.now()
      let snapshot = window.__PET_STATE || { sessions: [] }

      function ease(current, target, factor) {
        return current + (target - current) * factor
      }

      function idleTarget(index) {
        return {
          x: idleBase.x + (index % 2) * 8,
          y: idleBase.y + index * 13,
        }
      }

      function ensureDot(session, index) {
        let dot = dots.get(session.sessionID)
        if (dot) return dot
        const el = document.createElement("div")
        el.className = "dot"
        el.title = session.sessionID
        field.appendChild(el)
        const start = session.state === "busy" ? idleTarget(index) : idleTarget(index)
        dot = {
          id: session.sessionID,
          el,
          x: start.x + 22,
          y: start.y,
          vx: 0,
          vy: 0,
          angle: -Math.PI / 2 + index * 0.9,
          alpha: 0,
          scale: 0.72,
          leaving: false,
          state: session.state,
        }
        dots.set(session.sessionID, dot)
        return dot
      }

      function setSnapshot(next) {
        snapshot = next || { sessions: [] }
        const live = new Set(snapshot.sessions.map((session) => session.sessionID))
        for (const dot of dots.values()) {
          if (!live.has(dot.id)) dot.leaving = true
        }
      }

      window.__setPetState = setSnapshot

      function tick(now) {
        const dt = Math.min(48, now - lastFrame) / 1000
        lastFrame = now
        const busy = snapshot.sessions.filter((session) => session.state === "busy")
        const idle = snapshot.sessions
          .filter((session) => session.state === "idle")
          .sort((a, b) => (b.idleAt || 0) - (a.idleAt || 0))
        const order = new Map()
        busy.forEach((session, index) => order.set(session.sessionID, { kind: "busy", index }))
        idle.forEach((session, index) => order.set(session.sessionID, { kind: "idle", index }))

        for (const session of snapshot.sessions) ensureDot(session, order.get(session.sessionID)?.index || 0)

        for (const [id, dot] of dots) {
          const info = order.get(id)
          let target = { x: dot.x + 26, y: dot.y }
          let targetScale = 0.2
          let targetAlpha = 0

          if (!dot.leaving && info?.kind === "busy") {
            const radius = 62 + (info.index % 3) * 13
            dot.angle += dt * (1.85 - (info.index % 3) * 0.15)
            target = {
              x: center.x + Math.cos(dot.angle + info.index * 0.42) * radius,
              y: center.y + Math.sin(dot.angle + info.index * 0.42) * radius,
            }
            targetScale = 1
            targetAlpha = 1
          } else if (!dot.leaving && info?.kind === "idle") {
            target = idleTarget(info.index)
            targetScale = 0.9
            targetAlpha = 0.88
          }

          const stiffness = info?.kind === "busy" ? 0.105 : 0.13
          const factor = 1 - Math.pow(1 - stiffness, dt * 60)
          dot.x = ease(dot.x, target.x, factor)
          dot.y = ease(dot.y, target.y, factor)
          dot.scale = ease(dot.scale, targetScale, factor)
          dot.alpha = ease(dot.alpha, targetAlpha, factor)
          dot.el.style.transform = "translate3d(" + dot.x + "px, " + dot.y + "px, 0) scale(" + dot.scale + ")"
          dot.el.style.opacity = String(dot.alpha)

          if (dot.leaving && dot.alpha < 0.03) {
            dot.el.remove()
            dots.delete(id)
          }
        }

        requestAnimationFrame(tick)
      }

      requestAnimationFrame(tick)
    </script>
  </body>
</html>`
}

function updatePet() {
  if (!petWindow || petWindow.isDestroyed()) return
  const stateJson = JSON.stringify(getPetState()).replaceAll("<", "\\u003c")
  petWindow.webContents.executeJavaScript(`window.__setPetState?.(${stateJson})`).catch(() => {})
}

function restorePosition(win) {
  try {
    const raw = fs.readFileSync(STATE_FILE, "utf8")
    const state = JSON.parse(raw)
    if (typeof state.x === "number" && typeof state.y === "number") {
      win.setPosition(state.x, state.y, false)
      return
    }
  } catch {
    // no previous position
  }

  const display = screen.getPrimaryDisplay().workArea
  win.setPosition(display.x + display.width - 110, display.y + display.height - 130, false)
}

function createPetWindow() {
  if (petWindow && !petWindow.isDestroyed()) return petWindow
  petWindow = new BrowserWindow({
    width: 230,
    height: 210,
    show: false,
    frame: false,
    resizable: false,
    transparent: true,
    alwaysOnTop: true,
    skipTaskbar: true,
    movable: true,
    hasShadow: false,
    title: APP_NAME,
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
    },
  })
  petWindow.setAlwaysOnTop(true, "floating")
  petWindow.loadURL("data:text/html;charset=utf-8," + encodeURIComponent(petHtml()))
  petWindow.webContents.on("context-menu", () => buildMenu().popup({ window: petWindow }))
  petWindow.on("moved", () => {
    const [x, y] = petWindow.getPosition()
    writeState({ visible: true, x, y })
    positionPanel()
  })
  petWindow.on("closed", () => {
    petWindow = null
  })
  restorePosition(petWindow)
  return petWindow
}

function createPanelWindow() {
  if (panelWindow && !panelWindow.isDestroyed()) return panelWindow

  panelWindow = new BrowserWindow({
    width: 360,
    height: 360,
    show: false,
    frame: false,
    resizable: false,
    transparent: true,
    alwaysOnTop: true,
    skipTaskbar: true,
    hasShadow: false,
    title: `${APP_NAME} inbox`,
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
    },
  })
  panelWindow.setAlwaysOnTop(true, "floating")
  panelWindow.on("closed", () => {
    panelWindow = null
  })
  updatePanel()
  return panelWindow
}

function positionPanel() {
  if (!petWindow || petWindow.isDestroyed() || !panelWindow || panelWindow.isDestroyed()) return
  const [x, y] = petWindow.getPosition()
  const petBounds = petWindow.getBounds()
  const panelBounds = panelWindow.getBounds()
  const display = screen.getDisplayNearestPoint({ x, y }).workArea
  let nextX = x - panelBounds.width - 10
  let nextY = y
  if (nextX < display.x) nextX = x + petBounds.width + 10
  if (nextX + panelBounds.width > display.x + display.width) nextX = display.x + display.width - panelBounds.width - 8
  if (nextY + panelBounds.height > display.y + display.height) nextY = display.y + display.height - panelBounds.height - 8
  if (nextY < display.y) nextY = display.y + 8
  panelWindow.setPosition(Math.round(nextX), Math.round(nextY), false)
}

function showPanel() {
  showPet()
  const win = createPanelWindow()
  updatePanel()
  positionPanel()
  win.show()
  win.moveTop()
}

function hidePanel() {
  if (panelWindow && !panelWindow.isDestroyed()) panelWindow.hide()
}

function togglePanel() {
  const win = createPanelWindow()
  if (win.isVisible()) hidePanel()
  else showPanel()
}

function showPet() {
  const win = createPetWindow()
  win.show()
  win.moveTop()
  writeState({ visible: true })
}

function hidePet() {
  if (petWindow && !petWindow.isDestroyed()) petWindow.hide()
  writeState({ visible: false })
}

function buildMenu() {
  return Menu.buildFromTemplate([
    { label: "Show Pet", click: showPet },
    { label: "Show Inbox", click: showPanel },
    { label: "Hide Pet", click: hidePet },
    { label: "Hide Inbox", click: hidePanel },
    { type: "separator" },
    { label: "Quit Pet", click: () => app.quit() },
  ])
}

function startServer() {
  if (server) return
  server = http.createServer(async (req, res) => {
    try {
      if (req.method === "OPTIONS") return json(res, 200, { ok: true })
      const url = new URL(req.url || "/", `http://${HOST}:${PORT}`)

      if (req.method === "GET" && url.pathname === "/health") {
        return json(res, 200, { status: "good", pid: process.pid, port: PORT, events: events.length })
      }

      if (req.method === "POST" && url.pathname === "/event") {
        const body = await readRequestJson(req)
        const item = recordEvent(body)
        return json(res, 200, { ok: true, event: item })
      }

      if (req.method === "POST" && url.pathname === "/show") {
        showPet()
        return json(res, 200, { ok: true })
      }

      if (req.method === "POST" && url.pathname === "/toggle-panel") {
        togglePanel()
        return json(res, 200, { ok: true, visible: panelWindow?.isVisible() === true })
      }

      if (req.method === "POST" && url.pathname === "/quit") {
        recordEvent({ type: "command.quit", source: "http" })
        json(res, 200, { ok: true, quitting: true })
        setTimeout(() => app.quit(), 50)
        return
      }

      return json(res, 404, { ok: false, error: "not found" })
    } catch (error) {
      return json(res, 500, { ok: false, error: error instanceof Error ? error.message : String(error) })
    }
  })
  server.listen(PORT, HOST, () => {
    writeState({ visible: petWindow?.isVisible() === true, mode: "floating", port: PORT })
  })
}

function start() {
  app.dock?.hide()
  writeState({ visible: false, mode: "floating" })
  startServer()
  cleanupTimer = setInterval(() => pruneIdleSessions(true), 30 * 1000)
  cleanupTimer.unref?.()
  showPet()
}

const lock = app.requestSingleInstanceLock()

if (!lock) {
  app.quit()
} else {
  app.on("second-instance", (_event, argv) => {
    if (shouldQuit(argv)) {
      app.quit()
      return
    }
    showPet()
    recordEvent({ type: "app.second-instance", argv })
  })

  app.whenReady().then(() => {
    if (shouldQuit()) {
      app.quit()
      return
    }
    start()
  })

  app.on("window-all-closed", (event) => {
    event.preventDefault()
  })

  app.on("before-quit", () => {
    try {
      server?.close()
      if (cleanupTimer) clearInterval(cleanupTimer)
      writeState({ stoppedAt: Date.now(), visible: false, mode: "floating" })
    } catch {
      // ignore shutdown errors
    }
  })
}
