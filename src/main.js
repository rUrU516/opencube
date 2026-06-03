const { app, BrowserWindow, Menu, screen } = require("electron")
const fs = require("node:fs")
const http = require("node:http")
const os = require("node:os")
const path = require("node:path")

const { DEFAULT_SESSION_COLORS, pixelPetSvg } = require("./pixel-pet-reference.cjs")

const APP_NAME = "opencode pet"
const HOST = "127.0.0.1"
const PORT = Number(process.env.OPENCODE_PET_PORT || 47832)
const DATA_DIR = path.join(os.homedir(), ".local", "share", "opencube")
const STATE_FILE = path.join(DATA_DIR, "state.json")
const PET_HTML_FILE = path.join(DATA_DIR, "pet.html")
const ICON_PATH = process.env.OPENCODE_PET_ICON || path.join(__dirname, "..", "assets", "opencode-icon.png")
const MAX_EVENTS = 100
const IDLE_TTL_MS = 5 * 60 * 1000

let petWindow = null
let panelWindow = null
let server = null
let events = []
let petSignals = []
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

function randomBetween(min, max) {
  return min + Math.random() * (max - min)
}

function createBounceDynamics() {
  const bounds = { left: 42, top: 44, right: 154, bottom: 156 }
  const half = 8
  const speed = randomBetween(74, 122)
  const angle = randomBetween(-Math.PI, Math.PI)
  return {
    x: randomBetween(bounds.left + half, bounds.right - half),
    y: randomBetween(bounds.top + half, bounds.bottom - half),
    vx: Math.cos(angle) * speed,
    vy: Math.sin(angle) * speed,
    speed,
    bounds,
  }
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
  if (item.type === "hello" || item.type === "fancy_hello") {
    petSignals.push({
      id: item.id,
      type: "hello",
      mode: item.type === "fancy_hello" ? "fancy" : "single",
      receivedAt: item.receivedAt,
      sessionID: item.sessionID,
    })
    petSignals = petSignals.slice(-20)
  }
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
      orbitTouchedAt: now,
      dynamics: current?.dynamics || createBounceDynamics(),
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
      orbitTouchedAt: current?.orbitTouchedAt,
      dynamics: current?.dynamics || createBounceDynamics(),
      status: event.status || "idle",
    })
  }
}

function pruneIdleSessions(refresh = true) {
  const now = Date.now()
  let changed = false
  for (const [sessionID, session] of sessionMap) {
    const expiresFrom = session.idleAt || session.lastAt
    if (session.state === "idle" && expiresFrom && now - expiresFrom > IDLE_TTL_MS) {
      sessionMap.delete(sessionID)
      changed = true
    }
  }
  if (changed && refresh) updatePet()
}

