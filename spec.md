# 规格：照搬 apanzinc.top 首页动态纹理 + 恢复左下角字标 + 统一 / Posts 字标

## 1. 用户需求

> 照搬 http://apanzinc.top/ 的首页动态纹理，新增的文章页的 POST 和其他页面的 /xxx 也要一样

结合上一轮“只把左上角名字换为头像，左下角不变！取消人物奔跑效果”，本轮最终目标：

1. 导航栏左上角保持圆形头像。
2. 首屏左下角恢复原 RobotoFlex 站名字标（不是头像）。
3. 删除 3D 奔跑线框人形，首屏背景改为**逐字照搬 apanzinc.top 首页的 Paper GrainGradient 动态纹理**。
4. 文章页的 POSTS 字标改成与其他页面一致的 `/ Posts` 矢量字标（统一字标样式，不铺全站背景）。

## 2. 参考站取证结果（已完成）

### 2.1 实现来源

apanzinc.top 首页 `.hero-shader` 使用 `@paper-design/shaders` 的 **GrainGradient**（WebGL2）。
已从线上 bundle 提取到：完整顶点着色器、完整片段着色器（含 noise / shape / 旋转 / 颗粒 chunk）、`paper-shaders` 运行时、128×128 噪声贴图。

### 2.2 Hero 组件传入的参数（逐项）

```js
u_colorBack:   '#00000000',
u_colors:      ['#189168', '#008558', '#00ffaa29'],
u_colorsCount: 3,
u_softness:    1,
u_intensity:   1,
u_noise:       1,
u_shape:       4,          // corners
u_noiseTexture: 128×128 PNG（站点内嵌 base64，已提取）
u_fit:         1,          // contain
u_scale:       1.24,
u_rotation:    0,
u_offsetX:    -0.12,
u_offsetY:     0,
u_originX:     0.5,
u_originY:     0.5,
u_worldWidth:  0,
u_worldHeight: 0,
speed:         1
```

- 着色器内部 `firstFrameOffset = 7`，`u_time = currentFrame(ms) * 0.001`。
- 颜色按 sRGB 0–1 直接传入，不做线性转换。
- 画布使用默认 WebGL2 上下文（`alpha:true`、`premultipliedAlpha:true`），清屏透明，页面背景透出。
- 渲染分辨率：`scale = max(devicePixelRatio, 2) * visualViewport.scale`，再用 `maxPixelCount = 1920*1080*4` 夹紧。
- 噪声贴图采样：`LINEAR` + `CLAMP_TO_EDGE`。
- 原站不响应鼠标、不随滚动变化；只有 `u_time` 在走。
- 深色/浅色主题使用**同一套**着色器与颜色，仅页面背景色不同（深色 #000、浅色 #f8f8f8）。

### 2.3 视觉特征

- 浅色：白底上偏左下的大团淡绿颗粒渐变，颗粒感明显。
- 深色：黑底上偏左下的大团亮绿颗粒渐变，中心偏白绿，右上保持纯黑。

## 3. 实现方案

### 3.1 重写 `assets/js/shader.js`

保留现有导出签名 `createBackground(canvasEl, options)` 与实例 API（`destroy / pause / resume / resize / setTheme`），内部替换为 Paper GrainGradient：

- 内嵌 2.2 提取的顶点/片段着色器原文（片段着色器已把 `${iu}` 等 chunk 与 `maxColorCount=7` 展开）。
- 创建 `webgl2` 上下文；编译程序、单个全屏三角形 VBO。
- 创建 `assets/img/grain-noise.png` 纹理，参数照抄（LINEAR/CLAMP_TO_EDGE）。
- 每次尺寸变化按原站公式算 drawingBuffer 尺寸，设置 `u_resolution` / `u_pixelRatio`。
- 每帧 `dt` 累加（speed=1）→ 设置 `u_time` → 绘制。
- `prefers-reduced-motion`：只渲染首帧静态图；`visibilitychange` 暂停 rAF。
- WebGL2 不可用：返回 `{ fallback: true }`，由 main.js 铺近似 CSS 渐变兜底。
- `setTheme` 为空实现（同一套颜色，透明画布自动适配深浅主题）。
- 移除现有鼠标散点逻辑，与原站一致。

### 3.2 新增 `assets/img/grain-noise.png`

从参考站 bundle 的 base64 原样解出的 128×128 PNG（约 17KB）。

### 3.3 修改 `assets/js/main.js`

