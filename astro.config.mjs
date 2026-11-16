import { defineConfig } from 'astro/config';
import sitemap from '@astrojs/sitemap';

// https://astro.build/config
export default defineConfig({
  site: 'https://peter267.github.io',

  // 纯静态输出：每个路由一个真实 URL（/projects/ 等），
  // 部署到 Vercel / GitHub Pages / Cloudflare 都不需要重写规则。
  output: 'static',

  /**
   * 统一尾斜杠。
   * build.format 是 'directory'，产物为 /projects/index.html，
   * 规范地址就是 /projects/。显式声明 always 可避免不同托管平台
   * （Vercel / GitHub Pages / Cloudflare）各自的重定向规则不一致，
   * 也让 canonical 与实际 URL 严格对齐。
   */
  trailingSlash: 'always',

  build: {
    // 小样式表内联进 HTML，减少首屏阻塞请求（本站 CSS 会被拆成多块）。
    inlineStylesheets: 'auto',
  },

  /**
   * compressHTML 必须显式设为 true。
   *
   * Astro 7 的默认值已改为 'jsx'，它会按 JSX 规则折叠行内元素之间的空白：
   *   `</span>\n<em>` 会被渲染成 `helloworld` 而不是 `hello world`。
   * 本站的中文排版、字标间距都是逐像素调过的，交给 JSX 规则去折叠
   * 会造成**无声的版式破坏**（构建不报错，只是看起来不对）。
   * 显式写死 true = 保留传统的 HTML 空白压缩行为。
   */
  compressHTML: true,

  integrations: [sitemap()],

  // 悬停即预取，配合 ClientRouter 让切换接近瞬时。
  prefetch: {
    prefetchAll: true,
    defaultStrategy: 'hover',
  },
});
