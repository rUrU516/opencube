const {
  clampMagnitude,
  magnitude,
  randomBetween,
  randomChoice,
  randomSessionGlowColor,
  randomTorque,
  serializeColor,
} = require("./cube-render-utils.cjs")

class CubeState {
  constructor() {
    this.rotation = { x: -14, y: -28, z: 0 }
    this.angularVelocity = { x: 0, y: 0, z: 0 }
    this.frictionHoldLevel = 0
    this.sessionFaces = new Map()
    this.sessionColors = new Map()
    this.faceFlashes = new Map()
    this.handledSignalIDs = new Set()
    this.toolEmissionStates = new Map()
    this.toolEmitAccumulators = new Map()
  }
}

class DisturbancePool {
  constructor() {
    this.disturbances = new Map()
  }

  dispatch(command) {
    if (!command || typeof command !== "object") return
    if (command.type === "add" || command.type === "replace") {
      if (!command.id || !command.disturbance) return
      this.disturbances.set(command.id, command.disturbance)
      return
    }
    if (command.type === "destroy") {
      if (command.id) this.disturbances.delete(command.id)
      return
    }
    if (command.type === "clearByScope") {
      for (const [id, disturbance] of Array.from(this.disturbances.entries())) {
        if (id.startsWith(`${command.scope}:`) || disturbance.scope === command.scope) this.disturbances.delete(id)
      }
    }
  }

  tick(state, context) {
    const debug = {}
    for (const [id, disturbance] of Array.from(this.disturbances.entries())) {
      disturbance.apply?.(state, context, debug)
      if (disturbance.done) this.disturbances.delete(id)
    }
    debug.activeDisturbances = Array.from(this.disturbances.keys())
    return debug
  }
}

function createBaselineTorqueDisturbance() {
  return {
    scope: "global",
    torque: randomTorque(),
    nextTorqueAt: 0,
    wasBusy: false,
    apply(state, context, debug) {
      const now = context.now
      const isBusy = context.isBusy
      if (isBusy !== this.wasBusy || now >= this.nextTorqueAt) {
        this.torque = randomTorque()
        this.nextTorqueAt = now + randomBetween(4800, 5200)
      }
      this.wasBusy = isBusy

      const inertia = 1.18
      state.angularVelocity.x += (this.torque.x / inertia) * context.dt
      state.angularVelocity.y += (this.torque.y / inertia) * context.dt
      state.angularVelocity.z += (this.torque.z / inertia) * context.dt

      debug.torque = { ...this.torque }
      debug.nextTorqueAt = this.nextTorqueAt
    },
  }
}

function createFrictionHoldDisturbance() {
  return {
    scope: "global",
    growPerSecond: 2.4,
    recoverPerSecond: 8.0,
    apply(state, context, debug) {
      if (context.frictionHoldActive) state.frictionHoldLevel = Math.min(11, state.frictionHoldLevel + this.growPerSecond * context.dt)
      else state.frictionHoldLevel = Math.max(0, state.frictionHoldLevel - this.recoverPerSecond * context.dt)
      debug.frictionHoldLevel = state.frictionHoldLevel
      debug.frictionHoldMultiplier = 1 + state.frictionHoldLevel
    },
  }
}

function createAngularDampingDisturbance() {
  return {
    scope: "global",
    apply(state, context, debug) {
      const baseFriction = context.isBusy ? 0.58 : 2.85
      const holdMultiplier = 1 + state.frictionHoldLevel
      const friction = baseFriction * holdMultiplier
      const damping = Math.exp(-friction * context.dt)
      state.angularVelocity.x *= damping
      state.angularVelocity.y *= damping
      state.angularVelocity.z *= damping
      clampMagnitude(state.angularVelocity, 1400)

      debug.baseFriction = baseFriction
      debug.friction = friction
      debug.frictionHoldMultiplier = holdMultiplier
    },
  }
}

function createRotationIntegratorDisturbance() {
  return {
    scope: "global",
    apply(state, context) {
      state.rotation.x += state.angularVelocity.x * context.dt
      state.rotation.y += state.angularVelocity.y * context.dt
      state.rotation.z += state.angularVelocity.z * context.dt
    },
  }
}