- 顶部导入：删除 `createRunner / canRun3D`，删除 `runner.js` 依赖；恢复 `import { logoSvg } from './logo.js';`。
- `tplHome()`：
  - 删除 `<div class="hero-veil">`（原站纹理上没有遮罩，保留会削弱纹理）。
  - `.intro-left` 改回：
    ```html
    <div class="hero-logo" id="hero-logo" role="img" aria-label="${esc(hero.name)}">${logoSvg}</div>
    ```
- `mountHome()`：删除 runner 的创建/销毁/`bg.pause()` 逻辑；只保留 `createBackground`。
- 兜底渐变改为参考站同款绿色：
  `radial-gradient(ellipse 90% 70% at 30% 100%, rgba(24,145,104,.35), transparent 62%), radial-gradient(ellipse 70% 60% at 78% 70%, rgba(0,133,88,.18), transparent 66%), var(--bg-primary)`。
- 模块级 `runnerInstance` 及相关主题联动删除。
- `applyTheme()` 保留 `bgInstance?.setTheme?.(theme)`。

### 3.4 恢复 `assets/js/logo.js`

从 git `566c76f:assets/js/logo.js` 原样恢复（RobotoFlex 字标 SVG）。

### 3.5 修改 `assets/css/components.css`

- 删除 `.hero-avatar`、`@keyframes avatar-breathe`、`.hero-shader .runner-canvas` 两组规则。
- 恢复原 `.hero-logo` 与 `.hero-logo svg`、`[data-theme="light"] .hero-logo`；
  宽度基准 `clamp(200px, 50vw, 480px)`，并恢复 5 个断点：
  `≤1024: clamp(180px,45vw,400px)`、`≤768: clamp(180px,60vw,320px)`、`≤480: clamp(160px,65vw,280px)`、
  `height≤640: clamp(140px,35vw,280px)`、`height≤500: clamp(120px,30vw,220px)`。
- 删除 `.hero-veil` 及其浅色规则。
- `prefers-reduced-motion` 中删除头像动画相关规则。

### 3.6 修改 `assets/js/labels.js`

- 用同一字体轮廓生成 `/ Posts`，替换现有粗体无斜杠的 `POSTS` 图：
  - 从 `PROJECTS` 路径按子路径拆出 `/`、`P`、`o`、`s`、`t` 字形（绝对坐标，逐字形 `translate` 重排）。
  - 新 SVG：`width="47" height="14" viewBox="0 0 47 14"`，字形顺序 `/ P o s t s`，间距沿用原字标（约 1px）。
  - 结果与 `/ Projects`、`/ Achievements` 等字标同字体、同字重、同 baseline、同斜杠。

### 3.7 删除奔跑人形相关资源

- `assets/js/runner.js`
- `assets/models/runner-skeleton.glb`
- `assets/models/runner.buf`
- `assets/vendor/GLTFLoader.r112.js`
- `assets/vendor/three.r112.min.js`（删除 runner 后无任何引用）

保留：`avatar-512.webp`（仅启动页/导航不再用 512？导航用 96，启动页用 96；512 仅作备用，保留）、`avatar-96.webp`、`favicon-64.png`、`apple-touch-icon.png`。

### 3.8 非目标

- 不把动态纹理铺到文章页/项目页等其他路由（用户已确认仅统一字标）。
- 不修改导航栏头像、启动页 logo、favicon。
- 不引入 `@paper-design/shaders` npm 依赖，直接内嵌提取出的原始着色器，避免新增运行时。

## 4. 验收标准

1. 首屏左下角是 RobotoFlex 站名字标；左上角仍是圆形头像；首屏无人物。
2. 首屏背景与 apanzinc.top 首页一致：浅色为白底淡绿颗粒、深色为黑底亮绿颗粒；无鼠标散点、无 3D 线条。
3. 文章页字标显示 `/ Posts`，与 `/ Projects` 等字标字体、大小、baseline 一致。
4. 1440×900、390×844 视口截图正常；深浅主题切换正常；首页 → 文章 → 首页路由重建后纹理继续动画。
5. 控制台无报错；`prefers-reduced-motion` 下静态；WebGL2 不可用时 CSS 渐变兜底。
6. 提交并推送到 `https://github.com/Peter267/personal_page.git` 的 `main`。

## 5. 验证方式

```powershell
node tools/serve.js
$env:PROBE_URL='http://localhost:8080/'; $env:PROBE_W=1440; $env:PROBE_H=900; $env:PROBE_WAIT=2500; node tools/probe.js
# 浅色：追加 PROBE_CLICK='#theme-toggle'
# 移动端：PROBE_W=390; PROBE_H=844
# 文章页：PROBE_URL='http://localhost:8080/#/posts'
```
