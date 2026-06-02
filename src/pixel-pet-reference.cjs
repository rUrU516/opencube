// Pixel renderer for the clean pixel opencode pet concept.
//
// src/main.js uses this module for the Electron pet body, while docs/assets can
// keep using it as a stable reference for proportions, palette, and session-ball
// model.

const DEFAULT_SESSION_COLORS = ["#ff5d73", "#ffb020", "#28c76f", "#2f8cff", "#8b5cf6", "#06b6d4", "#f97316"]

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;")
}

function rect({ x, y, w, h, fill, opacity, className, extra = "" }) {
  const attrs = [
    `x="${x}"`,
    `y="${y}"`,
    `width="${w}"`,
    `height="${h}"`,
    fill ? `fill="${fill}"` : undefined,
    opacity == null ? undefined : `opacity="${opacity}"`,
    className ? `class="${escapeHtml(className)}"` : undefined,
    extra,
  ]
    .filter(Boolean)
    .join(" ")
  return `<rect ${attrs} />`
}

function sessionBall({ x, y, color, index }) {
  return [
    rect({ x, y, w: 14, h: 14, fill: color, className: "session-ball", extra: `data-index="${index}"` }),
    rect({ x: x + 4, y: y + 2, w: 4, h: 4, fill: "rgba(255,255,255,.68)", className: "session-ball-highlight" }),
  ].join("\n    ")
}

function pixelPetSvg(options = {}) {
  const colors = options.sessionColors || DEFAULT_SESSION_COLORS
  const showCaption = options.showCaption ?? false
  const ballPositions = [
    [56, 24],
    [90, 16],
    [124, 20],
    [154, 38],
    [178, 68],
    [188, 104],
    [178, 140],
  ]
  const count = Math.max(0, Math.min(options.sessionCount ?? 7, ballPositions.length))
  const balls = ballPositions
    .slice(0, count)
    .map(([x, y], index) => sessionBall({ x, y, color: colors[index % colors.length], index }))
    .join("\n    ")

  return `<svg xmlns="http://www.w3.org/2000/svg" width="256" height="256" viewBox="0 0 256 256" shape-rendering="crispEdges" role="img" aria-label="clean pixel opencode pet">
  <g class="session-balls">${balls}</g>
  <g class="pet-shadow" opacity="0.22">
    ${rect({ x: 54, y: 206, w: 108, h: 10, fill: "#000000" })}
    ${rect({ x: 70, y: 216, w: 76, h: 6, fill: "#000000" })}
  </g>
  <g class="pet-body">
    ${rect({ x: 66, y: 184, w: 26, h: 22, fill: "#050505" })}
    ${rect({ x: 124, y: 184, w: 26, h: 22, fill: "#050505" })}
    ${rect({ x: 72, y: 184, w: 18, h: 8, fill: "#242424" })}
    ${rect({ x: 130, y: 184, w: 18, h: 8, fill: "#242424" })}
    ${rect({ x: 34, y: 110, w: 18, h: 42, fill: "#080808" })}
    ${rect({ x: 44, y: 118, w: 12, h: 30, fill: "#242424" })}
    ${rect({ x: 158, y: 110, w: 18, h: 42, fill: "#080808" })}
    ${rect({ x: 158, y: 118, w: 12, h: 30, fill: "#242424" })}
    ${rect({ x: 24, y: 148, w: 18, h: 16, fill: "#050505" })}
    ${rect({ x: 30, y: 150, w: 14, h: 10, fill: "#242424" })}
    ${rect({ x: 168, y: 148, w: 18, h: 16, fill: "#050505" })}
    ${rect({ x: 166, y: 150, w: 14, h: 10, fill: "#242424" })}
    ${rect({ x: 50, y: 62, w: 112, h: 120, fill: "#050505" })}
    ${rect({ x: 42, y: 82, w: 128, h: 80, fill: "#050505" })}
    ${rect({ x: 58, y: 54, w: 96, h: 16, fill: "#242424" })}
    ${rect({ x: 58, y: 70, w: 96, h: 16, fill: "#1a1a1a" })}
    ${rect({ x: 58, y: 162, w: 96, h: 16, fill: "#171717" })}
    ${rect({ x: 58, y: 86, w: 10, h: 66, fill: "#2b2b2b", opacity: 0.9 })}
    ${rect({ x: 142, y: 86, w: 10, h: 66, fill: "#000000", opacity: 0.9 })}
    ${rect({ x: 72, y: 82, w: 74, h: 86, fill: "#2d2d2d" })}
    ${rect({ x: 76, y: 86, w: 66, h: 78, fill: "#d8d5cc" })}
    ${rect({ x: 82, y: 92, w: 54, h: 66, fill: "#f8f7f2" })}
    ${rect({ x: 86, y: 96, w: 46, h: 58, fill: "#ffffff" })}
    ${rect({ x: 98, y: 110, w: 24, h: 38, fill: "#050505" })}
    ${rect({ x: 98, y: 110, w: 24, h: 10, fill: "#111111" })}
    ${rect({ x: 26, y: 120, w: 28, h: 10, fill: "#050505" })}
    ${rect({ x: 22, y: 114, w: 16, h: 16, fill: "#050505" })}
    ${rect({ x: 28, y: 116, w: 10, h: 8, fill: "#2f2f2f" })}
    ${rect({ x: 156, y: 120, w: 28, h: 10, fill: "#050505" })}
    ${rect({ x: 176, y: 114, w: 16, h: 16, fill: "#050505" })}
    ${rect({ x: 174, y: 116, w: 10, h: 8, fill: "#2f2f2f" })}
  </g>
  ${showCaption ? `<text x="24" y="238" fill="#111" font-family="ui-monospace, SFMono-Regular, Menlo, monospace" font-size="10">clean pixel opencode pet · ${count} session balls</text>` : ""}
</svg>`
}

const pixelPetCss = `
.pixel-opencode-pet {
  width: 256px;
  height: 256px;
  image-rendering: pixelated;
  shape-rendering: crispEdges;
}

.pixel-opencode-pet .session-ball {
  transform-origin: center;
  animation: pet-ball-bob 1.45s steps(4, end) infinite;
}

.pixel-opencode-pet .session-ball:nth-of-type(4n + 1) { animation-delay: -0.15s; }
.pixel-opencode-pet .session-ball:nth-of-type(4n + 2) { animation-delay: -0.35s; }
.pixel-opencode-pet .session-ball:nth-of-type(4n + 3) { animation-delay: -0.55s; }

@keyframes pet-ball-bob {
  0%, 100% { transform: translateY(0); }
  50% { transform: translateY(-6px); }
}
`

function pixelPetHtmlSnippet(options = {}) {
  return `<style>${pixelPetCss}</style>\n<div class="pixel-opencode-pet">${pixelPetSvg(options)}</div>`
}

module.exports = {
  DEFAULT_SESSION_COLORS,
  pixelPetCss,
  pixelPetHtmlSnippet,
  pixelPetSvg,
}
