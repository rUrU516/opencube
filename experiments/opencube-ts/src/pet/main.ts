import { OpenCodeState, type OpenCodeEvent, type SessionState } from "../opencode/state"
import { Cube } from "../cube/cube"
import { CubeState, type FaceState } from "../cube/state"
import { CubeEffectController } from "../engine/cube-effect-controller"

const { app, BrowserWindow, Menu, Tray, nativeImage, screen: electronScreen } = require("electron")
const fs = require("node:fs")
const http = require("node:http")
const path = require("node:path")

const APP_NAME = "OpenCube TS Experiment"
const HOST = "127.0.0.1"
const PORT = Number(process.env.OPENCODE_TS_PET_PORT || process.env.OPENCODE_PET_PORT || 47833)
const ICON_PATH = path.resolve(__dirname, "../../../../assets/opencode-icon.png")
const PET_CUBE_SIZE = 120
const PET_DRAG_SIZE = 60
const PET_DRAG_OFFSET_Y = 10
const PET_RENDER_SIZE = 520

let petWindow: any = null
let dragWindow: any = null
let panelWindow: any = null
let tray: any = null
let server: any = null
let cubeTickTimer: ReturnType<typeof setInterval> | null = null
let syncingDragWindow = false
let events: Array<Record<string, unknown>> = []
const openCodeState = new OpenCodeState()
const cube = new Cube(
  new CubeState({
    rotation: { x: -14, y: -28, z: 0 },
    angularVelocity: { x: 0, y: 0, z: 0 },
    faces: Array.from({ length: 6 }, (): FaceState => ({ color: { r: 255, g: 255, b: 255 }, brightness: 0 })),
    particles: [],
  }),
)
const cubeEffectController = new CubeEffectController(cube)
openCodeState.onEvent((event, state) => cubeEffectController.sync(state, event))