function getPetState() {
  pruneIdleSessions(false)
  let busyIndex = 0
  let idleIndex = 0
  return {
    now: Date.now(),
    layout: {
      width: 256,
      height: 256,
      bodyViewBox: { width: 256, height: 256 },
      busyJuggle: { centerX: 108, baseY: 82, radiusX: 48, liftY: 58 },
      idlePile: { x: 194, y: 186, stepX: 17, stepY: 15, columns: 2 },
      ball: { size: 14 },
    },
    sessions: Array.from(sessionMap.values()).map((session, index) => ({
      sessionID: session.sessionID,
      state: session.state,
      busyAt: session.busyAt,
      idleAt: session.idleAt,
      lastAt: session.lastAt,
      orbitTouchedAt: session.orbitTouchedAt,
      dynamics: session.dynamics,
      index,
      busyIndex: session.state === "busy" ? busyIndex++ : undefined,
      idleIndex: session.state === "idle" ? idleIndex++ : undefined,
      color: DEFAULT_SESSION_COLORS[index % DEFAULT_SESSION_COLORS.length],
    })),
    signals: petSignals,
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

function createIconDataUrl() {
  try {
    const png = fs.readFileSync(ICON_PATH)
    return `data:image/png;base64,${png.toString("base64")}`
  } catch {
    const fallback = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 96 96"><rect width="96" height="96" rx="20" fill="#111"/><rect x="30" y="18" width="36" height="60" fill="#f4f4ef"/><rect x="40" y="32" width="16" height="32" fill="#050505"/></svg>`
    return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(fallback)}`
  }
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
  const petBodySvg = pixelPetSvg({ sessionCount: 0, showCaption: false })
  const initialStateJson = JSON.stringify(getPetState()).replaceAll("<", "\\u003c")
  const colorJson = JSON.stringify(DEFAULT_SESSION_COLORS)
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
        image-rendering: pixelated;
      }
      .pet-art {
        position: absolute;
        inset: 0;
        width: 256px;
        height: 256px;
        transform-origin: 106px 156px;
        transition: transform 120ms steps(2, end), filter 120ms steps(2, end);
      }
      .pet-art svg {
        display: block;
        width: 256px;
        height: 256px;
        shape-rendering: crispEdges;
      }
      .stage.has-busy .pet-art {
        animation: pet-work-bob 620ms steps(2, end) infinite;
        filter: drop-shadow(0 4px 0 rgba(0,0,0,.14));
      }
      #ball-layer {
        position: absolute;
        inset: 0;
        pointer-events: none;
      }
      .session-ball-runtime {
        position: absolute;
        left: 0;
        top: 0;
        width: 14px;
        height: 14px;
        margin-left: -7px;
        margin-top: -7px;
        box-sizing: border-box;
        background: var(--ball-color, #ff5d73);
        box-shadow: 0 3px 0 rgba(0,0,0,.32);
        image-rendering: pixelated;
        will-change: transform, opacity;
      }
      .session-ball-runtime::before {
        content: "";
        position: absolute;
        left: 4px;
        top: 2px;
        width: 4px;
        height: 4px;
        background: rgba(255,255,255,.72);
      }
      .session-ball-runtime.busy {
        z-index: 3;
      }
      .session-ball-runtime.idle {
        z-index: 1;
        box-shadow: 0 2px 0 rgba(0,0,0,.2);
      }
      @keyframes pet-work-bob {
        0%, 100% { transform: translateY(0); }
        50% { transform: translateY(-4px); }
      }
    </style>
  </head>
  <body>
    <div class="stage" title="opencode pet：拖拽移动，右键打开菜单">
      <div class="pet-art" aria-label="pixel opencode pet">${petBodySvg}</div>
      <div id="ball-layer"></div>
    </div>
    <script>
      window.__PET_STATE = ${initialStateJson}
      const SESSION_COLORS = ${colorJson}
      const stage = document.querySelector(".stage")
      const layer = document.getElementById("ball-layer")
      const physics = {
        idleTtl: ${IDLE_TTL_MS},
        busy: { leftHandX: 30, rightHandX: 184, handY: 112, peakY: 34, stepPx: 2, periodMs: 1180 },
        idlePile: { x: 194, y: 188, stepX: 17, stepY: 15, columns: 2 },
      }
      const balls = new Map()
      let lastFrame = performance.now()
      let snapshot = window.__PET_STATE || { sessions: [] }
      let latestDebug = { now: Date.now(), busy: 0, idle: 0, balls: [] }

      function ease(current, target, factor) {
        return current + (target - current) * factor
      }

      function clamp(value, min, max) {
        return Math.max(min, Math.min(max, value))
      }

      function snapPixel(value) {
        return Math.round(value / physics.busy.stepPx) * physics.busy.stepPx
      }

      function colorFor(session, index) {
        return session.color || SESSION_COLORS[index % SESSION_COLORS.length]
      }

      function ensureBall(session, index) {
        let ball = balls.get(session.sessionID)
        if (ball) {
          ball.el.style.setProperty("--ball-color", colorFor(session, index))
          return ball
        }
        const el = document.createElement("div")
        el.className = "session-ball-runtime"
        el.title = session.sessionID
        el.style.setProperty("--ball-color", colorFor(session, index))
        layer.appendChild(el)
        ball = {
          id: session.sessionID,
          el,
          x: 108,
          y: 86,
          alpha: 0,
          scale: 0.86,
          leaving: false,
          state: session.state,
        }
        balls.set(session.sessionID, ball)
        return ball
      }

      function setSnapshot(next) {
        snapshot = next || { sessions: [] }
        const live = new Set(snapshot.sessions.map((session) => session.sessionID))
        for (const ball of balls.values()) {
          if (!live.has(ball.id)) ball.leaving = true
        }
      }

      window.__setPetState = setSnapshot
      window.__getPetDebug = () => latestDebug

      function busyTarget(busyIndex, busyCount, now) {
        const count = Math.max(1, busyCount)
        const cycle = now / physics.busy.periodMs + busyIndex / count
        const halfCycle = Math.floor(cycle)
        const t = cycle - halfCycle
        const leftToRight = halfCycle % 2 === 0
        const fromX = leftToRight ? physics.busy.leftHandX : physics.busy.rightHandX
        const toX = leftToRight ? physics.busy.rightHandX : physics.busy.leftHandX
        const handY = physics.busy.handY
        const peakLift = handY - physics.busy.peakY
        const arc = 4 * t * (1 - t)
        const laneOffset = (busyIndex - (count - 1) / 2) * Math.min(8, 2 + count * 2)
        const catchDip = Math.abs(t - 0.5) > 0.43 ? 4 : 0
        return {
          x: snapPixel(fromX + (toX - fromX) * t + laneOffset),
          y: snapPixel(handY - arc * peakLift + catchDip),
        }
      }

      function idleTarget(idleIndex) {
        const col = idleIndex % physics.idlePile.columns
        const row = Math.floor(idleIndex / physics.idlePile.columns)
        return {
          x: physics.idlePile.x + col * physics.idlePile.stepX,
          y: physics.idlePile.y - row * physics.idlePile.stepY + (col ? 5 : 0),
        }
      }

      function tick(now) {
        const dt = Math.min(48, now - lastFrame) / 1000
        lastFrame = now
        const sessions = snapshot.sessions || []
        const busySessions = sessions.filter((session) => session.state === "busy")
        const idleSessions = sessions.filter((session) => session.state === "idle")
        const order = new Map()
        busySessions.forEach((session, busyIndex) => order.set(session.sessionID, { kind: "busy", busyIndex, index: session.index ?? busyIndex, session }))
        idleSessions.forEach((session, idleIndex) => order.set(session.sessionID, { kind: "idle", idleIndex, index: session.index ?? idleIndex, session }))

        stage.classList.toggle("has-busy", busySessions.length > 0)
        stage.classList.toggle("has-sessions", sessions.length > 0)

        for (const session of sessions) ensureBall(session, session.index || 0)
        const debugBalls = []

        for (const [id, ball] of balls) {
          const info = order.get(id)
          let targetX = ball.x
          let targetY = ball.y
          let targetScale = 0.96
          let targetAlpha = 0.9
          let className = "session-ball-runtime"

          if (ball.leaving || !info) {
            targetScale = 0.2
            targetAlpha = 0
          } else if (info.kind === "busy") {
            const target = busyTarget(info.busyIndex, busySessions.length, now)
            targetX = target.x
            targetY = target.y
            targetScale = 1
            targetAlpha = 1
            className += " busy"
          } else {
            const target = idleTarget(info.idleIndex)
            targetX = target.x
            targetY = target.y
            const expiresFrom = info.session?.idleAt || info.session?.lastAt || Date.now()
            const remaining = expiresFrom + physics.idleTtl - Date.now()
            const fade = clamp(remaining / physics.idleTtl, 0, 1)
            targetAlpha = 0.88 * fade
            targetScale = 0.92
            className += " idle"
          }

          const factor = 1 - Math.pow(0.06, dt)
          ball.x = ease(ball.x, targetX, factor)
          ball.y = ease(ball.y, targetY, factor)
          ball.scale = ease(ball.scale, targetScale, factor)
          ball.alpha = ease(ball.alpha, targetAlpha, factor)
          ball.el.className = className
          ball.el.style.transform = "translate3d(" + snapPixel(ball.x) + "px, " + snapPixel(ball.y) + "px, 0) scale(" + ball.scale + ")"
          ball.el.style.opacity = String(ball.alpha)
          debugBalls.push({
            id,
            state: info?.kind || "leaving",
            x: snapPixel(ball.x),
            y: snapPixel(ball.y),
            alpha: Number(ball.alpha.toFixed(3)),
            scale: Number(ball.scale.toFixed(3)),
            className,
          })

          if (ball.leaving && ball.alpha < 0.03) {
            ball.el.remove()
            balls.delete(id)
          }
        }

        latestDebug = { now: Date.now(), busy: busySessions.length, idle: idleSessions.length, balls: debugBalls }

        requestAnimationFrame(tick)
      }

      requestAnimationFrame(tick)
    </script>
  </body>
</html>`
}

function petHtml3D() {
  const initialStateJson = JSON.stringify(getPetState()).replaceAll("<", "\\u003c")
  const iconUrl = createIconDataUrl()
  const threeCjsPath = JSON.stringify(path.join(path.dirname(require.resolve("three")), "three.cjs"))
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
      #scene {
        position: absolute;
        inset: 0;
        width: 100%;
        height: 100%;
        pointer-events: none;
      }
    </style>
  </head>
  <body>
    <div class="stage" title="opencode pet：拖拽移动，右键打开菜单">
      <canvas id="scene" aria-label="3D opencode pet"></canvas>
    </div>
    <script>
      window.__PET_BOOT_ERROR = null
      window.addEventListener("error", (event) => {
        window.__PET_BOOT_ERROR = { ok: false, error: String(event.error?.stack || event.message || event), source: event.filename, line: event.lineno, column: event.colno }
      })
      window.addEventListener("unhandledrejection", (event) => {
        window.__PET_BOOT_ERROR = { ok: false, error: String(event.reason?.stack || event.reason || event) }
      })
    </script>
    <script>
      const THREE = require(${threeCjsPath})

      window.__PET_STATE = ${initialStateJson}
      const stage = document.querySelector(".stage")
      const faceOrder = ["front", "right", "top", "back", "left", "bottom"]
      const sessionFaceMap = new Map()
      const sessionColorMap = new Map()
      const handledSignalIDs = new Set()
      const faceFlashes = new Map()
      const colorReleaseSpeed = 90
      const faceMeshes = new Map()
      const glowMeshes = new Map()
      let snapshot = window.__PET_STATE || { sessions: [] }
      let lastFrame = performance.now()
      let rotation = { x: -14, y: -28, z: 0 }
      let angularVelocity = { x: 0, y: 0, z: 0 }
      let torque = { x: 0, y: 0, z: 0 }
      let nextTorqueAt = 0
      let wasBusy = false
      let latestDebug = { now: Date.now(), busy: 0, rotation, angularVelocity, torque, speed: 0, faceRotations: {} }

      const canvas = document.getElementById("scene")
      const scene = new THREE.Scene()
      const camera = new THREE.PerspectiveCamera(34, 1, 0.1, 20)
      camera.position.set(0, 0.04, 3.25)
      const renderer = new THREE.WebGLRenderer({ canvas, alpha: true, antialias: true })
      renderer.setClearColor(0x000000, 0)
      renderer.setPixelRatio(Math.min((window.devicePixelRatio || 1) * 1.5, 3))
      renderer.outputColorSpace = THREE.SRGBColorSpace

      const cubeGroup = new THREE.Group()
      scene.add(cubeGroup)
      const iconTexture = new THREE.TextureLoader().load("${iconUrl}")
      iconTexture.colorSpace = THREE.SRGBColorSpace
      iconTexture.generateMipmaps = false
      iconTexture.minFilter = THREE.LinearFilter
      iconTexture.magFilter = THREE.LinearFilter
      iconTexture.anisotropy = 8
      const iconMaterial = new THREE.MeshBasicMaterial({
        map: iconTexture,
        transparent: true,
        alphaTest: 0.02,
        side: THREE.DoubleSide,
      })
      const glowTexture = createGlowTexture()
      const faceGeometry = new THREE.PlaneGeometry(0.60, 0.60)
      const glowGeometry = new THREE.PlaneGeometry(1.18, 1.18)
      const rad = THREE.MathUtils.degToRad

      function createGlowTexture() {
        const canvas = document.createElement("canvas")
        canvas.width = 256
        canvas.height = 256
        const ctx = canvas.getContext("2d")
        const gradient = ctx.createRadialGradient(128, 128, 4, 128, 128, 124)
        gradient.addColorStop(0, "rgba(255,255,255,1)")
        gradient.addColorStop(0.18, "rgba(255,255,255,1)")
        gradient.addColorStop(0.46, "rgba(255,255,255,.62)")
        gradient.addColorStop(0.80, "rgba(255,255,255,.22)")
        gradient.addColorStop(1, "rgba(255,255,255,0)")
        ctx.fillStyle = gradient
        ctx.fillRect(0, 0, 256, 256)
        const texture = new THREE.CanvasTexture(canvas)
        texture.colorSpace = THREE.SRGBColorSpace
        return texture
      }

      function resize() {
        const width = Math.max(1, window.innerWidth)
        const height = Math.max(1, window.innerHeight)
        renderer.setSize(width, height, false)
        camera.aspect = width / height
        camera.updateProjectionMatrix()
      }
      window.addEventListener("resize", resize)
      resize()

      function randomBetween(min, max) {
        return min + Math.random() * (max - min)
      }

      function randomSign() {
        return Math.random() > 0.5 ? 1 : -1
      }

      function randomTorque() {
        return {
          x: randomBetween(45, 130) * randomSign(),
          y: randomBetween(90, 260) * randomSign(),
          z: randomBetween(18, 80) * randomSign(),
        }
      }

      function randomChoice(items) {
        return items[Math.floor(Math.random() * items.length)]
      }

      function hslToRgb(h, s, l) {
        const c = (1 - Math.abs(2 * l - 1)) * s
        const hp = h / 60
        const x = c * (1 - Math.abs((hp % 2) - 1))
        let r = 0
        let g = 0
        let b = 0
        if (hp < 1) [r, g, b] = [c, x, 0]
        else if (hp < 2) [r, g, b] = [x, c, 0]
        else if (hp < 3) [r, g, b] = [0, c, x]
        else if (hp < 4) [r, g, b] = [0, x, c]
        else if (hp < 5) [r, g, b] = [x, 0, c]
        else [r, g, b] = [c, 0, x]
        const m = l - c / 2
        return {
          r: Math.round((r + m) * 255),
          g: Math.round((g + m) * 255),
          b: Math.round((b + m) * 255),
        }
      }

      function randomSessionGlowColor() {
        const hue = randomBetween(0, 360)
        const saturation = randomBetween(0.68, 0.94)
        const lightness = randomBetween(0.50, 0.66)
        const rgb = hslToRgb(hue, saturation, lightness)
        return {
          ...rgb,
          name: "random-" + Math.round(hue),
        }
      }

      function makeFaceRotations() {
        const quarterTurns = [0, 90, 180, 270]
        return {
          front: Math.random() < 0.7 ? 0 : randomChoice(quarterTurns),
          back: randomChoice(quarterTurns),
          right: randomChoice(quarterTurns),
          left: randomChoice(quarterTurns),
          top: randomChoice(quarterTurns),
          bottom: randomChoice(quarterTurns),
        }
      }

      const faceRotations = makeFaceRotations()
      createFace("front", [0, 0, 0.30], [0, 0, rad(faceRotations.front || 0)], [0, 0, 0.314])
      createFace("back", [0, 0, -0.30], [0, Math.PI, rad(faceRotations.back || 0)], [0, 0, -0.314])
      createFace("right", [0.30, 0, 0], [0, Math.PI / 2, rad(faceRotations.right || 0)], [0.314, 0, 0])
      createFace("left", [-0.30, 0, 0], [0, -Math.PI / 2, rad(faceRotations.left || 0)], [-0.314, 0, 0])
      createFace("top", [0, 0.30, 0], [-Math.PI / 2, 0, rad(faceRotations.top || 0)], [0, 0.314, 0])
      createFace("bottom", [0, -0.30, 0], [Math.PI / 2, 0, rad(faceRotations.bottom || 0)], [0, -0.314, 0])

      function createFace(name, position, rotation, glowPosition) {
        const face = new THREE.Mesh(faceGeometry, iconMaterial.clone())
        face.position.set(...position)
        face.rotation.set(...rotation)
        cubeGroup.add(face)
        faceMeshes.set(name, face)

        const glow = new THREE.Mesh(
          glowGeometry,
          new THREE.MeshBasicMaterial({
            map: glowTexture,
            color: 0x1fdccd,
            transparent: true,
            opacity: 0,
            blending: THREE.AdditiveBlending,
            depthWrite: false,
            side: THREE.DoubleSide,
          }),
        )
        glow.position.set(...glowPosition)
        glow.rotation.set(...rotation)
        cubeGroup.add(glow)
        glowMeshes.set(name, glow)
      }

      function magnitude(vector) {
        return Math.sqrt(vector.x * vector.x + vector.y * vector.y + vector.z * vector.z)
      }

      function clampMagnitude(vector, max) {
        const length = magnitude(vector)
        if (length <= max || length === 0) return vector
        const scale = max / length
        vector.x *= scale
        vector.y *= scale
        vector.z *= scale
        return vector
      }

      function setNextTorque(now) {
        torque = randomTorque()
        nextTorqueAt = now + randomBetween(4800, 5200)
      }

      function setSnapshot(next) {
        snapshot = next || { sessions: [] }
      }

      function syncBusyFaces(sessions, speed) {
        const busySessions = sessions
          .filter((session) => session.state === "busy" && typeof session.sessionID === "string")
          .sort((a, b) => (b.busyAt || b.lastAt || 0) - (a.busyAt || a.lastAt || 0))
        const busyIDs = busySessions.map((session) => session.sessionID)
        const busySet = new Set(busyIDs)

        if (busyIDs.length === 0) {
          if (speed < colorReleaseSpeed) {
            sessionFaceMap.clear()
            sessionColorMap.clear()
          }
        } else {
          for (const sessionID of Array.from(sessionColorMap.keys())) {
            if (!busySet.has(sessionID)) sessionColorMap.delete(sessionID)
          }
        }

        for (const sessionID of busyIDs) {
          if (!sessionColorMap.has(sessionID)) {
            sessionColorMap.set(sessionID, randomSessionGlowColor())
          }
        }

        if (busyIDs.length > 0) {
          sessionFaceMap.clear()
          for (const [index, session] of busySessions.slice(0, faceOrder.length).entries()) {
            sessionFaceMap.set(session.sessionID, faceOrder[index])
          }
        }

        const faceColors = new Map()
        for (const [sessionID, faceName] of sessionFaceMap) {
          faceColors.set(faceName, sessionColorMap.get(sessionID) || randomSessionGlowColor())
        }
        for (const faceName of faceOrder) {
          const color = faceColors.get(faceName)
          const face = faceMeshes.get(faceName)
          const glow = glowMeshes.get(faceName)
          if (color) {
            const threeColor = new THREE.Color(color.r / 255, color.g / 255, color.b / 255)
            face.material.color.copy(threeColor).lerp(new THREE.Color(0xffffff), 0.58)
            glow.material.color.setRGB(color.r / 255, color.g / 255, color.b / 255)
            glow.material.opacity = 0.98
            glow.scale.setScalar(1.24)
          } else {
            face.material.color.setRGB(1, 1, 1)
            glow.material.opacity = 0
          }
        }
        return Object.fromEntries(Array.from(sessionFaceMap.entries()).map(([sessionID, faceName]) => {
          const color = sessionColorMap.get(sessionID) || randomSessionGlowColor()
          return [sessionID, { face: faceName, color: color.name, rgb: [color.r, color.g, color.b] }]
        }))
      }

      function chooseUnlitFace() {
        const litFaces = new Set(sessionFaceMap.values())
        const candidates = faceOrder.filter((faceName) => !litFaces.has(faceName) && !faceFlashes.has(faceName))
        if (candidates.length === 0) return undefined
        return randomChoice(candidates)
      }

      function processSignals(signals, now) {
        for (const signal of signals || []) {
          if (!signal?.id || handledSignalIDs.has(signal.id)) continue
          handledSignalIDs.add(signal.id)
          if (signal.type !== "hello") continue

          if (signal.mode === "fancy") {
            const litFaces = new Set(sessionFaceMap.values())
            const candidates = faceOrder.filter((faceName) => !litFaces.has(faceName) && !faceFlashes.has(faceName))
            for (const faceName of candidates) {
              const burstCount = Math.floor(randomBetween(8, 15))
              let cursor = randomBetween(0, 140)
              const bursts = []
              for (let index = 0; index < burstCount; index++) {
                const duration = randomBetween(150, 300)
                bursts.push({
                  at: cursor,
                  duration,
                  color: randomSessionGlowColor(),
                  peak: randomBetween(0.82, 1.24),
                })
                cursor += duration + randomBetween(35, 150)
              }
              faceFlashes.set(faceName, {
                signalID: signal.id,
                mode: "fancy",
                startedAt: now,
                duration: cursor + 260,
                bursts,
              })
            }
            continue
          }

          const faceName = chooseUnlitFace()
          if (!faceName) continue
          faceFlashes.set(faceName, {
            signalID: signal.id,
            mode: "single",
            startedAt: now,
            duration: 1320,
            bursts: [{ at: 0, duration: 1320, color: randomSessionGlowColor(), peak: 1 }],
          })
        }

        // Keep the handled set bounded; only the latest signals are sent by the host.
        if (handledSignalIDs.size > 80) {
          const liveIDs = new Set((signals || []).map((signal) => signal?.id).filter(Boolean))
          for (const id of Array.from(handledSignalIDs)) {
            if (!liveIDs.has(id)) handledSignalIDs.delete(id)
          }
        }
      }

      function applyFlashFaces(now) {
        const litFaces = new Set(sessionFaceMap.values())
        const active = {}
        for (const [faceName, flash] of Array.from(faceFlashes.entries())) {
          const elapsed = now - flash.startedAt
          if (elapsed >= flash.duration || litFaces.has(faceName)) {
            faceFlashes.delete(faceName)
            continue
          }

          const progress = elapsed / flash.duration
          let strength = 0
          let color = undefined
          for (const burst of flash.bursts || []) {
            const burstElapsed = elapsed - burst.at
            if (burstElapsed < 0 || burstElapsed > burst.duration) continue
            const burstProgress = burstElapsed / burst.duration
            const pulses = flash.mode === "single"
              ? Math.sin(progress * Math.PI * 6)
              : Math.sin(burstProgress * Math.PI)
            const burstStrength = Math.max(0, pulses) * (burst.peak || 1) * (1 - progress * 0.08)
            if (burstStrength > strength) {
              strength = burstStrength
              color = burst.color
            }
          }
          if (strength <= 0.01) {
            active[faceName] = { strength: 0, signalID: flash.signalID }
            continue
          }

          const face = faceMeshes.get(faceName)
          const glow = glowMeshes.get(faceName)
          color ??= randomSessionGlowColor()
          const threeColor = new THREE.Color(color.r / 255, color.g / 255, color.b / 255)
          face.material.color.copy(threeColor).lerp(new THREE.Color(0xffffff), 0.70)
          glow.material.color.setRGB(color.r / 255, color.g / 255, color.b / 255)
          glow.material.opacity = 0.18 + strength * 0.82
          glow.scale.setScalar(1.00 + strength * 0.32)
          active[faceName] = { strength, signalID: flash.signalID }
        }
        return active
      }

      window.__setPetState = setSnapshot
      window.__getPetDebug = () => latestDebug

      function renderCube() {
        cubeGroup.rotation.x = rad(rotation.x)
        cubeGroup.rotation.y = rad(rotation.y)
        cubeGroup.rotation.z = rad(rotation.z)
        renderer.render(scene, camera)
      }

      function tick(now) {
        const dt = Math.min(64, now - lastFrame) / 1000
        lastFrame = now
        const sessions = snapshot.sessions || []
        const busyCount = sessions.filter((session) => session.state === "busy").length
        const isBusy = busyCount > 0

        if (isBusy && !wasBusy) setNextTorque(now)
        if (isBusy && now >= nextTorqueAt) setNextTorque(now)
        if (!isBusy) torque = { x: 0, y: 0, z: 0 }
        wasBusy = isBusy
        stage.classList.toggle("has-busy", isBusy)
        stage.classList.toggle("has-sessions", sessions.length > 0)

        const inertia = 1.18
        const friction = isBusy ? 0.58 : 2.85
        angularVelocity.x += (torque.x / inertia) * dt
        angularVelocity.y += (torque.y / inertia) * dt
        angularVelocity.z += (torque.z / inertia) * dt
        const damping = Math.exp(-friction * dt)
        angularVelocity.x *= damping
        angularVelocity.y *= damping
        angularVelocity.z *= damping
        clampMagnitude(angularVelocity, 1400)

        rotation.x += angularVelocity.x * dt
        rotation.y += angularVelocity.y * dt
        rotation.z += angularVelocity.z * dt

        const speed = magnitude(angularVelocity)
        const speedRatio = Math.min(1, speed / 1400)
        const glow = Math.pow(speedRatio, 2.3)
        const glowR = Math.round(92 + (0 - 92) * glow)
        const glowG = Math.round(255 + (190 - 255) * glow)
        const glowB = Math.round(232 + (210 - 232) * glow)
        const busyFaces = syncBusyFaces(sessions, speed)
        processSignals(snapshot.signals || [], now)
        const helloFlashes = applyFlashFaces(now)
        renderCube()
        latestDebug = {
          now: Date.now(),
          busy: busyCount,
          rotation: { ...rotation },
          angularVelocity: { ...angularVelocity },
          torque: { ...torque },
          speed,
          speedRatio,
          nextTorqueAt,
          glow,
          colorReleaseSpeed,
          glowColor: { r: glowR, g: glowG, b: glowB },
          faceRotations,
          busyFaces,
          helloFlashes,
        }
        requestAnimationFrame(tick)
      }

      renderCube()
      requestAnimationFrame(tick)
    </script>
  </body>
</html>`
}

function writePetHtmlFile() {
  ensureDataDir()
  fs.writeFileSync(PET_HTML_FILE, petHtml3D(), "utf8")
  return PET_HTML_FILE
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
  const bounds = win.getBounds()
  const x = display.x + 24
  const y = display.y + Math.round(display.height * 0.62 - bounds.height / 2)
  win.setPosition(x, Math.max(display.y + 8, Math.min(y, display.y + display.height - bounds.height - 8)), false)
}

function createPetWindow() {
  if (petWindow && !petWindow.isDestroyed()) return petWindow
  petWindow = new BrowserWindow({
    width: 120,
    height: 120,
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
      contextIsolation: false,
      nodeIntegration: true,
    },
  })
  petWindow.setAlwaysOnTop(true, "floating")
  petWindow.loadFile(writePetHtmlFile())
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
        return json(res, 200, {
          status: "good",
          pid: process.pid,
          port: PORT,
          events: events.length,
          pet: "opencube",
          sessions: getPetState().sessions.map(({ sessionID, state, busyIndex, idleIndex, color }) => ({
            sessionID,
            state,
            busyIndex,
            idleIndex,
            color,
          })),
        })
      }

      if (req.method === "GET" && url.pathname === "/state") {
        return json(res, 200, getPetState())
      }

      if (req.method === "GET" && url.pathname === "/snapshot") {
        const win = createPetWindow()
        const image = await win.webContents.capturePage()
        const png = image.toPNG()
        res.writeHead(200, {
          "content-type": "image/png",
          "access-control-allow-origin": "*",
        })
        res.end(png)
        return
      }

      if (req.method === "GET" && url.pathname === "/debug-render") {
        const win = createPetWindow()
        const debug = await win.webContents.executeJavaScript("window.__getPetDebug?.() || window.__PET_BOOT_ERROR", true).catch(() => undefined)
        return json(res, 200, debug || { ok: false, error: "debug renderer not ready" })
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
