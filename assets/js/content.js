/**
 * content.js — 全站内容配置
 * ============================================================================
 * 设计结构严格对齐 apanzinc.top（2026-11 构建产物），只替换为 Peter267 的内容。
 * 改名、改简介、改项目/友链只动这一个文件。
 * ============================================================================
 */

export const content = {
  /* ==========================================================================
     1. 站点与身份
     ========================================================================== */
  site: {
    // 站名（顶栏字标、页脚、文档标题共用；字标 SVG 由 tools/make-logo-svg.py 生成）
    brand: 'Peter267',
    // 浏览器标签页标题
    title: '无限进步',
    lang: 'zh-CN',
    // 主色。必须与 tokens.css 的 --accent 一致（会被传给 WebGL 着色器）
    accent: '#00ff88',
  },

  /* ==========================================================================
     2. 首页 Hero
     --------------------------------------------------------------------------
     构图与原站一致：左下角超大站名字标 + 右下角简介 + 关键词胶囊。
     ========================================================================== */
  hero: {
    name: 'Peter267',
    bioLines: ['一名学生、独立开发者、博主，', '从折腾到创造，无限进步。'],
    chips: [
      { label: '天津', href: '' },
      { label: 'Python', href: '' },
      { label: 'Node.js', href: '' },
      { label: 'Hexo', href: '' },
      { label: '独立开发者', href: '' },
      { label: 'INTP-T', href: '' },
    ],
  },

  /* ==========================================================================
     3. 项目作品
     ========================================================================== */
  projects: {
    title: '项目',
    lead: '本页列出目前公开的项目：SimpleSearch、智学网排名计算、班级随机抽号器、Markdown 笔记、CN-e-learning 与 AppIcon Forge。',
    items: [
      {
        name: 'SimpleSearch',
        description:
          '极简的搜索起始页，聚合多引擎与常用站点，打开浏览器就能直接搜。',
        link: 'https://simplesearch.rth1.xyz/',
      },
      {
        name: '智学网排名计算',
        description: '根据智学网成绩单计算年级排名，省去手动对照的麻烦。',
        link: 'https://simplesearch.rth1.xyz/zhixue',
      },
      {
        name: '班级随机抽号器',
        description: '课堂随机点名与抽号工具，老师上课可以直接用。',
        link: 'https://simplesearch.rth1.xyz/random-psdture',
      },
      {
        name: 'Markdown 笔记',
        description: '浏览器内的 Markdown 编辑器，边写边渲染，无需安装。',
        link: 'https://simplesearch.rth1.xyz/markdown.html',
      },
      {
        name: 'CN-e-learning',
        description:
          '面向电教委员的开源指南项目，汇集多校设备维护与软件操作经验，基于 VitePress 构建，隶属于智教联盟。',
        link: 'https://github.com/Peter267',
      },
      {
        name: 'AppIcon Forge',
        description: '在线 App 图标生成器，上传一张图即可产出多尺寸图标。',
        link: 'https://icon.peter267.dpdns.org',
      },
    ],
  },

  /* ==========================================================================
     4. 成就 / 经历
     ========================================================================== */
  achievements: {
    title: '成就',
    lead: '记录目前展示的成就与开源贡献。按时间倒序排列，最近的在最上面。',
    items: [
      {
        title: '《电教委员指南》项目上线',
        description:
          '面向电教委员的实战指南，汇集全国多所学校的设备维护经验。隶属于智教联盟，基于 VitePress 构建并在 GitHub 开源。',
        date: '2025.09',
        tags: ['进行中'],
      },
      {
        title: '博客两周年',
        description:
          '从 Gridea 到 Hexo + AnZhiYu 主题，累计发布 47 篇文章、约 5.7 万字，完成域名迁移与图床自建（Cloudflare R2）。',
        date: '2025.07',
        tags: ['里程碑'],
      },
      {
        title: '自建图床与基础设施',
        description:
          '因第三方图床两次关停导致图片丢失，改用 Cloudflare R2 自建图床，并在 Zeabur 上部署 OpenList 等服务。',
        date: '2025',
        tags: ['已完成'],
      },
      {
        title: '加入共青团',
        description: '在初中阶段加入中国共产主义青年团。',
        date: '2025',
        tags: ['已完成'],
      },
      {
        title: '开始独立建站',
        description:
          '从 2022 年的 Framer 起步，历经热铁盒网页托管、Gridea，最终转向 Hexo 自建博客，逐步掌握完整的建站与部署链路。',
        date: '2022 — 至今',
        tags: ['持续'],
      },
    ],
    note: '// 持续更新中',
  },

  /* ==========================================================================
     5. 友情链接
     ========================================================================== */
  friends: {
    title: '友情链接',
    lead: '友链列表与申请入口。可通过页面下方「申请友链」提交信息。',
    items: [
      {
        name: 'Peter267 博客',
        desc: '无限进步 · 主站',
        url: 'https://peter267.github.io/',
        avatar: '',
      },
      {
        name: '备用博客',
        desc: 'blog.peter267.me',
        url: 'https://blog.peter267.me/',
        avatar: '',
      },
      {
        name: '导航站',
        desc: '常用站点集合',
        url: 'https://nav267.netlify.app',
        avatar: '',
      },
      {
        name: '说说',
        desc: '即刻短文与碎片记录',
        url: 'https://mm.peter267.dpdns.org',
        avatar: '',
      },
      {
        name: '安知鱼',
        desc: '本博客所用 AnZhiYu 主题的作者',
        url: 'https://blog.anheyu.com/',
        avatar: '',
      },
      {
        name: '开往',
        desc: '随机访问一位独立博客作者',
        url: 'https://www.travellings.cn/go.html',
        avatar: '',
      },
    ],
    // 申请友链区块（原站结构：我的信息 + 申请要求 + 弹窗表单）
    apply: {
      title: '申请须知',
      lead: '提交申请前，请确保以下四点全部做到，缺一不可。',
      myLabel: '// 我的信息',
      rulesLabel: '// 申请要求',
      info: [
        { label: '名称', value: 'Peter267' },
        { label: '简介', value: '一名学生、独立开发者、博主。' },
        { label: '网站', value: 'https://peter267.github.io/' },
        { label: '头像', value: 'https://peter267.github.io/assets/logo.svg' },
      ],
      rules: [
        '五项信息全部填满，一项为空则不通过。',
        '链接以 http:// 或 https:// 开头，使用自己的域名。',
        '网站必须是个人博客或作品集，不接受团队/公司站点。',
        '先挂好本站友链，再审核。',
      ],
      submitLabel: '申请友链',
      modalTitle: '// 友情链接申请',
      mailto: 'wujingbo12@qq.com',
    },
  },

  /* ==========================================================================
     6. 联系我
     ========================================================================== */
  contact: {
    title: '找到我',
    lead: '以下为目前公开的联系与社交账号。',
    // icon 取值见 assets/js/icons.js
    links: [
      {
        name: 'GitHub',
        handle: '@Peter267',
        url: 'https://github.com/Peter267',
        icon: 'GitHub',
      },
      {
        name: 'Gitee',
        handle: '@wujingbo2012',
        url: 'https://gitee.com/wujingbo2012',
        icon: 'Gitee',
      },
      {
        name: 'Email',
        handle: 'wujingbo12@qq.com',
        url: 'mailto:wujingbo12@qq.com',
        icon: 'Email',
      },
      {
        name: 'Bilibili',
        handle: 'UID 1057113298',
        url: 'https://space.bilibili.com/1057113298',
        icon: 'Bilibili',
      },
      {
        name: '爱发电',
        handle: '@peter267',
        url: 'https://afdian.com/a/peter267',
        icon: '爱发电',
      },
    ],
  },

  /* ==========================================================================
     7. 博客文章
     --------------------------------------------------------------------------
     直接从 Atom feed 读取最近文章，不在本地留副本。
     ========================================================================== */
  posts: {
    title: '最近文章',
    lead: '来自博客的最新 6 篇，按发布时间倒序。',
    feedUrl: 'https://blog.peter267.top/atom.xml',
    blogUrl: 'https://blog.peter267.top/',
    limit: 6,
    loading: '正在获取最新文章…',
    empty: '博客暂时没有可显示的文章。',
    error: '文章加载失败。',
  },

  /* ==========================================================================
     8. 页脚
     --------------------------------------------------------------------------
     左：年份区间；右：备案号 | 说明。
     说明沿用原站逻辑：首页显示站点说明，子页面显示站名。
     ========================================================================== */
  footer: {
    since: 2024,
    icp: '萌ICP备 20241711 号',
    icpUrl: 'https://icp.gov.moe/?keyword=20241711',
    note: '本站由 Cloudflare Pages 提供静态托管',
  },
};

/* ============================================================================
   路由表
   ----------------------------------------------------------------------------
   原站导航为：奖项 / 项目 / 友情链接 / 联系我。
   这里按上一轮需求保留独立「文章」页，其余顺序与原站一致。
   ============================================================================ */
export const routes = [
  { path: '/achievements', label: '奖项', name: 'achievements' },
  { path: '/projects', label: '项目', name: 'projects' },
  { path: '/friends', label: '友情链接', name: 'friends' },
  { path: '/contact', label: '联系我', name: 'contact' },
  // 原站 4 项顺序不变，文章页作为新增项放在最后
  { path: '/posts', label: '文章', name: 'posts' },
];

/** 当前年份，用于页脚年份区间 */
export const currentYear = new Date().getFullYear();
