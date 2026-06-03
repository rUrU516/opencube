<p align="center">
  <img src="assets/opencode-icon.png" width="96" height="96" alt="OpenCub icon" />
</p>

# OpenCub

OpenCub is a tiny desktop pet for [opencode](https://opencode.ai/).

It watches opencode session activity and renders a small Three.js cube on your desktop:

- busy sessions light up cube faces
- idle sessions release their face glow after the cube slows down
- `/pet_say_hello` flashes one free face
- `/pet_fancy_say_hello` plays a randomized light show on free faces

OpenCub is packaged as an opencode plugin plus an Electron desktop process.

## Install

> OpenCub is not published yet. These are the intended install commands once published.

Install globally through opencode:

```sh
opencode plugin opencub --global
```

Then restart opencode and run:

```text
/pet
```

You can also add it manually to `~/.config/opencode/opencode.json`:

```json
{
  "plugin": ["opencub"]
}
```

## Commands

| Command | Description |
| --- | --- |
| `/pet` | Show or start OpenCub. |
| `/pet_stop` | Quit OpenCub. |
| `/pet_say_hello` | Flash one currently free face three times with a random color. |
| `/pet_fancy_say_hello` | Run a denser randomized light show across currently free faces. |

These commands are handled by the plugin and do not get sent to the model.

## How it works

OpenCub has two parts in one npm package:

1. `src/plugin-server.cjs` — the opencode plugin entrypoint.
2. `src/main.js` — the Electron desktop pet.

The plugin registers slash commands, listens for opencode `session.status` events, and sends events to the desktop pet over a local HTTP API:

```text
opencode plugin -> http://127.0.0.1:47832 -> Electron OpenCub
```

The Electron process owns the window, Three.js renderer, cube rotation, face glow state, and inbox/debug endpoints.

## Requirements

- opencode
- macOS, Windows, or Linux capable of running Electron
- network access to install npm dependencies during first plugin install

Users do not need to run `npm install` manually when installing via `opencode plugin`. opencode installs npm plugins and dependencies automatically.

## Notes

- The first install may take a while because Electron is downloaded as a runtime dependency.
- If commands do not appear after installation, restart opencode.
- OpenCub uses a local-only HTTP server on `127.0.0.1:47832`.
- If that port is already in use, set `OPENCODE_PET_PORT` before starting opencode.

## Local development

From this repository:

```sh
npm install
npm run start
```

For local opencode plugin testing, point your opencode config at the package directory:

```json
{
  "plugin": ["/path/to/opencub"]
}
```

After changing plugin files or opencode config, restart opencode.

To inspect the package contents before publishing:

```sh
npm pack --dry-run
```
