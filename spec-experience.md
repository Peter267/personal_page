# 规格：新增「经历」页（时间轴）

## 1. 用户需求

> 增加"经历"页面，采用时间轴形式展示

## 2. 目标

在现有五个页面（奖项 / 项目 / 友情链接 / 联系我 / 文章）之外，新增第六个路由页
`#/experience`（导航文案「经历」），内容以**竖向时间轴**呈现个人发展历程。

「经历」与既有「成就」页职责不同，不合并、不互相替代：

| | 成就（achievements） | 经历（experience） |
| --- | --- | --- |
| 语义 | 有明确结果的节点（奖项、里程碑） | 有起止时间的"做了什么" |
| 排序 | 时间倒序，最近的在最上面 | 时间正序，最近的在最下面 |
| 形态 | 规整列表（1px 间隙当分隔线） | 竖向时间轴（左侧竖轴 + 时间列） |

## 3. 交互与视觉

### 3.1 页面结构

```
section.experience-section
 ├── .section-label          / Experience 矢量字标（与其它页同款）
 ├── .section-title          经历
 ├── .section-lead           一句话说明
 ├── ol.timeline            
 │    └── li.timeline-item × N
 │         ├── .timeline-period-col > span.timeline-period   时间（轴线左侧，右对齐）
 │         ├── span.timeline-dot                            轴上的节点圆点
 │         └── .timeline-body
 │              ├── .timeline-head > h2.timeline-title + span.timeline-role
 │              ├── p.timeline-desc
 │              └── .timeline-tags > span.timeline-tag × N
 └── p.timeline-note         // 持续更新中（右对齐、等宽小字）
```

### 3.2 时间轴实现

- **三列网格**：`grid-template-columns: 88px 1px 1fr`（时间列 / 轴线列 / 正文列）。
- **轴线**：`.timeline-item::before` **绝对定位**铺满整条（`top:0; bottom:0; left:88px`），
  这样线能覆盖 `padding-bottom` 那一段，条目之间不会断开。
  （若用 `height:100%` 的网格项，只能撑满内容盒，padding 段会留空档、轴变成虚线。）
- **首尾渐隐**：第一条上端 `linear-gradient` 渐隐、最后一条只画 30px 后渐隐，
  线"从虚无里来、往虚无里去"，比硬切一刀自然。
- **节点**：9px 圆点骑在轴线上（`justify-self: center` 在 1px 列里居中）；
  `margin-top: 6px` 让圆点中线与首行文字对齐。
  圆点必须 `position: relative; z-index: 1` —— 轴线是绝对定位的 `::before`，
  默认会盖在静态定位的圆点之上，把"空心"节点从中间劈成两半。
- **强调**：仅 `current: true` 的条目用实心主色圆点 + 4px 光晕 + 主色期号。
  全篇实心会失去重点，全空心又太平。

### 3.3 响应式

断点 **600px**（与既有 `.post-item` 堆叠断点一致）：

- ≥601px：三列布局，时间在轴线左侧、右对齐。
- ≤600px：改单列 `1px 1fr` + `grid-template-rows: auto auto`；
  时间挪到正文上方当小标题（左对齐），正文降到第 2 行，轴线 `left: 0` 贴容器边。
  88px 时间列在窄屏会吃掉正文近 1/4 宽度，中文标题会被挤成两三个字一行。

### 3.4 字标

`/ Experience` 用 `tools/make-section-label.py` 生成，参数由既有 5 个字标反解：
RobotoFlex-Bold 12px（cap 8.53125）、baseline y=11、字母横向 ×1.10、斜杠后 493 单位空格、
viewBox 高固定 14。生成结果为 `width="75" viewBox="0 0 75 14"`。

**验证方式**：用同一脚本重新生成 `Projects` / `Achievements` / `Friends` / `Contact`，
与参考站提取的原路径逐像素比对，四个词全部重合 —— 证明参数反解正确。

## 4. 数据模型

`content.js` 新增 `experience` 键（位于 `achievements` 与 `friends` 之间）：

```js
experience: {
  title: '经历',
  lead: '从折腾到创造，一路走来的时间线。按时间正序排列，最近的在最下面。',
  items: [
    {
      period: '2025 — 至今',  // 时间段，轴线左侧列
      title: '从写页面到做产品', // 一句话概括
      role: '独立开发者',       // 身份/角色，可省略
      desc: '……',             // 1～3 句展开
      tags: ['Serverless'],  // 可选
      current: true,         // 布尔，标"至今"的节点高亮轴线与圆点
    },
    // …共 6 条
  ],
  note: '// 持续更新中',
}
```

## 5. 改动清单

| 文件 | 改动 |
| --- | --- |
| `assets/js/content.js` | 新增 `experience` 数据块；`routes` 新增 `/experience` 路由（插在「奖项」之后）；后续小节序号顺延 |
| `assets/js/main.js` | 新增 `tplExperience()`；`TEMPLATES` 注册 `experience` |
| `assets/css/components.css` | 新增 `6b. 经历时间轴` 与 `10.1 经历时间轴`（≤600px 响应式）两节，共约 250 行 |
| `assets/js/labels.js` | 新增 `EXPERIENCE` 字标；补充生成方式说明 |
| `index.html` | `<noscript>` 导航补一条「经历」 |
| `tools/make-section-label.py` | 新增：字标生成脚本（`tools/` 已被 gitignore，本地工具） |

## 6. 验收标准

1. `#/experience` 可访问，标题为「经历 · Peter267」，导航「经历」高亮。
2. 页面显示 6 条时间轴条目，左侧竖轴连续不断、首尾渐隐；只有最后一条为实心主色圆点。
3. 字标显示 `/ Experience`，与 `/ Projects` 等字标字体、字重、baseline、斜杠完全一致。
4. 1440×900 / 390×844 布局正常；1920 / 1024 / 768 / 600 / 480 / 360 均无横向溢出。
5. 深浅主题切换正常：轴线 `#2a2a2a`↔`#e0e0e0`，期号 `#00ff88`↔`#00875a`。
6. 其余六个路由均正常渲染，控制台无报错。

## 7. 验证结果

自动化 CDP 测试 **58/58 项通过**，覆盖：7 个路由的标题/字标/导航高亮、时间轴结构
（条目数/节点数/期号/角色/标签/current 唯一性/轴线位置）、8 档视口无横向溢出、
深浅主题的 4 项颜色断言、控制台无错误。

```powershell
node tools/serve.js
node tools/_verify-exp.js        # 58 项断言
```

## 8. 非目标

- 不合并「成就」与「经历」两页。
- 不改动首页 Hero、动态纹理、字标体系。
- 不为时间轴引入滚动触发动画（滚动位置已被全站禁用滚动条，再加动效会喧宾夺主）。