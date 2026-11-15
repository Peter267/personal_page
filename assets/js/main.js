/**
 * main.js — 应用入口
 * ============================================================================
 * 结构与交互严格对齐 apanzinc.top（2026-11 构建产物）：
 *   - 启动页进度条 + 收尾事件
 *   - hash 路由（静态站避免刷新 404）
 *   - 原站四个页面 + 独立「文章」页
 *
 * 职责划分：
 *   content.js  数据
 *   labels.js   原站 section-label 矢量标签
 *   icons.js    原站社交图标
 *   shader.js   首屏动态纹路（Paper GrainGradient）
 *   logo.js     首屏 RobotoFlex 字标矢量路径
 *   *.css       样式
 *   本文件      渲染 + 事件 + 路由
 * ============================================================================
 */

import { content, routes, currentYear } from './content.js';
import { createBackground } from './shader.js';
import { logoSvg } from './logo.js';
import { sectionLabels } from './labels.js';
import { socialIcons } from './icons.js';

/* ============================================================================
   0. 图标
   ============================================================================ */

const ICONS = {
  sun: '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><circle cx="12" cy="12" r="5"/><line x1="12" y1="1" x2="12" y2="3"/><line x1="12" y1="21" x2="12" y2="23"/><line x1="4.22" y1="4.22" x2="5.64" y2="5.64"/><line x1="18.36" y1="18.36" x2="19.78" y2="19.78"/><line x1="1" y1="12" x2="3" y2="12"/><line x1="21" y1="12" x2="23" y2="12"/><line x1="4.22" y1="19.78" x2="5.64" y2="18.36"/><line x1="18.36" y1="5.64" x2="19.78" y2="4.22"/></svg>',
  moon: '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8Z"/></svg>',
  folder:
    '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/></svg>',
};

/* ============================================================================
   1. HTML 转义
   ============================================================================ */

