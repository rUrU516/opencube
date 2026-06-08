<p align="center">
  <img src="assets/opencode-icon.png" width="96" height="96" alt="OpenCube icon" />
</p>

# OpenCube

A tiny desktop cube pet for [opencode](https://opencode.ai/).

It lights up for busy sessions, tool calls, permissions, and questions.

## Install

```sh
opencode plugin opencube --global
```

Restart opencode, then run:

```text
/pet
```

## Update

```sh
opencode plugin opencube@0.4.0 --global --force
```

Then restart opencode and run `/pet` again.

You can also ask OpenCube for the latest published version:

```text
/pet_update
```

## Commands

```text
/pet                 start or show OpenCube
/pet_stop            quit OpenCube
/pet-size            show size usage
/pet-size 0.7        set cube size, range 0.3–3
/pet_update          check npm for updates
/pet_say_hello       flash a free face
/pet_fancy_say_hello run a small light show
```

## Notes

- OpenCube runs a local Electron process.
- Local API: `http://127.0.0.1:47832`.
- If commands do not appear, restart opencode.
- First install can take a bit because Electron is downloaded.

## Development

```sh
npm install
npm start
npm pack --dry-run
```

For local plugin testing:

```json
{
  "plugin": ["/path/to/opencube"]
}
```

Restart opencode after changing plugin code or config.
