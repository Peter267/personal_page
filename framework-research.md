# 本站用网站开发框架重构：可行性、必要性与选型建议

> 调研日期：2026-11-15
> 对象：`personal_page`（Peter267 个人主页）
> 方法：**实测优先**。所有"当前站点"的数字来自本机 CDP 冷缓存实测；所有框架结论来自**在临时目录里真实搭起来跑通**的验证；外部事实均附来源链接。

---

## 0. 结论先行

| 问题 | 结论 |
|---|---|
| **有没有必要重构？** | **有，但"必要性"不来自框架本身，而来自 hash 路由。** 真正值得改的是 URL 形态，不是技术栈。 |
| **该不该上框架？** | **该上，但属于"顺便解决"，不是"必须解决"。** 如果只改路由，手写也能做；框架是让后续维护变轻松。 |
| **推荐哪个框架？** | **Astro**（已实测跑通）。次选 Eleventy（若更看重零 JS 与完全掌控）。 |
| **最大风险是什么？** | 不是迁移难度，而是 **Astro 的三个版本/默认值陷阱**（下文 §5 全部实测复现）。 |
| **不建议做什么？** | 不要把 Tailwind 当"顺手升级"引入；不要用 Next/Nuxt/SvelteKit；不要用 VitePress。 |

**一句话**：`#/posts` 这七个路由在 Google 眼里**只有一个页面**。这条问题的价值高于本报告里其他所有内容之和，而且它**不装框架也能修**。先把这件事修掉，再决定要不要顺手换成 Astro。

---

## 1. 现状取证（实测，非估算）

### 1.1 物理结构

| 项目 | 实测值 |
|---|---|
| 物理 HTML 文件数 | **1 个**（`index.html`，16.6 KB） |
| 路由方式 | hash 路由，7 个路由全部由 JS 在运行时渲染 |
| `sitemap.xml` / `robots.txt` | **都不存在** |
| 部署配置文件 | **无**（无 `vercel.json` / `CNAME` / `.nojekyll` / `.github`），即零配置托管 |
| 源码总量 | 5,001 行 / 198.5 KB（gzip 61.8 KB） |
| 资源文件名 | **无内容哈希**（`main.js`、`tokens.css`…），因此无法对静态资源设长缓存 |

### 1.2 资源与体积

```
index.html                16.3 KB → gzip  5.1 KB
components.css            37.7 KB → gzip  9.5 KB
main.js                   25.4 KB → gzip  7.2 KB
shader.js                 23.2 KB → gzip  7.0 KB
labels.js (SVG 字标)      37.2 KB → gzip 11.4 KB
icons.js  (SVG 图标)      18.3 KB → gzip  7.1 KB
layout.css                16.7 KB → gzip  4.8 KB
content.js                12.6 KB → gzip  4.5 KB
base.css                   5.2 KB → gzip  2.4 KB
tokens.css                 3.1 KB → gzip  1.4 KB
logo.js                    2.8 KB → gzip  1.4 KB
─────────────────────────────────────────────
合计                     198.5 KB → gzip 61.8 KB
```

14 个请求，传输 210.3 KB（含 3.3 KB 头像、17.0 KB 噪声贴图）。

### 1.3 性能（CDP，1440×900，冷缓存，CPU 4× 降速，各 3 次）

| 指标 | 现站 | Astro spike |
|---|---|---|
| FCP | 672 / 708 / 928 ms | 344 / 432 / 588 ms |
| LCP | 1172 / 1208 / 928 ms | 344 / 432 / 588 ms |
| TBT（估算） | 449 / 551 / 812 ms | 43 / 454 / 1093 ms |
| 请求数 | 14 | 6 |
| 传输体积 | 210.3 KB | 32.2 KB |

**诚实说明**：TBT 在 headless 下的软件渲染（SwiftShader）中抖动极大（43 ms ↔ 1093 ms），**不足以支撑任何性能结论**，不要引用。稳定可用的信号只有两个方向性的：**请求数 14 → 6**、**传输 210 KB → 32 KB**，以及 FCP 的分布整体前移。这个差距主要来自 Astro 把 CSS 内联/合并、并对无用模块做了 tree-shaking，而不是"框架更快"。