function createIconDataUrl() {
  try {
    const png = fs.readFileSync(ICON_PATH)
    return `data:image/png;base64,${png.toString("base64")}`
  } catch {
    const fallback = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 96 96"><rect width="96" height="96" rx="20" fill="#111"/><rect x="30" y="18" width="36" height="60" fill="#f4f4ef"/><rect x="40" y="32" width="16" height="32" fill="#050505"/></svg>`
    return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(fallback)}`
  }
}

function toOpenCodeEvent(event: Record<string, unknown>): OpenCodeEvent | undefined {
  const type = event.type
  const sessionID = typeof event.sessionID === "string" ? event.sessionID : undefined
  if (!sessionID || typeof type !== "string") return undefined

  if (type === "busy") return { type: "session.busy", sessionID }
  if (type === "retry") return { type: "session.retry", sessionID }
  if (type === "idle") return { type: "session.idle", sessionID }

  if (type === "tool.start" || type === "tool.finish") {
    const callID = typeof event.callID === "string" ? event.callID : undefined
    if (!callID) return undefined
    const tool = typeof event.tool === "string" ? event.tool : undefined
    return { type, sessionID, callID, tool }
  }

  if (type === "permission.ask") {
    const requestID = typeof event.requestID === "string" ? event.requestID : undefined
    if (!requestID) return undefined
    const permission = typeof event.permission === "string" ? event.permission : undefined
    return { type, sessionID, requestID, permission }
  }

  if (type === "permission.reply") {
    const requestID = typeof event.requestID === "string" ? event.requestID : undefined
    if (!requestID) return undefined
    const reply = typeof event.reply === "string" ? event.reply : undefined
    return { type, sessionID, requestID, reply }
  }

  if (type === "question.ask") {
    const requestID = typeof event.requestID === "string" ? event.requestID : undefined
    if (!requestID) return undefined
    const questionCount = typeof event.questionCount === "number" ? event.questionCount : undefined
    return { type, sessionID, requestID, questionCount }
  }

  if (type === "question.reply" || type === "question.reject") {
    const requestID = typeof event.requestID === "string" ? event.requestID : undefined
    if (!requestID) return undefined
    return { type, sessionID, requestID }
  }

  return undefined
}

function sessionSnapshot(session: SessionState) {
  return {
    sessionID: session.sessionID,
    status: session.status,
    activeTools: Array.from(session.activeTools),
    pendingPermissions: Array.from(session.pendingPermissions),
    pendingQuestions: Array.from(session.pendingQuestions),
  }
}

function openCodeStateSnapshot() {
  const sessions = Array.from(openCodeState.sessions.values()).map(sessionSnapshot)
  return {
    sessions,
    totals: {
      sessions: sessions.length,
      busy: sessions.filter((session) => session.status === "busy").length,
      retry: sessions.filter((session) => session.status === "retry").length,
      idle: sessions.filter((session) => session.status === "idle").length,
      tools: sessions.reduce((total, session) => total + session.activeTools.length, 0),
      permissions: sessions.reduce((total, session) => total + session.pendingPermissions.length, 0),
      questions: sessions.reduce((total, session) => total + session.pendingQuestions.length, 0),
    },
  }
}

function json(res: any, status: number, body: unknown) {
  res.writeHead(status, {
    "content-type": "application/json",
    "access-control-allow-origin": "*",
    "access-control-allow-methods": "GET,POST,OPTIONS",
    "access-control-allow-headers": "content-type",
  })
  res.end(JSON.stringify(body))
}

async function readRequestJson(req: any) {
  const chunks: Buffer[] = []
  for await (const chunk of req) chunks.push(Buffer.from(chunk))
  if (chunks.length === 0) return {}
  return JSON.parse(Buffer.concat(chunks).toString("utf8"))
}

function petHtml() {
  const threeCjsPath = JSON.stringify(path.join(path.dirname(require.resolve("three")), "three.cjs"))
  const iconUrl = createIconDataUrl()
  return `<!doctype html>
<html>
  <head>
    <meta charset="utf-8" />
    <style>
      html, body { margin: 0; width: 100%; height: 100%; background: transparent; overflow: hidden; }
      .stage {
        box-sizing: border-box;
        width: 100%;
        height: 100%;
        position: relative;
        background: transparent;
        user-select: none;
      }
      #scene { position: absolute; inset: 0; width: ${PET_RENDER_SIZE}px; height: ${PET_RENDER_SIZE}px; pointer-events: none; }
    </style>
  </head>
  <body>
    <div class="stage"><canvas id="scene" aria-label="OpenCube TS cube"></canvas></div>
    <script>
      const THREE = require(${threeCjsPath})
      const { ipcRenderer } = require("electron")
      const canvas = document.getElementById("scene")
      const scene = new THREE.Scene()
      const camera = new THREE.PerspectiveCamera(34, 1, 0.1, 20)
      camera.position.set(0, 0.04, 3.25)
      const renderer = new THREE.WebGLRenderer({ canvas, alpha: true, antialias: true })
      renderer.setClearColor(0x000000, 0)
      renderer.setPixelRatio(Math.min((window.devicePixelRatio || 1) * 1.5, 3))
      renderer.outputColorSpace = THREE.SRGBColorSpace
      renderer.setSize(${PET_RENDER_SIZE}, ${PET_RENDER_SIZE}, false)

      const cubeGroup = new THREE.Group()
      const cubeScale = ${PET_CUBE_SIZE / PET_RENDER_SIZE}
      cubeGroup.scale.setScalar(cubeScale)
      scene.add(cubeGroup)
      const faceGeometry = new THREE.PlaneGeometry(0.60, 0.60)
      const glowGeometry = new THREE.PlaneGeometry(1.18, 1.18)
      const iconTexture = new THREE.TextureLoader().load("${iconUrl}")
      iconTexture.colorSpace = THREE.SRGBColorSpace
      iconTexture.generateMipmaps = false
      iconTexture.minFilter = THREE.LinearFilter
      iconTexture.magFilter = THREE.LinearFilter
      iconTexture.anisotropy = Math.min(renderer.capabilities.getMaxAnisotropy?.() || 8, 16)
      const iconMaterial = new THREE.MeshBasicMaterial({
        map: iconTexture,
        transparent: true,
        alphaTest: 0.02,
        side: THREE.DoubleSide,
      })
      const glowTexture = createGlowTexture()
      const rad = THREE.MathUtils.degToRad
      const faceGlows = []
      const particleSprites = []

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

      function randomChoice(items) {
        return items[Math.floor(Math.random() * items.length)]
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

      function createFace(position, rotation, glowPosition) {
        const glow = new THREE.Mesh(
          glowGeometry,
          new THREE.MeshBasicMaterial({
            map: glowTexture,
            color: 0xffffff,
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
        faceGlows.push(glow)

        const face = new THREE.Mesh(faceGeometry, iconMaterial.clone())
        face.position.set(...position)
        face.rotation.set(...rotation)
        cubeGroup.add(face)
      }

      const faceRotations = makeFaceRotations()
      createFace([0, 0, 0.30], [0, 0, rad(faceRotations.front || 0)], [0, 0, 0.314])
      createFace([0, 0, -0.30], [0, Math.PI, rad(faceRotations.back || 0)], [0, 0, -0.314])
      createFace([0.30, 0, 0], [0, Math.PI / 2, rad(faceRotations.right || 0)], [0.314, 0, 0])
      createFace([-0.30, 0, 0], [0, -Math.PI / 2, rad(faceRotations.left || 0)], [-0.314, 0, 0])
      createFace([0, 0.30, 0], [-Math.PI / 2, 0, rad(faceRotations.top || 0)], [0, 0.314, 0])
      createFace([0, -0.30, 0], [Math.PI / 2, 0, rad(faceRotations.bottom || 0)], [0, -0.314, 0])

      function applyCubeState(state) {
        const rotation = state?.rotation || { x: -14, y: -28, z: 0 }
        cubeGroup.rotation.x = rad(rotation.x || 0)
        cubeGroup.rotation.y = rad(rotation.y || 0)
        cubeGroup.rotation.z = rad(rotation.z || 0)

        const faces = Array.isArray(state?.faces) ? state.faces : []
        for (let index = 0; index < faceGlows.length; index += 1) {
          const glow = faceGlows[index]
          const face = faces[index]
          const brightness = typeof face?.brightness === "number" ? face.brightness : 0
          const color = face?.color || { r: 255, g: 255, b: 255 }
          glow.material.color.setRGB((color.r || 0) / 255, (color.g || 0) / 255, (color.b || 0) / 255)
          glow.material.opacity = Math.max(0, Math.min(0.98, brightness * 0.98))
          glow.scale.setScalar(1 + Math.max(0, Math.min(1, brightness)) * 0.24)
        }

        renderParticles(Array.isArray(state?.particles) ? state.particles : [])
      }

      function renderParticles(particles) {
        const visibleParticles = particles.slice(-120)
        while (particleSprites.length < visibleParticles.length) {
          const material = new THREE.SpriteMaterial({
            map: glowTexture,
            color: 0xffffff,
            transparent: true,
            opacity: 0,
            blending: THREE.AdditiveBlending,
            depthWrite: false,
          })
          const sprite = new THREE.Sprite(material)
          scene.add(sprite)
          particleSprites.push(sprite)
        }

        for (let index = 0; index < particleSprites.length; index += 1) {
          const sprite = particleSprites[index]
          const particle = visibleParticles[index]
          if (!particle) {
            sprite.visible = false
            sprite.material.opacity = 0
            continue
          }
          sprite.visible = true
          sprite.position.set(particle.position.x * cubeScale, particle.position.y * cubeScale, particle.position.z * cubeScale)
          sprite.scale.setScalar((particle.size || 0.12) * cubeScale)
          sprite.material.color.setRGB((particle.color.r || 255) / 255, (particle.color.g || 255) / 255, (particle.color.b || 255) / 255)
          sprite.material.opacity = Math.max(0, Math.min(1, particle.alpha ?? 1))
        }
      }

      ipcRenderer.on("cube-state", (_event, state) => {
        applyCubeState(state)
      })

      function tick() {
        renderer.render(scene, camera)
        requestAnimationFrame(tick)
      }

      applyCubeState({ rotation: { x: -14, y: -28, z: 0 } })
      requestAnimationFrame(tick)
    </script>
  </body>
</html>`
}

function escapeHtml(value: unknown) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;")
}

function dragTestHtml() {
  return `<!doctype html>
<html>
  <head>
    <meta charset="utf-8" />
    <style>
      html, body { margin: 0; width: 100%; height: 100%; overflow: hidden; background: transparent; }
      .drag-test {
        box-sizing: border-box;
        width: 100%;
        height: 100%;
        background: transparent;
        border: 2px solid rgba(130, 245, 255, 0.58);
        border-radius: 18px;
        user-select: none;
        -webkit-app-region: drag;
      }
    </style>
  </head>
  <body><div class="drag-test" aria-label="OpenCube TS drag handle"></div></body>
</html>`
}

function panelHtml() {
  const state = openCodeStateSnapshot()
  const stateRows = state.sessions
    .map((session, index) => {
      const sessionID = escapeHtml(session.sessionID)
      const status = escapeHtml(session.status)
      const json = escapeHtml(JSON.stringify(session, null, 2))
      return `<section class="state-card open"><header><span>#${index + 1}</span><strong>${sessionID}</strong><em>${status}</em><small>T${session.activeTools.length} P${session.pendingPermissions.length} Q${session.pendingQuestions.length}</small></header><pre>${json}</pre></section>`
    })
    .join("")
  const rows = events
    .slice(0, 50)
    .map((event, index) => {
      const type = escapeHtml(event.type || "event")
      const at = typeof event.at === "number" ? new Date(event.at).toLocaleTimeString() : ""
      const json = escapeHtml(JSON.stringify(event, null, 2))
      return `<section class="event"><header><span>#${index + 1}</span><strong>${type}</strong><time>${escapeHtml(at)}</time></header><pre>${json}</pre></section>`
    })
    .join("")

  return `<!doctype html>
<html>
  <head>
    <meta charset="utf-8" />
    <style>
      html, body { margin: 0; width: 100%; height: 100%; background: transparent; overflow: hidden; font-family: ui-monospace, SFMono-Regular, Menlo, monospace; }
      .panel { box-sizing: border-box; width: 100%; height: 100%; padding: 14px; color: #e9fbff; background: rgba(11, 16, 24, 0.92); border: 1px solid rgba(150, 240, 255, 0.35); border-radius: 16px; box-shadow: 0 18px 50px rgba(0,0,0,0.35); }
      .top { display: flex; align-items: center; gap: 10px; margin-bottom: 10px; }
      h1 { margin: 0; font: 700 14px system-ui, sans-serif; letter-spacing: 0.02em; }
      h2 { margin: 0 0 5px; color: rgba(233,251,255,0.7); font: 700 10px system-ui, sans-serif; text-transform: uppercase; letter-spacing: 0.08em; }
      .meta { margin-bottom: 10px; color: rgba(233,251,255,0.66); font-size: 11px; }
      .columns { display: grid; grid-template-columns: minmax(0, 1fr) minmax(0, 1fr); gap: 12px; height: 334px; }
      .column { min-width: 0; overflow: hidden; }
      .state, .events { height: 314px; overflow: auto; padding-right: 4px; display: flex; flex-direction: column; }
      .empty { color: rgba(233,251,255,0.55); font-size: 12px; }
      .event, .state-card { margin: 0 0 4px; padding: 4px 8px; border-radius: 8px; background: rgba(255,255,255,0.06); border: 1px solid rgba(255,255,255,0.08); cursor: pointer; }
      .state-card { background: rgba(159,247,255,0.055); border-color: rgba(159,247,255,0.12); }
      .event.open, .state-card.open { margin-bottom: 10px; padding: 10px; border-radius: 12px; }
      header { display: flex; gap: 8px; align-items: center; margin-bottom: 0; color: #9ff7ff; font-size: 10px; line-height: 1.2; }
      .event.open header, .state-card.open header { margin-bottom: 6px; font-size: 11px; }
      header em { color: #ffe08a; font-style: normal; }
      header small { color: rgba(233,251,255,0.58); }
      header time { margin-left: auto; color: rgba(233,251,255,0.5); }
      pre { display: none; margin: 0; white-space: pre-wrap; word-break: break-word; color: rgba(233,251,255,0.86); font-size: 11px; line-height: 1.35; }
      .event.open pre, .state-card.open pre { display: block; }
    </style>
  </head>
  <body><main class="panel"><div class="top"><h1>OpenCube TS Debug Panel</h1></div><div class="meta">Sessions ${state.totals.sessions} · busy ${state.totals.busy} · retry ${state.totals.retry} · tools ${state.totals.tools} · permissions ${state.totals.permissions} · questions ${state.totals.questions}</div><div class="columns"><section class="column"><h2>OpenCode State</h2><div class="state">${stateRows || '<div class="empty">No sessions yet.</div>'}</div></section><section class="column"><h2>Raw Events</h2><div class="events">${rows || '<div class="empty">No events yet.</div>'}</div></section></div></main><script>document.querySelectorAll(".event,.state-card").forEach((card) => card.addEventListener("click", () => card.classList.toggle("open")))</script></body>
</html>`
}

function createPetWindow() {
  if (petWindow && !petWindow.isDestroyed()) return petWindow
  petWindow = new BrowserWindow({
    width: PET_RENDER_SIZE,
    height: PET_RENDER_SIZE,
    show: false,
    frame: false,
    resizable: false,
    transparent: true,
    alwaysOnTop: true,
    skipTaskbar: true,
    hasShadow: false,
    title: APP_NAME,
    icon: ICON_PATH,
    webPreferences: {
      contextIsolation: false,
      nodeIntegration: true,
    },
  })
  petWindow.setAlwaysOnTop(true, "floating")
  petWindow.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(petHtml())}`)
  petWindow.setIgnoreMouseEvents(true, { forward: true })
  petWindow.on("closed", () => {
    petWindow = null
    if (dragWindow && !dragWindow.isDestroyed()) dragWindow.close()
    dragWindow = null
  })
  return petWindow
}

function syncRenderWindowToDragWindow() {
  if (!petWindow || petWindow.isDestroyed() || !dragWindow || dragWindow.isDestroyed()) return
  if (syncingDragWindow) return
  const [dragX, dragY] = dragWindow.getPosition()
  const dragCenter = {
    x: dragX + PET_DRAG_SIZE / 2,
    y: dragY + PET_DRAG_SIZE / 2,
  }
  const workArea = electronScreen.getDisplayNearestPoint(dragCenter).workArea
  const unclampedRenderX = Math.round(dragX - (PET_RENDER_SIZE - PET_DRAG_SIZE) / 2)
  const unclampedRenderY = Math.round(dragY - (PET_RENDER_SIZE - PET_DRAG_SIZE) / 2 - PET_DRAG_OFFSET_Y)
  const renderX = Math.max(workArea.x, Math.min(workArea.x + workArea.width - PET_RENDER_SIZE, unclampedRenderX))
  const renderY = Math.max(workArea.y, Math.min(workArea.y + workArea.height - PET_RENDER_SIZE, unclampedRenderY))
  petWindow.setPosition(renderX, renderY, false)

  const clampedDragX = Math.round(renderX + (PET_RENDER_SIZE - PET_DRAG_SIZE) / 2)
  const clampedDragY = Math.round(renderY + (PET_RENDER_SIZE - PET_DRAG_SIZE) / 2 + PET_DRAG_OFFSET_Y)
  if (clampedDragX !== dragX || clampedDragY !== dragY) {
    syncingDragWindow = true
    dragWindow.setPosition(clampedDragX, clampedDragY, false)
    syncingDragWindow = false
  }
}

function createDragWindow() {
  if (dragWindow && !dragWindow.isDestroyed()) return dragWindow
  const renderWindow = createPetWindow()
  const [renderX, renderY] = renderWindow.getPosition()
  dragWindow = new BrowserWindow({
    width: PET_DRAG_SIZE,
    height: PET_DRAG_SIZE,
    x: Math.round(renderX + (PET_RENDER_SIZE - PET_DRAG_SIZE) / 2),
    y: Math.round(renderY + (PET_RENDER_SIZE - PET_DRAG_SIZE) / 2 + PET_DRAG_OFFSET_Y),
    show: false,
    frame: false,
    resizable: false,
    transparent: true,
    alwaysOnTop: true,
    skipTaskbar: true,
    hasShadow: false,
    title: `${APP_NAME} Drag Test`,
    icon: ICON_PATH,
  })
  dragWindow.setAlwaysOnTop(true, "floating")
  dragWindow.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(dragTestHtml())}`)
  dragWindow.on("move", syncRenderWindowToDragWindow)
  dragWindow.on("closed", () => {
    dragWindow = null
  })
  return dragWindow
}

