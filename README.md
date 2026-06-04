<p align="center">
  <img src="assets/opencode-icon.png" width="96" height="96" alt="OpenCube icon" />
</p>

# OpenCube

OpenCube is a tiny desktop pet for [opencode](https://opencode.ai/).

It watches opencode session activity and renders a small Three.js cube on your desktop:

- busy sessions light up cube faces
- active tool calls emit bright face-colored sparks from the corresponding cube face
- right-click drag applies extra rotational friction with small braking particles
- idle sessions keep a subtle torque-breathing motion and release face glow after the cube slows down
- a macOS-style tray/menu bar control can show, hide, quit, or open the Inbox
- the Inbox shows raw opencode hook events plus local mouse/keyboard diagnostics
- `/pet_say_hello` flashes one free face
- `/pet_fancy_say_hello` plays a randomized light show on free faces

OpenCube is packaged as an opencode plugin plus an Electron desktop process.

## Install

Install globally through opencode:

```sh
opencode plugin opencube --global
```

Then restart opencode and run:

```text
/pet
```

You can also add it manually to `~/.config/opencode/opencode.json`:

```json
{
  "plugin": ["opencube"]
}
```

## Commands

| Command | Description |
| --- | --- |
| `/pet` | Show or start OpenCube. |
| `/pet_stop` | Quit OpenCube. |
| `/pet_say_hello` | Flash one currently free face three times with a random color. |
| `/pet_fancy_say_hello` | Run a denser randomized light show across currently free faces. |

These commands are handled by the plugin and do not get sent to the model.

## What you can see

OpenCube turns opencode lifecycle events into small desktop signals:

| opencode activity | OpenCube signal |
| --- | --- |
| Session becomes busy | One cube face lights up with a stable session color. |
| Session becomes idle | The face glow is released once the cube slows down. |
| A tool call starts | The session's face emits fast, bright sparks in that face's current outward direction. |
| A tool call finishes | Spark emission stops; existing sparks fade out naturally. |
| Right mouse hold on the cube | Friction increases and braking particles appear. |
| Tray menu → Show Inbox | Opens a two-column event/debug panel. |

Multiple busy sessions can light multiple faces. If more than six sessions are busy, OpenCube shows the latest six.

## How it works

OpenCube has two parts in one npm package:

1. `src/plugin-server.cjs` — the opencode plugin entrypoint.
2. `src/main.js` — the Electron desktop pet.

The plugin registers slash commands, listens for opencode `session.status` events and `tool.execute.*` hooks, and sends events to the desktop pet over a local HTTP API:

```text
opencode plugin -> http://127.0.0.1:47832 -> Electron OpenCube
```

The Electron process owns the window, tray menu, Three.js renderer, cube rotation, face glow state, particle effects, and inbox/debug endpoints.

## Local API

OpenCube exposes a local-only HTTP API while it is running:

| Endpoint | Purpose |
| --- | --- |
| `GET /health` | Check whether OpenCube is running. |
| `GET /debug-render` | Inspect renderer state, busy faces, active tools, and particle counters. |
| `POST /event` | Receive opencode lifecycle/tool/hello events. |
| `POST /interaction` | Receive local renderer mouse/keyboard diagnostics. |
| `POST /show` | Show the cube window. |
| `POST /quit` | Quit OpenCube. |

The API binds to `127.0.0.1` only.

## Requirements

- opencode
- macOS, Windows, or Linux capable of running Electron
- network access to install npm dependencies during first plugin install

Users do not need to run `npm install` manually when installing via `opencode plugin`. opencode installs npm plugins and dependencies automatically.

## Notes

- The first install may take a while because Electron is downloaded as a runtime dependency.
- If Electron's platform binary is missing after installation, OpenCube attempts a first-run self-repair download.
- If commands do not appear after installation, restart opencode.
- OpenCube uses a local-only HTTP server on `127.0.0.1:47832`.
- If that port is already in use, set `OPENCODE_PET_PORT` before starting opencode.
- In opencode desktop, OpenCube currently uses a command-abort sentinel to keep local slash commands out of the model flow; depending on opencode version, the desktop UI may show an error toast even though the command was handled.

## Local development

From this repository:

```sh
npm install
npm run start
```

For local opencode plugin testing, point your opencode config at the package directory:

```json
{
  "plugin": ["/path/to/opencube"]
}
```

After changing plugin files or opencode config, restart opencode.

To inspect the package contents before publishing:

```sh
npm pack --dry-run
```