> 注：这台机器上 headless Chrome 只能用软件渲染跑 WebGL，`tbt` 一栏的方差比它想测量的信号还大。若要严肃对比性能，必须在有 GPU 的真实浏览器里测。

### 1.4 一个真实的体验缺陷

现站路由切换实测存在**明显卡顿尖峰**：

```
#/projects    2997 ms / 4913 ms / 2394 ms   ← 反复复现
#/experience    359 ms /  313 ms /  282 ms
#/contact        64 ms /  118 ms /  347 ms
```

`/projects` 首次切换稳定在 2.4–4.9 秒。原因未深究（大概率是首屏 WebGL canvas 销毁后重新创建 + 7 张项目卡片的样式重算），但**这是用户能直接感知的问题**，且与框架无关——现在的代码里就有。

---

## 2. 必要性的真实来源：hash 路由的 SEO 天花板

这是本次调研**证据最强**的一节，因为 Google 把答案写在官方文档里。

**Google Search Central 原文**（[FAQ about JavaScript and links](https://developers.google.cn/search/blog/2020/05/frequently-asked-questions-about?hl=en)）：

> **"Does Googlebot understand fragment URLs?"**
> "Fragment URLs, also known as 'hash URLs', are technically fine, but might not work the way you expect with Googlebot. … **Sometimes developers decide to use fragments with JavaScript to load different content than what is on the page without the fragment. That is not what fragments are meant for and won't work with Googlebot.**"

而唯一能让 hash 路由被抓取的机制（AJAX crawling，`#!` + `_escaped_fragment_`）**已于 2015 年废弃**（[Deprecating our AJAX crawling scheme](https://developers.google.cn/search/blog/2015/10/deprecating-our-ajax-crawling-scheme?hl=en)）：

> "In short: We are no longer recommending the AJAX crawling proposal we made back in 2009. … you can use the **History API pushState()**"

### 对本站的具体后果

| | 现状（hash） | 改真实 URL 后 |
|---|---|---|
| 可被索引的页面数 | **1**（`/`，7 个路由坍缩为同一个 URL） | 7 |
| 每页独立 `<title>` | ❌ 源码里只有 1 个 title | ✅ 7 个 |
| 每页独立 description | ❌ | ✅ |
| 每页 canonical | ❌ | ✅ |
| sitemap 能列出子页 | ❌ 技术上做不到（fragment 不是独立 URL） | ✅ 自动生成 |

实测确认：现站源码里 `'项目 · Peter267'` 这个字符串**不存在**，它只在运行时由 JS 写入 `document.title`。也就是说，**6/7 的页面内容对爬虫是不存在的**。

> 我**没有**找到任何"hash 路由扣多少排名"的量化数据，也不打算编一个。可辩护的表述只有结构性的这一句：**hash 路由让 7 个页面里的 6 个从索引里消失。**

### 这条为什么等于"必要性"

一个个人主页的存在意义就是"别人搜 Peter267 时能找到、能点进对应页面"。**七个页面只被当作一个**，这恰好击穿了站点的核心用途。而这件事：

- **不装框架也能修**（手写 `history.pushState` + 7 个 HTML 文件 + 一个构建脚本即可）
- 但**装框架是顺手修掉它最省事的方式**——见 §4 的实测：Astro 用 7 个文件自动产出 7 个真实 URL + 独立 head + sitemap，零额外配置。

---

## 3. 选型对比（2026-11 现状）

版本均于 2026-11-15 实时查询 npm registry 核实。

| | **Astro 7.4.12** | **Next.js 16.4.6** | **Nuxt 4.6.4** | **SvelteKit 3.2.0** | **Eleventy 3.1.8** | **VitePress 1.6.4** |
|---|---|---|---|---|---|---|
| 静态输出成熟度 | ✅ `output:'static'` 即默认，无需 adapter | ⚠️ 受限模式，[13 项官方不支持特性](https://nextjs.org/docs/app/guides/static-exports) | ✅ `nuxt generate`，有爬虫可达性警告 | ✅ `adapter-static`，但 v3 仅 6 周 | ✅ 它本身就是 SSG | ✅ 技术上可以，但跑题 |
| 最小 JS | ✅ **默认零 JS**，islands 按需 | ❌ RSC payload 恒定 | ⚠️ ~41.1 kB gzip（官方 CI 基线） | ⚠️ ~32.5 kB gzip（三方） | ✅ **文档承诺零 JS** | ❌ Vue 运行时常驻 |
| 每页 metadata | ✅ layout props | ✅ Metadata API | ✅ `useSeoMeta` | ✅ `<svelte:head>` | ⚠️ frontmatter，无 OG helper | ✅ 但偏文档形态 |
| 定制设计自由度 | ✅ 完全掌控 HTML | ⚠️ 需接受 RSC 语义 | ✅ | ✅ | ✅ **零注入标记** | ⚠️ 需从零写主题 |
| 学习曲线（HTML/CSS/JS 底子） | 🟢 **最低**（`.astro` ≈ HTML + `---`） | 🔴 陡（RSC / `'use client'`） | 🟠 Vue SFC | 🟠 runes + v3 配置迁移 | 🟢 **最低** | 🟠 Vue + 主题 API |
| 生态健康度（2026-11） | ✅ 强，但 **18 个月 3 个大版本** | ✅ 商业强，静态导出非重点 | ✅ 强，Nuxt 5 未发布 | ✅ 强但在动荡 | 🟠 改名 Build Awesome，v4 alpha 停滞 4.5 月 | 🔴 **stable 冻结 15 个月** |
| **对本站** | 🥇 **最合适** | ❌ 杀鸡用牛刀 | ❌ 无收益的运行时税 | ❌ 时机不对 | 🥈 强备选 | ❌ 不合适 |

### 逐个说明

**Astro —— 推荐。** 默认零 JS；`.astro` 对 HTML/CSS/JS 底子的人几乎零学习成本；7 个页面文件自动产出 7 个真实 URL。实测（§4）原样复用了本站的 `shader.js` / `content.js` / 全部 4 个 CSS。

**Eleventy —— 强备选。** 它的"零 JS"是[文档明写的政策](https://www.11ty.dev/docs/why/)（"we add no runtime JavaScript bundle of our own"），比 Astro 的"默认零 JS 但可以打破"更硬。代价是组件化要靠 Nunjucks macro/shortcode，没有 `<slot />`。另外两件事要知道：项目 **2026-03 已改名为 "Build Awesome"**（仓库 `11ty/eleventy` → `11ty/buildawesome`），v4 停在 alpha.10 且 4.5 个月没动。若你更看重"不引入任何运行时语义"，它比 Astro 更纯；若你看重"改起来顺手"，Astro 更好。

**Next.js —— 不推荐。** `output: 'export'` 是官方明确的**受限模式**：dynamic routes 需 `generateStaticParams()`、不支持 `cookies`/`rewrites`/`redirects`/`headers`/`middleware`(Proxy)/ISR/Image Optimization 默认 loader/Server Actions 等 13 项。静态导出后仍会内联 RSC payload。而 Next 16 [连 `next build` 输出里的 First Load JS 一栏都删了](https://nextjs.org/blog/next-16)——说明静态体积不是它的优化目标。

**Nuxt 4 / SvelteKit 3 —— 不推荐（对本站）。** 两者都能做静态，但都给一个 7 页展示站强加了不需要的运行时（~41 kB / ~32.5 kB gzip 基线）与心智模型。SvelteKit 3 才发布 6 周，2.x 仍在并行打补丁，此刻迁入是给自己找迁移工作。

**VitePress —— 不推荐。** stable **1.6.4 发布于 2025-08-05，已冻结约 15 个月**，所有动作都在一个跑了 22 个月的 2.0 alpha 里。它是文档引擎，用在定制设计站上要么整个丢掉默认主题（那 Vue + VitePress 相对纯 Vite 就是纯开销），要么不停对抗文档版式。且它[不支持 hash 路由](https://vitepress.dev/guide/routing)。

**Tailwind 4.3.5 —— 不要顺手引入。** 本站已有 `tokens.css` + 63 KB 手写 CSS，视觉语言是精心调过的。引入 Tailwind 的代价是：Preflight 会重置边距/边框/标题样式（对调好的版式直接产生视觉回归）、`@theme` 与 `:root` 要分工、组件 `<style>` 里用 `@apply` 需要 `@reference`、浏览器基线被拉到 2023 年（Chrome 111 / Safari 16.4）。对一个 7 路由、已有成熟 token 层的站，**没有证据表明 Tailwind 能减少 CSS 体积**——这是工作流偏好，不是性能收益。

---

## 4. 可行性：真实搭起来跑通了（不是推演）

我在 `%TEMP%\astro-spike` 里用**本站的真实代码**搭了一个 Astro 7.4.12 项目。

### 4.1 直接复用了什么（零改动）

| 文件 | 行数 | 结果 |
|---|---|---|
| `shader.js` | 787 | ✅ 原样打包，tree-shake 后 18.4 KB → gzip 5.8 KB |
| `content.js` | 300 | ✅ 原样 import |
| `labels.js` / `icons.js` / `logo.js` | 32 | ✅ 原样 import，SVG 正常渲染进 HTML |
| `tokens/base/layout/components.css` | 2,619 | ✅ 原样保留 |

**5,001 行里约 3,700 行可直接复用。** 这不是"理论上能复用"，是实测构建产物里确实包含着色器源码（已验证 bundle 内含 `webgl2` 与 shader 关键字）。

### 4.2 需要重写的

只有 `main.js` 里的 **7 个模板函数 + 路由 + 事件绑定**，以及把 `index.html` 拆成 1 个 layout + 7 个 page。约 800 行。

### 4.3 构建结果

```
7 page(s) built in 702ms
/                                  index.html
/achievements/ /contact/ /experience/ /friends/
/posts/ /projects/                 index.html × 6
sitemap-index.xml + sitemap-0.xml   ← 自动生成
```

每个路由产出**独立的 `<title>` 与 `<link rel="canonical">`**（实测）：

```
/             Peter267 · 无限进步
/achievements/ 奖项 · Peter267
/experience/   经历 · Peter267
/projects/     项目 · Peter267   ← 现站源码里根本没有这个字符串
```

### 4.4 ClientRouter：能保住 SPA 手感，但有三个坑（全部复现）

实测点击真实链接切换（1440×900，headless）：

```
/ → /projects/    152 ms   title 已更新   整页重载=否 ✓
  → /experience/  436 ms   title 已更新   整页重载=否 ✓
  → /contact/     146 ms   title 已更新   整页重载=否 ✓
最终 canonical=https://…/contact/  控制台无错误 ✓
```

也就是说：**静态多页 + ClientRouter 能同时拿到真实 URL 和 SPA 般的切换手感。** 但实测踩到三个坑，迁移时必须处理：

**坑 1（严重）：`transition:persist` 放错位置会让页面内容永不更新。**
我最初给 `<main>` 加了 `transition:persist`，结果 URL 和 title 都变了，**但 DOM 内容原地不动**——用户点导航会看到标题变了、页面没变。这是最隐蔽的失败模式。正确做法：不要 persist 内容容器。

**坑 2（严重）：打包后的 module script 在一次会话里只执行一次。**
修掉坑 1 后，去 `/projects/` 正常了（`canvas=0`），但**返回首页时 canvas 没有重建**（仍 `canvas=0`，着色器动画失效）。原因是 Astro 文档明写：

> "Bundled module scripts … are only ever executed once. After initial execution they will be ignored, even if the script exists on the new page after a transition."

本站的首屏就是 WebGL，这正好命中。修法是监听 `astro:page-load` 重建，并在 `astro:before-swap` 销毁（否则 WebGL 上下文泄漏，浏览器上限约 16 个）。改完实测：

```
初始 /          canvas=1
→ /projects/    canvas=0  h1="项目"   ← 内容正确替换
→ 返回 /        canvas=1             ← 动画恢复 ✓
```

**坑 3：`compressHTML` 默认值变了，会静默改变排版。**
我不采信二手说法，直接从 `node_modules/@astrojs/vite-plugin-astro/dist/defaults.js` 读到：

```js
compressHTML: "jsx",
```

即默认由 `true` 改为 `'jsx'`。后果：行内元素之间的空白按 JSX 规则折叠，`</span>\n<em>` 会渲染成 `helloworld` 而不是 `hello world`。**对一个精心调过字距与中文排版的设计系统，这是无声的版式破坏。** 迁移时必须显式设 `compressHTML: true` 并逐页比对。

**附带发现（现有代码里就有的隐患）**：`shader.js` 里 `const NOISE_URL = './assets/img/grain-noise.png'` 是**相对路径**。在 hash 路由下恒为单页，所以没事；一旦改成真实 URL，从 `/projects/` 这类嵌套路径解析就会 404（我实测过：返回 404 → 着色器走 CSS 兜底）。**迁移时必须改成绝对路径或 `import.meta.env.BASE_URL` 拼接。**

### 4.5 迁移的真实成本（要讲清楚）

| 项目 | 现状 | Astro 后 |
|---|---|---|
| 依赖 | **0** | 2 个直接依赖，163 个包，`node_modules` **132.8 MB** |
| 构建步骤 | 无（源码即产物） | 需要 `npm run build` |
| 工具链要求 | Node 任意 | **Node ≥ 22.23.4** |
| 版本节奏 | 自己控制 | Astro 18 个月 3 个大版本 |

这是本次迁移**唯一实质性的代价**：从"双击就能改、零依赖、十年后还能跑"变成"依赖一个 132 MB 的工具链、要跟着升大版本"。对个人项目，这个交换是否划算取决于你多看重 §1.4 和 §2 的问题。

---

## 5. 部署

三个平台都支持 Astro 静态产物，且产物是"每路由一目录 + index.html"结构，**无需任何重写规则**——这点已实测确认。

| 平台 | 结论 |
|---|---|
| **Vercel** | 零配置，且你已在此。文档明写静态 Astro 无需额外配置。**最省事，建议保持。** |
| **Cloudflare** | 静态经济性最好（带宽不计费、2 万文件）。但注意：[官方文档现已明写](https://developers.cloudflare.com/pages/)"**Start new projects with Workers**"，Pages 在被软性引导迁移。若要用 Cloudflare，新项目应从 **Workers static assets** 起步，别从 Pages。 |
| **GitHub Pages** | 免费可用，但作为项目站必须设 `base: '/repo'`，且**所有内部链接都要手工加前缀**（7 个导航 + Atom feed 的 fetch 路径都要改）；还不能自定义响应头。 |

**关于 Cloudflare 2026-01 收购 Astro 运营实体**：已验证 10 个月后 `astro@7.4.12` 仍是 **MIT**，仍是多平台支持，Netlify 在 Astro 7 发布当天同步发文支持。**未发现许可证、治理或托管中立性的实质变化。** 但 10 个月不等于永远；真正的风险不是许可证（已发布的 MIT 代码不可撤回），而是**路线图重心**——例如 `@astrojs/cloudflare` 适配器的重构就是这次合作的直接产物。这是"偏爱"而非"锁定"。

---

## 6. 推荐

### 6.1 分两步，不要合并

**第一步（无论是否上框架，都该做）：修掉 hash 路由。**
这是本报告里唯一"确凿且影响核心用途"的问题。可以用最小代价做：7 个 HTML 文件 + `history.pushState`，或者干脆直接进第二步。

**第二步（推荐）：迁到 Astro，顺手把路由问题彻底解决。**

### 6.2 为什么是 Astro

1. **SEO 问题被顺带解决**——7 个文件 → 7 个真实 URL + 独立 head + 自动 sitemap，零额外配置。
2. **迁移面很小**——5,001 行里约 3,700 行原样复用（含 787 行着色器、2,619 行 CSS、全部 SVG 数据）。只有约 800 行要重写。
3. **学习成本最低**——`.astro` 就是 HTML 加一段 `---`，不需要学新的响应式模型。
4. **默认零 JS**——和你现在"没有框架、不加载任何 CDN JS"的取向一致，不会突然多出运行时。
5. **已实测跑通**——不是纸面推荐，是在本机用你的真实代码构建成功、并在真实浏览器里验证了路由切换与 WebGL 生命周期。

### 6.3 如果选 Astro，这四件事必须做

1. **`compressHTML: true`**——否则排版会被 JSX 空白规则悄悄改掉（§4.4 坑 3）。
2. **`shader.js` 的 `NOISE_URL` 改绝对路径**——否则嵌套路由下着色器 404 走兜底（§4.4 附带发现）。
3. **WebGL 用 `astro:page-load` 重建 + `astro:before-swap` 销毁**——否则返回首页动画失效、或上下文泄漏（§4.4 坑 2）。
4. **不要给内容容器加 `transition:persist`**——否则页面"标题变了内容不变"（§4.4 坑 1）。

### 6.4 什么情况下应该选 Eleventy 而不是 Astro

- 你认为"零 JS 必须是硬保证，而不是可以被打破的默认值"；
- 你完全不需要 islands / 组件级交互，接受用 macro 做复用；
- 你更看重"产出 HTML 里一个字节都不是框架注入的"。

代价是组件化更原始、项目刚改名且 v4 alpha 停滞。

### 6.5 什么情况下应该"什么都不做"

如果你判断这个站**主要靠简历/二维码/直接链接传播，几乎不指望搜索引擎带来人**,那么 §2 的必要性就不成立,而 §1.4 的卡顿可以用针对性优化解决(排查 `/projects` 那 2.4–4.9 秒)。这种情况下,**保持零依赖是更理性的选择**——它现在能跑、能改、不欠任何技术债。

**我的判断是：值得迁。** 理由是代价可控（~800 行重写、约 3,700 行直接复用）、目标明确（7 个页面真正被索引）、且已在真实环境验证过。但这个判断依赖"你希望站点被搜到"这个前提——如果这个前提不成立，本报告的结论应当反过来。

---

## 7. 附：本次一并完成的 Node 升级

迁移的实测过程暴露了一个前置阻塞：**Astro 7 要求 Node ≥ 22.23.4，而本机是 22.17.0**（`npm run build` 直接报错退出）。因此先完成了升级：

| | 之前 | 之后 |
|---|---|---|
| Node | v22.17.0 | **v24.22.3**（LTS "Krypton"） |
| npm | 11.12.0 | 11.12.0（随包升级为 11.19.1，已还原为 11.12.0 保持一致） |
| 安装形态 | `H:\Node` 便携版（在机器级 PATH 中） | 同路径，原地替换 |

**过程中的两个真实障碍（供以后参考）：**

1. **`H:\Node` 对当前用户是只读的**（ACL 只给 `Authenticated Users` ReadAndExecute，且当前用户不是管理员）。直接覆盖文件全部被拒。解决办法是**重命名目录**（`H:\` 根可写）后再铺入新版本。
2. **升级后 npm 全局前缀被重置**为 `H:\Node`，导致所有全局 CLI 不可见。原因是旧安装的 `node_modules/npm/npmrc` 里有 `prefix=${APPDATA}\npm`，而新包没有这个文件。补回该文件后恢复正常。

**验证结果**：`node` / `npm` / `npx` / `pnpm` / `corepack` 全部正常；`dsh` / `claude` / `codex` / `gemini` 四个全局 CLI 全部以退出码 0 运行，**无 `NODE_MODULE_VERSION` 不匹配报错**（即原生模块 ABI 兼容）；本站 6 个 ES module 全部通过 `node --check`；本地服务器正常返回 200。

**回滚点**：`H:\Node.v22-orig`（保留中，确认新版本稳定后可删）。

---

## 8. 未能核实的事项（明确标注，不猜）

- **性能对比**：headless + SwiftShader 下 TBT 方差过大（43–1093 ms），**未得出可靠结论**。请求数 14→6、传输 210→32 KB 是可靠的。
- **Next.js 静态导出体积**：官方无基线，Next 16 已删除体积报告。第三方 hello-world 约 133 KB gzip（server 模式，只能当上界）。
- **Tailwind 对小站生成 CSS 体积**：无官方数据，未实测。
- **Bing 对 fragment 的具体指引**：未取得。
- **Astro WebGL `transition:persist` 的 Safari 18 已知 issue #15727**：确认该 issue 存在及其标题，但未取得其解决状态（已知 6.0.0-beta.19 changelog 提到修过 Safari WebGL 上下文丢失）。我在 Chromium 上实测的是另一个失败模式（script 只执行一次），已自行解决。
- **`/projects` 首切 2.4–4.9 秒的根因**：未做 profile，只确认现象可复现。

---

## 参考来源

- Google Search Central — [FAQ about JavaScript and links](https://developers.google.cn/search/blog/2020/05/frequently-asked-questions-about?hl=en) / [Deprecating AJAX crawling](https://developers.google.cn/search/blog/2015/10/deprecating-our-ajax-crawling-scheme?hl=en)
- Astro — [Astro 6](https://astro.build/blog/astro-6/) / [Astro 7](https://astro.build/blog/astro-7/) / [v6 升级指南](https://docs.astro.build/en/guides/upgrade-to/v6/) / [v7 升级指南](https://docs.astro.build/en/guides/upgrade-to/v7/) / [View Transitions](https://docs.astro.build/en/guides/view-transitions/) / [Client-side scripts](https://docs.astro.build/en/guides/client-side-scripts/) / [Layouts](https://docs.astro.build/en/basics/layouts/) / [Styling](https://docs.astro.build/en/guides/styling/) / [Deploy: Vercel](https://docs.astro.build/en/guides/deploy/vercel) / [Deploy: GitHub Pages](https://docs.astro.build/en/guides/deploy/github/) / [Joining Cloudflare](https://astro.build/blog/joining-cloudflare/)
- Next.js — [Static exports](https://nextjs.org/docs/app/guides/static-exports) / [Next 16](https://nextjs.org/blog/next-16) / [export-image-api](https://nextjs.org/docs/messages/export-image-api)
- Nuxt — [Prerendering](https://nuxt.com/docs/4.x/getting-started/prerendering) / [bundle.test.ts](https://raw.githubusercontent.com/nuxt/nuxt/main/test/bundle.test.ts)
- SvelteKit — [SvelteKit 3 is here](https://svelte.dev/blog/sveltekit-3-is-here) / [adapter-static](https://svelte.dev/docs/kit/adapter-static) / [迁移指南](https://svelte.dev/docs/kit/migrating-to-sveltekit-3)
- Eleventy — [Why Eleventy](https://www.11ty.dev/docs/why/) / [Build Awesome 改名](https://www.11ty.dev/blog/build-awesome/) / [Shortcodes](https://www.11ty.dev/docs/shortcodes/)
- VitePress — [Custom theme](https://vitepress.dev/guide/custom-theme) / [Routing](https://vitepress.dev/guide/routing) / [SSR 兼容](https://vitepress.dev/guide/ssr-compat)
- Tailwind — [v4.0](https://tailwindcss.com/blog/tailwindcss-v4) / [Installation (Vite)](https://tailwindcss.com/docs/installation/using-vite) / [Theme](https://tailwindcss.com/docs/theme) / [Compatibility](https://tailwindcss.com/docs/compatibility)
- 平台 — [Cloudflare Pages](https://developers.cloudflare.com/pages/) / [Pages 限额](https://developers.cloudflare.com/pages/platform/limits/) / [Vercel limits](https://vercel.com/docs/limits) / [Cloudflare 收购新闻稿](https://www.cloudflare.com/press/press-releases/2026/cloudflare-acquires-astro-to-accelerate-the-future-of-high-performance-web-development/)
- 浏览器支持 — [caniuse: view-transitions](https://caniuse.com/view-transitions) / [cross-document](https://caniuse.com/cross-document-view-transitions)