function sendCubeState() {
  if (!petWindow || petWindow.isDestroyed()) return
  petWindow.webContents.send("cube-state", cube.snapshot())
}

function startCubeTicker() {
  if (cubeTickTimer) return
  let lastTick = Date.now()
  cubeTickTimer = setInterval(() => {
    const now = Date.now()
    const dt = Math.min(0.064, (now - lastTick) / 1000)
    lastTick = now
    cube.tick(dt)
    sendCubeState()
  }, 1000 / 60)
  cubeTickTimer.unref?.()
}

function stopCubeTicker() {
  if (!cubeTickTimer) return
  clearInterval(cubeTickTimer)
  cubeTickTimer = null
}

function showPet() {
  const win = createPetWindow()
  const drag = createDragWindow()
  startCubeTicker()
  sendCubeState()
  win.show()
  win.moveTop()
  drag.show()
  syncRenderWindowToDragWindow()
  drag.moveTop()
}

function createPanelWindow() {
  if (panelWindow && !panelWindow.isDestroyed()) return panelWindow
  panelWindow = new BrowserWindow({
    width: 820,
    height: 420,
    show: false,
    frame: false,
    resizable: false,
    transparent: true,
    alwaysOnTop: true,
    skipTaskbar: true,
    hasShadow: false,
    title: `${APP_NAME} Debug`,
    icon: ICON_PATH,
  })
  panelWindow.setAlwaysOnTop(true, "floating")
  panelWindow.on("closed", () => {
    panelWindow = null
  })
  updatePanel()
  return panelWindow
}

