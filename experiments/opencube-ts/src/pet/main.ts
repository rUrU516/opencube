const { app, BrowserWindow, Menu, Tray, nativeImage } = require("electron")
const http = require("node:http")
const path = require("node:path")

const APP_NAME = "OpenCube TS Experiment"
const HOST = "127.0.0.1"
const PORT = Number(process.env.OPENCODE_TS_PET_PORT || process.env.OPENCODE_PET_PORT || 47833)

let petWindow: any = null
let tray: any = null
let server: any = null
let events: Array<Record<string, unknown>> = []

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
  return `<!doctype html>
<html>
  <head>
    <meta charset="utf-8" />
    <style>
      html, body { margin: 0; width: 100%; height: 100%; background: transparent; overflow: hidden; }
      .cube {
        width: 72px;
        height: 72px;
        margin: 24px;
        border-radius: 18px;
        background: linear-gradient(135deg, #fff, #aaf7ff 55%, #ffe08a);
        box-shadow: 0 0 24px rgba(120, 240, 255, 0.75);
        display: grid;
        place-items: center;
        color: #111;
        font: 700 20px system-ui, sans-serif;
        user-select: none;
      }
    </style>
  </head>
  <body><div class="cube">TS</div></body>
</html>`
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
    hasShadow: false,
    title: APP_NAME,
  })
  petWindow.setAlwaysOnTop(true, "floating")
  petWindow.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(petHtml())}`)
  petWindow.on("closed", () => {
    petWindow = null
  })
  return petWindow
}

function showPet() {
  const win = createPetWindow()
  win.show()
  win.moveTop()
}

function createTray() {
  if (tray) return tray
  const image = nativeImage.createFromDataURL(
    "data:image/svg+xml;utf8," +
      encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 32 32"><rect x="5" y="5" width="22" height="22" rx="7" fill="#111"/><text x="16" y="21" text-anchor="middle" font-size="11" font-family="Arial" font-weight="700" fill="#8ff">TS</text></svg>`),
  )
  tray = new Tray(image.resize({ width: 18, height: 18 }))
  tray.setToolTip(APP_NAME)
  tray.setContextMenu(
    Menu.buildFromTemplate([
      { label: "Show OpenCube TS", click: showPet },
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
        const item = { ...body, id: `${Date.now()}-${Math.random().toString(16).slice(2)}`, at: Date.now() }
        events = [item, ...events].slice(0, 50)
        return json(res, 200, { ok: true, event: item })
      }
      if (req.method === "GET" && url.pathname === "/state") {
        return json(res, 200, { events })
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
    server?.close()
  } catch {}
})

app.on("window-all-closed", (event: any) => event.preventDefault())
