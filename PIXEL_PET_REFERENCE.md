# Pixel opencode pet reference

这是从 cmux live canvas 草图沉淀下来的像素风视觉参考；当前已经接入 Electron 桌宠运行时，`src/main.js` 会使用同一套主体比例与 session 彩球语义。

## 文件

- `assets/pixel-opencode-pet.svg`：静态参考图，可以直接预览或作为设计稿使用。
- `src/pixel-pet-reference.cjs`：渲染代码，导出 SVG/CSS/HTML snippet；`src/main.js` 已用 `pixelPetSvg({ sessionCount: 0 })` 渲染桌宠主体，运行时 session 球由 Electron 页面脚本动态叠加。

## 视觉要点

- 风格：clean chunky pixel art，大块像素，不要碎小黑白噪点。
- 主体：黑/深灰像素身体，透明背景，适合 Electron transparent window。
- opencode 识别点：中央白色矩形框 + 内部黑色竖孔，保留图标的“白框/黑槽”感觉。
- 四肢：小手小脚即可，块状、低细节。
- session 表达：彩色像素球围绕宠物，最初草图里 7 个球代表当时 7 个 cmux/opencode session/workspace。
- 当前运行时动效：busy session 一对一变成一个彩色像素球，在宠物头顶按像素步进轨迹杂耍；两个 busy 就是两颗球错相位杂耍。idle session 会移动到宠物右侧堆叠，并根据 `IDLE_TTL_MS` 慢慢淡出，过期后清理。
- 后续动效方向：permission.ask 时宠物举牌或抖动。

## 快速预览代码

```js
const { pixelPetSvg, pixelPetHtmlSnippet } = require("./src/pixel-pet-reference.cjs")

console.log(pixelPetSvg({ sessionCount: 7, showCaption: true }))
console.log(pixelPetHtmlSnippet({ sessionCount: 3 }))
```

运行时实现位置：`src/main.js` 的 `petHtml()`、`getPetState()` 和 HTTP API。

- `GET /health`：返回 `pet: "pixel-opencode-pet"` 以及简略 session 状态。
- `GET /state`：返回每个 session 的 `state`、`busyIndex`、`idleIndex`、`color`，方便验证 busy 球数量和 idle 堆叠顺序。
- `GET /snapshot`：用 Electron `capturePage()` 抓取桌宠窗口 PNG，方便直接看本体渲染。
- `GET /debug-render`：从 renderer 读取每颗球的实时 `x/y/alpha/scale/className`，用于连续采样确认 busy 球在动、idle 旧球比新球更淡。