function updatePanel() {
  if (!panelWindow || panelWindow.isDestroyed()) return
  panelWindow.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(panelHtml())}`)
}

function positionPanel() {
  if (!panelWindow || panelWindow.isDestroyed()) return
  const display = electronScreen.getPrimaryDisplay().workArea
  const bounds = panelWindow.getBounds()
  panelWindow.setPosition(display.x + display.width - bounds.width - 20, display.y + 40, false)
}

function showPanel() {
  const win = createPanelWindow()
  updatePanel()
  positionPanel()
  win.show()
  win.moveTop()
}

function hidePanel() {
  if (panelWindow && !panelWindow.isDestroyed()) panelWindow.hide()
}

function createTray() {
  if (tray) return tray
  let image = nativeImage.createFromPath(ICON_PATH)
  if (image.isEmpty()) {
    image = nativeImage.createFromDataURL(
      "data:image/svg+xml;utf8," +
        encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 32 32"><rect x="5" y="5" width="22" height="22" rx="7" fill="#111"/><text x="16" y="21" text-anchor="middle" font-size="11" font-family="Arial" font-weight="700" fill="#8ff">TS</text></svg>`),
    )
  }
  tray = new Tray(image.resize({ width: 18, height: 18 }))
  tray.setToolTip(APP_NAME)
  tray.setContextMenu(
    Menu.buildFromTemplate([
      { label: "Show OpenCube TS", click: showPet },
      { label: "Show Debug Panel", click: showPanel },
      { label: "Hide Debug Panel", click: hidePanel },
      { label: "Quit OpenCube TS", click: () => app.quit() },
    ]),
  )
  return tray
}