function createCubeVisualRuntime(state, options = {}) {
  const faceOrder = options.faceOrder || ["front", "right", "top", "back", "left", "bottom"]
  const colorReleaseSpeed = options.colorReleaseSpeed || 90
  const toolEmissionHoldMs = options.toolEmissionHoldMs || 2000

  function syncBusyFaces(sessions, speed) {
    const busySessions = (sessions || [])
      .filter((session) => session?.state === "busy" && typeof session.sessionID === "string")
      .sort((a, b) => (b.busyAt || b.lastAt || 0) - (a.busyAt || a.lastAt || 0))
    const busyIDs = busySessions.map((session) => session.sessionID)
    const busySet = new Set(busyIDs)

    if (busyIDs.length === 0) {
      if (speed < colorReleaseSpeed) {
        state.sessionFaces.clear()
        state.sessionColors.clear()
      }
    } else {
      for (const sessionID of Array.from(state.sessionColors.keys())) {
        if (!busySet.has(sessionID)) state.sessionColors.delete(sessionID)
      }
    }

    for (const sessionID of busyIDs) {
      if (!state.sessionColors.has(sessionID)) state.sessionColors.set(sessionID, randomSessionGlowColor())
    }

    if (busyIDs.length > 0) {
      state.sessionFaces.clear()
      for (const [index, session] of busySessions.slice(0, faceOrder.length).entries()) {
        state.sessionFaces.set(session.sessionID, faceOrder[index])
      }
    }

    const faceStyles = Object.fromEntries(faceOrder.map((faceName) => [faceName, { busy: false }]))
    for (const [sessionID, faceName] of state.sessionFaces) {
      const color = state.sessionColors.get(sessionID) || randomSessionGlowColor()
      faceStyles[faceName] = { busy: true, sessionID, color, glowOpacity: 0.98, glowScale: 1.24, faceLerp: 0.58 }
    }

    const busyFaces = Object.fromEntries(Array.from(state.sessionFaces.entries()).map(([sessionID, faceName]) => {
      const color = state.sessionColors.get(sessionID) || randomSessionGlowColor()
      return [sessionID, { face: faceName, color: color.name, rgb: [color.r, color.g, color.b] }]
    }))

    return { faceStyles, busyFaces }
  }

  function chooseUnlitFace() {
    const litFaces = new Set(state.sessionFaces.values())
    const candidates = faceOrder.filter((faceName) => !litFaces.has(faceName) && !state.faceFlashes.has(faceName))
    if (candidates.length === 0) return undefined
    return randomChoice(candidates)
  }

  function processSignals(signals, now) {
    for (const signal of signals || []) {
      if (!signal?.id || state.handledSignalIDs.has(signal.id)) continue
      state.handledSignalIDs.add(signal.id)
      if (signal.type !== "hello") continue

      if (signal.mode === "fancy") {
        const litFaces = new Set(state.sessionFaces.values())
        const candidates = faceOrder.filter((faceName) => !litFaces.has(faceName) && !state.faceFlashes.has(faceName))
        for (const faceName of candidates) {
          const burstCount = Math.floor(randomBetween(8, 15))
          let cursor = randomBetween(0, 140)
          const bursts = []
          for (let index = 0; index < burstCount; index++) {
            const duration = randomBetween(150, 300)
            bursts.push({ at: cursor, duration, color: randomSessionGlowColor(), peak: randomBetween(0.82, 1.24) })
            cursor += duration + randomBetween(35, 150)
          }
          state.faceFlashes.set(faceName, { signalID: signal.id, mode: "fancy", startedAt: now, duration: cursor + 260, bursts })
        }
        continue
      }

      const faceName = chooseUnlitFace()
      if (!faceName) continue
      state.faceFlashes.set(faceName, {
        signalID: signal.id,
        mode: "single",
        startedAt: now,
        duration: 1320,
        bursts: [{ at: 0, duration: 1320, color: randomSessionGlowColor(), peak: 1 }],
      })
    }

    if (state.handledSignalIDs.size > 80) {
      const liveIDs = new Set((signals || []).map((signal) => signal?.id).filter(Boolean))
      for (const id of Array.from(state.handledSignalIDs)) {
        if (!liveIDs.has(id)) state.handledSignalIDs.delete(id)
      }
    }
  }

  function computeFlashFaces(now) {
    const litFaces = new Set(state.sessionFaces.values())
    const active = {}
    const faceStyles = {}
    for (const [faceName, flash] of Array.from(state.faceFlashes.entries())) {
      const elapsed = now - flash.startedAt
      if (elapsed >= flash.duration || litFaces.has(faceName)) {
        state.faceFlashes.delete(faceName)
        continue
      }

      const progress = elapsed / flash.duration
      let strength = 0
      let color = undefined
      for (const burst of flash.bursts || []) {
        const burstElapsed = elapsed - burst.at
        if (burstElapsed < 0 || burstElapsed > burst.duration) continue
        const burstProgress = burstElapsed / burst.duration
        const pulses = flash.mode === "single" ? Math.sin(progress * Math.PI * 6) : Math.sin(burstProgress * Math.PI)
        const burstStrength = Math.max(0, pulses) * (burst.peak || 1) * (1 - progress * 0.08)
        if (burstStrength > strength) {
          strength = burstStrength
          color = burst.color
        }
      }
      active[faceName] = { strength, signalID: flash.signalID }
      if (strength > 0.01) {
        color ??= randomSessionGlowColor()
        faceStyles[faceName] = { color, glowOpacity: 0.18 + strength * 0.82, glowScale: 1.00 + strength * 0.32, faceLerp: 0.70 }
      }
    }
    return { active, faceStyles }
  }

  function computeAttentionFaces(pendingItems, now) {
    const pendingSessionIDs = new Set((pendingItems || []).map((item) => item?.sessionID).filter((sessionID) => typeof sessionID === "string"))
    const active = {}
    const faceStyles = Object.fromEntries(faceOrder.map((faceName) => [faceName, { active: false }]))
    const wave = (Math.sin(now * 0.0095) + 1) / 2
    const pulse = Math.pow(wave, 1.85)
    for (const faceName of faceOrder) {
      const sessionID = Array.from(pendingSessionIDs).find((id) => state.sessionFaces.get(id) === faceName)
      if (!sessionID) continue
      const color = state.sessionColors.get(sessionID) || randomSessionGlowColor()
      faceStyles[faceName] = { active: true, sessionID, color, opacity: 0.14 + pulse * 0.60, scale: 1.06 + pulse * 0.42 }
      active[faceName] = { sessionID, pulse, pending: true, color: color.name, rgb: [color.r, color.g, color.b] }
    }
    return { active, faceStyles }
  }

  function computeToolEmitters(sessions, dt, now) {
    const activeIDs = new Set()
    const emitters = []
    const busyIDs = new Set((sessions || []).filter((session) => session?.state === "busy" && typeof session.sessionID === "string").map((session) => session.sessionID))

    for (const session of sessions || []) {
      if (session?.state !== "busy" || typeof session.sessionID !== "string" || !session.activeTools?.length) continue
      const currentState = state.toolEmissionStates.get(session.sessionID)
      const faceName = state.sessionFaces.get(session.sessionID) || currentState?.faceName
      if (!faceName) continue
      const color = state.sessionColors.get(session.sessionID) || currentState?.color || randomSessionGlowColor()
      activeIDs.add(session.sessionID)
      state.toolEmissionStates.set(session.sessionID, { faceName, color, holdUntil: now + toolEmissionHoldMs })
      emitters.push({ sessionID: session.sessionID, faceName, color, held: false, holdRemainingMs: toolEmissionHoldMs })
    }

    for (const [sessionID, emitterState] of Array.from(state.toolEmissionStates.entries())) {
      if (activeIDs.has(sessionID)) continue
      if (!busyIDs.has(sessionID) || !emitterState?.faceName || emitterState.holdUntil <= now) {
        state.toolEmissionStates.delete(sessionID)
        state.toolEmitAccumulators.delete(sessionID)
        continue
      }
      emitters.push({
        sessionID,
        faceName: emitterState.faceName,
        color: emitterState.color || randomSessionGlowColor(),
        held: true,
        holdRemainingMs: emitterState.holdUntil - now,
      })
    }

    const emittingIDs = new Set(emitters.map((emitter) => emitter.sessionID))
    for (const sessionID of Array.from(state.toolEmitAccumulators.keys())) {
      if (!emittingIDs.has(sessionID)) state.toolEmitAccumulators.delete(sessionID)
    }

    const emissions = []
    for (const emitter of emitters) {
      const jitterRate = randomBetween(7.5, 11.5)
      let accumulator = (state.toolEmitAccumulators.get(emitter.sessionID) || 0) + dt * jitterRate
      let count = 0
      while (accumulator >= 1) {
        count += 1
        accumulator -= 1
      }
      state.toolEmitAccumulators.set(emitter.sessionID, accumulator)
      emissions.push({ ...emitter, count })
    }

    return { activeIDs, emitters, emissions, heldSessions: emitters.filter((emitter) => emitter.held).length }
  }

  function activeDragColors() {
    return Array.from(state.sessionColors.values()).filter((color) => color && Number.isFinite(color.r) && Number.isFinite(color.g) && Number.isFinite(color.b))
  }

  return {
    faceOrder,
    colorReleaseSpeed,
    syncBusyFaces,
    processSignals,
    computeFlashFaces,
    computeAttentionFaces,
    computeToolEmitters,
    activeDragColors,
    serializeColor,
  }
}

