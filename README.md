<p align="center">
  <img src="assets/opencode-icon.png" width="96" height="96" alt="OpenCube icon" />
</p>

# OpenCube

A tiny desktop cube pet for [opencode](https://opencode.ai/).

It reacts to busy sessions, tool calls, permissions, and questions.

## Install

```sh
opencode plugin opencube --global
```

Restart opencode, then run:

```text
/pet
```

## Commands

```text
/pet                    start or show OpenCube
/pet_stop               quit OpenCube
/pet_restart            restart OpenCube
/pet_update             check npm for updates
/pet_upgrade            alias for /pet_update
/pet_say_hello          send a hello test event
/pet-drag-border toggle toggle the drag handle border
```

## Update

```text
/pet_update
```

If an update is available, OpenCube prints the install command.

## Notes

- OpenCube runs a local Electron process.
- Local API: `http://127.0.0.1:47832`.
- First launch can take a bit while Electron is prepared.
- Restart opencode after installing or updating.

## Development

```sh
npm install
npm run build
npm start
```

Local plugin testing:

```json
{
  "plugin": ["/path/to/opencube"]
}
```