function startServer() {
  if (server) return
  server = http.createServer(async (req: any, res: any) => {
    try {
      if (req.method === "OPTIONS") return json(res, 200, { ok: true })
      const url = new URL(req.url || "/", `http://${HOST}:${PORT}`)

      if (req.method === "GET" && url.pathname === "/health") {
        return json(res, 200, { status: "good", pet: "opencube-ts", pid: process.pid, port: PORT, events: events.length })
      }
      if (req.method === "POST" && url.pathname === "/show") {
        showPet()
        return json(res, 200, { ok: true })
      }
      if (req.method === "POST" && url.pathname === "/event") {
        const body = await readRequestJson(req)
        const canonicalEvent = toOpenCodeEvent(body)
        if (canonicalEvent) openCodeState.applyEvent(canonicalEvent)
        const item = { ...body, id: `${Date.now()}-${Math.random().toString(16).slice(2)}`, at: Date.now() }
        events = [item, ...events].slice(0, 50)
        updatePanel()
        return json(res, 200, { ok: true, event: item })
      }
      if (req.method === "GET" && url.pathname === "/state") {
        return json(res, 200, { events, opencodeState: openCodeStateSnapshot() })
      }
      if (req.method === "POST" && url.pathname === "/quit") {
        json(res, 200, { ok: true, quitting: true })
        setTimeout(() => app.quit(), 50)
        return
      }

      return json(res, 404, { ok: false, error: "not found" })
    } catch (error) {
      return json(res, 500, { ok: false, error: error instanceof Error ? error.message : String(error) })
    }
  })
  server.listen(PORT, HOST)
}

app.whenReady().then(() => {
  app.dock?.hide()
  createTray()
  startServer()
  showPet()
})

app.on("before-quit", () => {
  try {
    stopCubeTicker()
    server?.close()
  } catch {}
})

app.on("window-all-closed", (event: any) => event.preventDefault())