function createCubeRuntime() {
  const state = new CubeState()
  const pool = new DisturbancePool()
  const visual = createCubeVisualRuntime(state)
  pool.dispatch({ type: "add", id: "global:friction-hold", disturbance: createFrictionHoldDisturbance() })
  pool.dispatch({ type: "add", id: "global:baseline-torque", disturbance: createBaselineTorqueDisturbance() })
  pool.dispatch({ type: "add", id: "global:angular-damping", disturbance: createAngularDampingDisturbance() })
  pool.dispatch({ type: "add", id: "global:rotation-integrator", disturbance: createRotationIntegratorDisturbance() })

  return {
    state,
    pool,
    visual,
    tick(context) {
      const disturbanceDebug = pool.tick(state, context)
      const speed = magnitude(state.angularVelocity)
      const speedRatio = Math.min(1, speed / 1400)
      return {
        ...disturbanceDebug,
        rotation: { ...state.rotation },
        angularVelocity: { ...state.angularVelocity },
        frictionHoldLevel: state.frictionHoldLevel,
        speed,
        speedRatio,
        glow: Math.pow(speedRatio, 2.3),
      }
    },
  }
}

module.exports = {
  CubeState,
  DisturbancePool,
  createCubeRuntime,
  magnitude,
  randomBetween,
  randomSessionGlowColor,
}
