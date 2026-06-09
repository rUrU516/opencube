function randomBetween(min, max) {
  return min + Math.random() * (max - min)
}

function randomSign() {
  return Math.random() > 0.5 ? 1 : -1
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

function randomTorque() {
  return {
    x: randomBetween(45, 130) * randomSign(),
    y: randomBetween(90, 260) * randomSign(),
    z: randomBetween(18, 80) * randomSign(),
  }
}

function serializeColor(color) {
  if (!color) return undefined
  return { name: color.name, rgb: [color.r, color.g, color.b], r: color.r, g: color.g, b: color.b }
}

module.exports = {
  clampMagnitude,
  hslToRgb,
  magnitude,
  randomBetween,
  randomChoice,
  randomSessionGlowColor,
  randomSign,
  randomTorque,
  serializeColor,
}