function esc(s) {
  return String(s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/** 原站 section-label 是矢量图，这里直接内联提取好的 SVG */
function label(key) {
  return `<div class="section-label">${sectionLabels[key] || ''}</div>`;
}

/* ============================================================================
   2. 页面模板
   ============================================================================ */

/** 首页：满屏 Hero */
function tplHome() {
  const { hero } = content;

  const bioHTML = (hero.bioLines || [])
    .map((line) => `<span class="bio-line">${esc(line)}</span>`)
    .join('');

  const chipsHTML = (hero.chips || [])
    .map((c, i) => {
      const labelText = typeof c === 'string' ? c : c.label;
      const href = typeof c === 'string' ? '' : c.href;
      const tag = href ? 'a' : 'span';
      const attrs = href ? `href="${esc(href)}"` : '';
      return `<${tag} class="hero-chip" style="--i:${i}" ${attrs}>${esc(
        labelText
      )}</${tag}>`;
    })
    .join('');

  return `
    <div class="page home-page">
      <section class="hero">
        <div class="hero-shader" id="hero-shader" aria-hidden="true"></div>
        <div class="hero-veil" aria-hidden="true"></div>

        <div class="hero-content">
          <div class="intro-left">
            <div
              class="hero-logo"
              id="hero-logo"
              role="img"
              aria-label="${esc(hero.name)}"
            >${logoSvg}</div>
          </div>

          <div class="intro-right">
            <p class="intro-bio" id="intro-bio">${bioHTML}</p>
            <div class="hero-chips" id="hero-chips">${chipsHTML}</div>
          </div>
        </div>
      </section>
    </div>`;
}

/** 文章页 */
function tplPosts() {
  const { posts } = content;

  return `
    <div class="page container">
      <section class="post-section" id="posts">
        ${label('POSTS')}
        <h1 class="section-title">${esc(posts.title)}</h1>
        <p class="section-lead">${esc(posts.lead)}</p>
        <div class="post-list" id="post-list" aria-live="polite" aria-busy="true">
          <div class="post-state">${esc(posts.loading)}</div>
        </div>
        <div class="post-more">
          <a href="${esc(posts.blogUrl)}" target="_blank" rel="noopener noreferrer">浏览博客全部文章 ↗</a>
        </div>
      </section>
    </div>`;
}

/** 项目页 */
function tplProjects() {
  const { projects } = content;

  const cards = projects.items
    .map(
      (p) => `
      <a class="project-card" href="${esc(p.link || '#/projects')}"
         ${p.link ? 'target="_blank" rel="noopener noreferrer"' : ''}>
        <div class="project-header">
          <span class="project-icon">${ICONS.folder}</span>
          <h3 class="project-name">${esc(p.name)}</h3>
        </div>
        <p class="project-desc">${esc(p.description)}</p>
      </a>`
    )
    .join('');

  return `
    <div class="page container">
      <section class="projects-section" id="projects">
        ${label('PROJECTS')}
        <h1 class="section-title">${esc(projects.title)}</h1>
        <p class="section-lead">${esc(projects.lead)}</p>
        <div class="projects-grid">${cards}</div>
      </section>
    </div>`;
}

/** 成就页 */
function tplAchievements() {
  const { achievements } = content;

  const items = achievements.items
    .map(
      (a) => `
      <div class="achievement-item">
        <div class="achievement-marker">
          <span class="marker-arrow" aria-hidden="true">→</span>
        </div>
        <div class="achievement-content">
          <h3 class="achievement-title">${esc(a.title)}</h3>
          <p class="achievement-desc">${esc(a.description)}</p>
          <div class="achievement-meta">
            <span class="achievement-date">${esc(a.date)}</span>
            ${(a.tags || [])
              .map((t) => `<span class="achievement-tag">${esc(t)}</span>`)
              .join('')}
          </div>
        </div>
      </div>`
    )
    .join('');

  const note = achievements.note
    ? `<p class="achievement-note">${esc(achievements.note)}</p>`
    : '';

  return `
    <div class="page container">
      <section class="achievement-section" id="achievements">
        ${label('ACHIEVEMENTS')}
        <h1 class="section-title">${esc(achievements.title)}</h1>
        <p class="section-lead">${esc(achievements.lead)}</p>
        <div class="achievement-list">${items}</div>
        ${note}
      </section>
    </div>`;
}

/** 经历页（横向数轴） */
function tplExperience() {
  const { experience } = content;
  const items = experience.items || [];

  // ---- 数轴范围 ----
  // 优先用配置里的 from/to；没配就从条目里取 min/max，保证新加条目不会画出轴外。
  const starts = items.map((e) => Number(e.from)).filter((n) => Number.isFinite(n));
  const ends = items
    .map((e) => (e.to == null ? NaN : Number(e.to)))
    .filter((n) => Number.isFinite(n));
  const axisFrom = Number.isFinite(Number(experience.from))
    ? Number(experience.from)
    : Math.min(...starts);
  // "至今"的条目以轴的右端为终点，所以轴的末端要取配置值或最后一条的起点
  const axisTo = Number.isFinite(Number(experience.to))
    ? Number(experience.to)
    : Math.max(...ends, ...starts);
  const span = axisTo - axisFrom || 1;
  const pct = (year) => ((year - axisFrom) / span) * 100;

  // ---- 刻度 ----
  const ticks =
    Array.isArray(experience.ticks) && experience.ticks.length
      ? experience.ticks.map(Number).filter(Number.isFinite)
      : Array.from(
          { length: Math.floor(span) + 1 },
          (_, i) => Math.floor(axisFrom) + i
        );

  const ticksHTML = ticks
    .map((t, i) => {
      const p = pct(t);
      // 首尾刻度贴边时，文字要向内收，否则会被容器裁掉
      const edge =
        i === 0 ? ' tick-first' : i === ticks.length - 1 ? ' tick-last' : '';
      return `<span class="axis-tick${edge}" style="--p:${p.toFixed(
        4
      )}%">${esc(String(t))}</span>`;
    })
    .join('');

  // 竖向网格线：把每个刻度往下引一条淡线，贯穿所有条目区。
  // 有了它，"这条横条跨过了 2024 吗"才能一眼读出来。
  const gridHTML = ticks
    .map(
      (t) =>
        `<span class="axis-gridline" style="--p:${pct(t).toFixed(
          4
        )}%" aria-hidden="true"></span>`
    )
    .join('');

  // ---- 条目 ----
  const rows = items
    .map((e) => {
      const from = Number(e.from);
      const open = e.to == null; // 至今：横条开口
      const to = open ? axisTo : Number(e.to);
      const left = pct(Math.max(from, axisFrom));
      const right = pct(Math.min(to, axisTo));
      const width = Math.max(right - left, 0);

      const tags = (e.tags || [])
        .map((t) => `<span class="timeline-tag">${esc(t)}</span>`)
        .join('');

      return `
      <li class="timeline-item${e.current ? ' timeline-item-current' : ''}${
        open ? ' timeline-item-open' : ''
      }">
        <div class="timeline-info">
          <div class="timeline-head">
            <h2 class="timeline-title">${esc(e.title)}</h2>
            ${
              e.role ? `<span class="timeline-role">${esc(e.role)}</span>` : ''
            }
            <span class="timeline-period">${esc(e.period)}</span>
          </div>
          <p class="timeline-desc" title="${esc(e.desc)}">${esc(e.desc)}</p>
          ${tags ? `<div class="timeline-tags">${tags}</div>` : ''}
        </div>

        <div class="timeline-axis-cell" aria-hidden="true">
          <span class="timeline-bar" style="--l:${left.toFixed(
            4
          )}%;--w:${width.toFixed(4)}%"></span>
        </div>
      </li>`;
    })
    .join('');

  const note = experience.note
    ? `<p class="timeline-note">${esc(experience.note)}</p>`
    : '';

  return `
    <div class="page container">
      <section class="experience-section" id="experience">
        ${label('EXPERIENCE')}
        <h1 class="section-title">${esc(experience.title)}</h1>
        <p class="section-lead">${esc(experience.lead)}</p>

        <div class="axis" role="group" aria-label="时间数轴">
          <div class="axis-head">
            <span class="axis-head-label">年份</span>
            <div class="axis-ticks">${ticksHTML}</div>
          </div>
          <div class="axis-body">
            <div class="axis-grid" aria-hidden="true">${gridHTML}</div>
            <ol class="axis-list">${rows}</ol>
          </div>
        </div>

        ${note}
      </section>
    </div>`;
}

/** 友链页（列表） */
function tplFriends() {
  const { friends } = content;

  const cards = friends.items
    .map((f) => {
      // 原站没有头像时不渲染占位，文字直接左对齐
      const avatarHTML = f.avatar
        ? `<img class="friend-avatar" src="${esc(f.avatar)}" alt="" loading="lazy" />`
        : '';

      return `
        <a class="friend-link" href="${esc(
          f.url
        )}" target="_blank" rel="noopener noreferrer">
          ${avatarHTML}
          <div class="friend-content">
            <span class="friend-name">${esc(f.name)}</span>
            <span class="friend-desc">${esc(f.desc)}</span>
          </div>
        </a>`;
    })
    .join('');

  return `
    <div class="page container">
      <section class="friend-section" id="friends">
        ${label('FRIENDS')}
        <h1 class="section-title">${esc(friends.title)}</h1>
        <p class="section-lead">${esc(friends.lead)}</p>

        <div class="friend-grid">${cards}</div>
      </section>
    </div>`;
}

/** 联系页 */
function tplContact() {
  const { contact } = content;

  const cards = (contact.links || [])
    .map(
      (l) => `
      <a class="social-link" href="${esc(
        l.url
      )}" target="_blank" rel="noopener noreferrer">
        <span class="social-icon">${socialIcons[l.icon] || ''}</span>
        <div class="social-info">
          <span class="social-name">${esc(l.name)}</span>
          <span class="social-handle">${esc(l.handle)}</span>
        </div>
        <span class="social-arrow" aria-hidden="true">↗</span>
      </a>`
    )
    .join('');

  return `
    <div class="page container">
      <section class="social-section" id="contact">
        ${label('CONTACT')}
        <h1 class="section-title">${esc(contact.title)}</h1>
        <p class="section-lead">${esc(contact.lead)}</p>
        <div class="social-grid">${cards}</div>
      </section>
    </div>`;
}

/** 404 */
function tplNotFound() {
  return `
    <div class="page container">
      <section>
        <div class="section-label">404</div>
        <h1 class="section-title">页面不存在</h1>
        <p class="section-lead">
          你要找的页面可能已经被移动或删除了。
          <a href="#/" style="color:var(--accent)">回到首页</a>
        </p>
      </section>
    </div>`;
}

const TEMPLATES = {
  home: tplHome,
  posts: tplPosts,
  projects: tplProjects,
  achievements: tplAchievements,
  experience: tplExperience,
  friends: tplFriends,
  contact: tplContact,
};

/* ============================================================================
   3. 路由
   ============================================================================ */

function parseRoute() {
  let hash = location.hash.replace(/^#/, '');
  if (!hash) hash = '/';
  if (!hash.startsWith('/')) hash = '/' + hash;
  hash = hash.split('?')[0].replace(/\/+$/, '') || '/';

  if (hash === '/') {
    return { path: '/', label: '首页', name: 'home' };
  }

  const found = routes.find((r) => r.path === hash);
  return found || { path: hash, label: '不存在', name: 'notfound' };
}

function renderNav(activeName) {
  const desktop = document.getElementById('navbar-links');
  const mobile = document.querySelector('.mobile-menu-content');
  const total = routes.length;

  if (desktop) {
    desktop.innerHTML = routes
      .map(
        (r) => `
        <a class="nav-link ${r.name === activeName ? 'nav-link-active' : ''}"
           href="#${r.path}"
           ${r.name === activeName ? 'aria-current="page"' : ''}
        >${esc(r.label)}</a>`
      )
      .join('');
  }

  if (mobile) {
    mobile.innerHTML = routes
      .map(
        (r, i) => `
        <a class="mobile-nav-link ${
          r.name === activeName ? 'nav-link-active' : ''
        }"
           href="#${r.path}"
           style="--i:${i};--total:${total}"
           ${r.name === activeName ? 'aria-current="page"' : ''}
        >${esc(r.label)}</a>`
      )
      .join('');
  }
}

let disposePage = null;

function renderRoute() {
  const route = parseRoute();

  if (typeof disposePage === 'function') {
    try {
      disposePage();
    } catch {}
    disposePage = null;
  }

  const main = document.getElementById('main-content');
  if (!main) return;

  const tpl = TEMPLATES[route.name] || tplNotFound;
  main.innerHTML = tpl();

  renderNav(route.name);
  updateFooter(route.name);

  window.scrollTo(0, 0);

  if (route.name === 'home') {
    disposePage = mountHome();
  } else {
    disposePage = mountContentPage(route.name);
  }

  document.title =
    route.name === 'home'
      ? `${content.site.brand} · ${content.site.title}`
      : `${route.label} · ${content.site.brand}`;

  closeMobileMenu();
}

/* ============================================================================
   4. 首页效果
   ============================================================================ */

function mountHome() {
  const shaderHost = document.getElementById('hero-shader');
  const bio = document.getElementById('intro-bio');
  const chips = Array.from(document.querySelectorAll('.hero-chip'));

  let bg = null;

  if (shaderHost) {
    const canvas = document.createElement('canvas');
    shaderHost.appendChild(canvas);

    bg = createBackground(canvas);

    bgInstance = bg;
  }

  requestAnimationFrame(() => {
    setTimeout(() => bio?.classList.add('bio-visible'), 120);
    chips.forEach((chip, i) => {
      setTimeout(() => chip.classList.add('chip-visible'), 380 + i * 70);
    });
  });

  return () => {
    if (bg) bg.destroy();
    if (bgInstance === bg) bgInstance = null;
  };
}

/* ============================================================================
   5. 子页面效果
   ============================================================================ */

function mountContentPage(routeName) {
  if (routeName === 'posts') return mountPosts();
  return () => {};
}

/* ---------- 文章列表（Atom feed） ---------- */

let postsRequest = null;

function formatPostDate(iso) {
  const t = Date.parse(iso);
  if (Number.isNaN(t)) return '';
  const d = new Date(t + 8 * 60 * 60 * 1000);
  const pad = (n) => String(n).padStart(2, '0');
  return `${d.getUTCFullYear()}.${pad(d.getUTCMonth() + 1)}.${pad(d.getUTCDate())}`;
}

function postExcerpt(text, max = 96) {
  const clean = String(text || '').replace(/\s+/g, ' ').trim();
  return clean.length > max ? `${clean.slice(0, max)}…` : clean;
}

function fetchPosts() {
  if (postsRequest) return postsRequest;

  const { feedUrl, blogUrl, limit = 6 } = content.posts;

  postsRequest = fetch(feedUrl, { cache: 'no-cache' })
    .then((res) => {
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return res.text();
    })
    .then((xml) => {
      const doc = new DOMParser().parseFromString(xml, 'application/xml');
      if (doc.querySelector('parsererror')) throw new Error('XML 解析失败');

      return Array.from(doc.querySelectorAll('entry'))
        .slice(0, limit)
        .map((entry) => {
          const link =
            entry.querySelector('link[rel="alternate"]') ||
            entry.querySelector('link');
          return {
            title: entry.querySelector('title')?.textContent.trim() || '无标题',
            url: link?.getAttribute('href') || blogUrl,
            date:
              entry.querySelector('published')?.textContent ||
              entry.querySelector('updated')?.textContent ||
              '',
            summary: entry.querySelector('summary')?.textContent || '',
          };
        });
    })
    .catch((err) => {
      postsRequest = null;
      throw err;
    });

  return postsRequest;
}

function mountPosts() {
  const list = document.getElementById('post-list');
  if (!list) return () => {};

  let cancelled = false;

  fetchPosts()
    .then((items) => {
      if (cancelled || !list.isConnected) return;
      list.setAttribute('aria-busy', 'false');

      if (!items.length) {
        list.innerHTML = `<div class="post-state">${esc(content.posts.empty)}</div>`;
        return;
      }

      list.innerHTML = items
        .map(
          (item) => `
          <a class="post-item" href="${esc(item.url)}" target="_blank" rel="noopener noreferrer">
            <span class="post-date">${esc(formatPostDate(item.date))}</span>
            <span class="post-body">
              <span class="post-title">${esc(item.title)}<span class="post-arrow" aria-hidden="true">↗</span></span>
              ${item.summary ? `<span class="post-summary">${esc(postExcerpt(item.summary))}</span>` : ''}
            </span>
          </a>`
        )
        .join('');
    })
    .catch((err) => {
      if (cancelled || !list.isConnected) return;
      console.info('[posts] 获取文章失败:', err.message);
      list.setAttribute('aria-busy', 'false');
      list.innerHTML = `<div class="post-state">${esc(
        content.posts.error
      )} <a href="${esc(content.posts.blogUrl)}" target="_blank" rel="noopener noreferrer">前往博客 ↗</a></div>`;
    });

  return () => {
    cancelled = true;
  };
}

/* ============================================================================
   6. 主题
   ============================================================================ */

const THEME_KEY = 'theme';
let bgInstance = null;

function applyTheme(theme, persist = false) {
  document.documentElement.setAttribute('data-theme', theme);

  const iconWrap = document.getElementById('theme-icon');
  if (iconWrap) iconWrap.innerHTML = ICONS[theme === 'dark' ? 'sun' : 'moon'];

  const toggle = document.getElementById('theme-toggle');
  if (toggle) {
    toggle.setAttribute(
      'aria-label',
      theme === 'dark' ? '切换到浅色模式' : '切换到深色模式'
    );
  }

  if (bgInstance?.setTheme) bgInstance.setTheme(theme);

  const meta = document.querySelector('meta[name="theme-color"]');
  if (meta) {
    meta.setAttribute('content', theme === 'light' ? '#f8f8f8' : '#000000');
  }

  if (persist) {
    try {
      localStorage.setItem(THEME_KEY, theme);
    } catch {}
  }
}

function resolveInitialTheme() {
  try {
    const saved = localStorage.getItem(THEME_KEY);
    if (saved === 'light' || saved === 'dark') return saved;
  } catch {}
  return window.matchMedia('(prefers-color-scheme: dark)').matches
    ? 'dark'
    : 'light';
}

/* ============================================================================
   7. 移动端菜单
   ============================================================================ */

function openMobileMenu() {
  const menu = document.getElementById('mobile-menu');
  const btn = document.getElementById('menu-toggle');
  const iconEl = document.getElementById('menu-icon');
  if (!menu || !btn) return;

  menu.classList.add('is-open');
  menu.setAttribute('aria-hidden', 'false');
  btn.setAttribute('aria-expanded', 'true');
  btn.setAttribute('aria-label', '关闭菜单');
  iconEl?.classList.add('menu-open');
  document.body.style.overflow = 'hidden';
}

function closeMobileMenu() {
  const menu = document.getElementById('mobile-menu');
  const btn = document.getElementById('menu-toggle');
  const iconEl = document.getElementById('menu-icon');
  if (!menu || !btn) return;

  menu.classList.remove('is-open');
  menu.setAttribute('aria-hidden', 'true');
  btn.setAttribute('aria-expanded', 'false');
  btn.setAttribute('aria-label', '打开菜单');
  iconEl?.classList.remove('menu-open');
  document.body.style.overflow = '';
}

function bindMobileMenu() {
  const btn = document.getElementById('menu-toggle');
  if (!btn) return;

  btn.addEventListener('click', () => {
    const isOpen = btn.getAttribute('aria-expanded') === 'true';
    isOpen ? closeMobileMenu() : openMobileMenu();
  });

  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') closeMobileMenu();
  });

  window.matchMedia('(min-width: 769px)').addEventListener('change', (e) => {
    if (e.matches) closeMobileMenu();
  });
}

/* ============================================================================
   8. 页脚与站点信息
   ============================================================================ */

function updateFooter(routeName) {
  const { footer } = content;

  const yearEl = document.getElementById('footer-year');
  if (yearEl) {
    yearEl.textContent =
      footer.since && footer.since < currentYear
        ? `${footer.since}-${currentYear}`
        : String(currentYear);
  }

  // 原站逻辑：首页显示服务说明，子页面显示站名
  const noteEl = document.getElementById('footer-note');
  if (noteEl) {
    noteEl.textContent =
      routeName === 'home' ? footer.note || '' : content.site.brand;
  }
}

function applySiteMeta() {
  const { site, footer } = content;

  const icpEl = document.getElementById('footer-icp');
  const dividerEl = document.getElementById('footer-divider');
  if (icpEl) {
    if (footer.icp) {
      icpEl.textContent = footer.icp;
      icpEl.href = footer.icpUrl || '#';
      icpEl.hidden = false;
      if (dividerEl) dividerEl.hidden = false;
    } else {
      icpEl.hidden = true;
      if (dividerEl) dividerEl.hidden = true;
    }
  }

  if (site.lang) document.documentElement.setAttribute('lang', site.lang);
}

/* ============================================================================
   10. 启动
   ============================================================================ */

function boot() {
  applyTheme(resolveInitialTheme());
  applySiteMeta();

  document.getElementById('theme-toggle')?.addEventListener('click', () => {
    const current = document.documentElement.getAttribute('data-theme');
    applyTheme(current === 'light' ? 'dark' : 'light', true);
  });

  bindMobileMenu();

  window.addEventListener('hashchange', renderRoute);
  renderRoute();

  // 告知启动页：页面已渲染完成
  window.__bootReady?.();
}

// 启动
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', boot, { once: true });
} else {
  boot();
}
