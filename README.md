# Peter267 个人主页

一个静态个人站点，基于 **Astro 7**。7 个页面各有独立的真实 URL，首屏有一层 WebGL 颗粒渐变背景。

线上地址：<https://peter267.github.io/>

---

## 快速开始

```bash
npm install
npm run dev        # 本地开发 http://localhost:4321
npm run build      # 产物输出到 dist/
npm run preview    # 预览构建产物
```

要求 **Node ≥ 22.23.4**（Astro 7 的硬性下限）。仓库根目录没有版本锁定文件，若你的 Node 版本低于此值，`npm run build` 会直接报错退出。

---

## 目录结构

```
src/
  layouts/
    Base.astro        全站外壳：启动页 / 导航 / 移动端菜单 / 页脚 / 主题初始化
  pages/
    index.astro       首页（WebGL 首屏）
    achievements.astro
    experience.astro  横向数轴
    projects.astro
    friends.astro
    contact.astro
    posts.astro       运行时拉取博客 Atom feed
    404.astro
  components/
    SectionLabel.astro  页面字标（矢量 SVG）
  lib/
    content.js        全站内容数据 —— 改文案只动这一个文件
    shader.js         WebGL 颗粒渐变（Paper GrainGradient）
    site.js           主题切换 / 移动端菜单
    boot.js           启动页进度条
    labels.js         字标 SVG 路径数据
    icons.js          社交图标 SVG
    logo.js           首屏站标 SVG
  styles/
    index.css         样式入口（tokens → base → layout → components）
    tokens.css        设计令牌
    boot.css          启动页样式
public/
  assets/img/         头像、favicon、噪声贴图
  assets/fonts/
```

**路由即文件**：新增一个页面 = 在 `src/pages/` 加一个 `.astro` 文件，再把条目加到 `content.js` 的 `routes` 数组。不需要改路由表或构建配置。

---

## 内容维护

绝大多数改动只需要碰 `src/lib/content.js`：站名、简介、关键词胶囊、项目、成就、经历、友链、联系方式、页脚。

改配色只碰 `src/styles/tokens.css`。全站只有 `--accent` 一个彩色。

---

## 几个必须知道的坑

这几处都是重构过程中实际踩到并修掉的，改动前请先读：

### 1. 着色器兜底不能省

`shader.js` 里 `if (!gl) return fallbackHandle()` 这个分支**必须**先调用 `applyCssFallback()`。

历史上这里漏了调用，结果是：所有拿不到 WebGL2 的浏览器（老版本 Safari、关闭了硬件加速的 Chrome、部分移动端 WebView）看到的是**纯黑背景**，而不是渐变兜底 —— 也就是"首页动态纹理在部分浏览器不显示"。

现在的实现覆盖四条退化路径，且每条都会退到 CSS 渐变：

| 情况 | 处理 |
|---|---|
| 没有 WebGL2 | 隐藏 canvas，铺 CSS 渐变 |
| 着色器编译/链接失败 | 同上 |
| 噪声贴图加载失败 | 同上 |
| WebGL 上下文丢失 | 同上 |

`prefers-reduced-motion: reduce` 时只渲染首帧静态图，不跑动画。

### 2. 噪声贴图必须用绝对路径

`NOISE_URL` 用 `import.meta.env.BASE_URL` 拼绝对路径，不能写成 `./assets/...`。

相对路径在单页 hash 路由下侥幸可用，但改成真实 URL 后，从 `/projects/` 这类嵌套路径解析会变成 `/projects/assets/...` 而 404，着色器直接退化成兜底。

### 3. `compressHTML` 必须显式设为 `true`

Astro 7 的默认值是 `'jsx'`，会按 JSX 规则折叠行内元素之间的空白（`</span>\n<em>` → `helloworld`）。本站中文排版和字标间距是逐像素调过的，交给 JSX 规则折叠会造成**构建不报错但版式变了**。已在 `astro.config.mjs` 里写死。

### 4. ClientRouter 下模块脚本只执行一次

Astro 的打包模块脚本在一次会话中只会执行一次，即使换页后 DOM 重建也不会重跑。凡是依赖"页面 DOM 存在"的逻辑，都必须挂到 `astro:page-load`：

- 首页 WebGL 重建（`src/pages/index.astro`）
- 文章列表加载（`src/pages/posts.astro`）

配套地，离开页面前要在 `astro:before-swap` 里销毁 WebGL 上下文，否则会泄漏（浏览器对同时存在的上下文有上限，通常 16 个），切几次之后就不再显示。

### 5. 启动页会在换页时被重新插入

ClientRouter 换页会重建整个 `<body>`，于是每页 HTML 里的 `#boot` 元素会被插回来。首次加载时已经把它移除了，没人再负责清理它 —— 结果是一个 `z-index:99999` 的黑遮罩重新盖住整页。

`src/layouts/Base.astro` 里在 `astro:after-swap` 中调用 `teardownBoot()` 处理。

### 6. 不要给内容容器加 `transition:persist`

给 `<main>` 加上 `transition:persist` 会导致 URL 和 title 都更新了、**但 DOM 内容原地不动**，用户点导航会看到"标题变了、页面没变"。这是最隐蔽的失败模式。

---

## 验证

```bash
npm run build
npm run preview           # 另开一个终端窗口
node tools/verify.cjs     # 82 项断言
```

`tools/verify.cjs` 覆盖：

- **纹理兼容性**：无 WebGL2、贴图加载失败两种退化场景下背景是否仍然可见
- 7 个路由的直接访问、独立 title / canonical
- 客户端导航：内容替换、无整页重载、无启动页遮罩残留
- 返回首页时 WebGL 是否重建、上下文是否泄漏
- 深浅主题切换与持久化
- 移动端 390×844 无横向溢出、汉堡菜单
- 经历页数轴几何（横条宽度是否正比于时间跨度）
- 控制台无 JS 错误

截图输出到 `shots/astro/`。

---

## 部署

产物是纯静态目录，**不需要任何重写规则**（每个路由是一个真实目录 + `index.html`）。

| 平台 | 说明 |
|---|---|
| Vercel | 零配置，当前使用 |
| GitHub Pages | 作为项目站需设 `base: '/repo'`，且所有内部链接要带该前缀 |
| Cloudflare Pages | 静态资源带宽不计费；注意官方现在建议新项目从 Workers static assets 起步 |

构建命令 `npm run build`，输出目录 `dist`。

---

## 历史

本站原先是一个零依赖、无构建的手写静态站（原生 HTML + CSS + ES Module，hash 路由）。2026-11 重构为 Astro，主要动因是 hash 路由导致 7 个页面在搜索引擎眼里只有 1 个；顺带修掉了着色器在无 WebGL2 浏览器下全黑的问题。

调研记录见 [`framework-research.md`](./framework-research.md)。
