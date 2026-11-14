/**
 * main.js — 应用入口
 * ============================================================================
 * 结构与交互严格对齐 apanzinc.top（2026-11 构建产物）：
 *   - 启动页进度条 + 收尾事件
 *   - hash 路由（静态站避免刷新 404）
 *   - 原站四个页面 + 独立「文章」页
 *   - 友链申请弹窗
 *
 * 职责划分：
 *   content.js  数据
 *   labels.js   原站 section-label 矢量标签
 *   icons.js    原站社交图标
 *   logo.js     RobotoFlex 粗体站名字标
 *   *.css       样式
 *   本文件      渲染 + 事件 + 路由
 * ============================================================================
 */

import { content, routes, currentYear } from './content.js';
import { createBackground } from './shader.js';
import { sectionLabels } from './labels.js';
import { socialIcons } from './icons.js';
import { logoSvg } from './logo.js';

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
            <div class="hero-logo" id="hero-logo" role="img" aria-label="${esc(
              hero.name
            )}">${logoSvg}</div>
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

/** 友链页（列表 + 申请须知 + 申请弹窗） */
function tplFriends() {
  const { friends } = content;
  const apply = friends.apply || {};

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

  const infoRows = (apply.info || [])
    .map(
      (row) => `
      <div class="apply-info-row">
        <span class="apply-info-label">${esc(row.label)}</span>
        <span class="${row.label === '头像' ? 'apply-info-url' : ''}">${esc(
        row.value
      )}</span>
      </div>`
    )
    .join('');

  const rules = (apply.rules || [])
    .map(
      (r, i) => `
      <div class="apply-info-row">
        <span class="apply-info-num">0${i + 1}</span>
        <span>${esc(r)}</span>
      </div>`
    )
    .join('');

  return `
    <div class="page container">
      <section class="friend-section" id="friends">
        ${label('FRIENDS')}
        <h1 class="section-title">${esc(friends.title)}</h1>
        <p class="section-lead">${esc(friends.lead)}</p>

        <div class="friend-grid">${cards}</div>

        <div class="apply-section">
          <h2 class="apply-title">${esc(apply.title)}</h2>
          <p class="apply-lead">${esc(apply.lead)}</p>

          <div class="apply-grid">
            <div class="apply-card">
              <p class="apply-card-label">${esc(apply.myLabel)}</p>
              <div class="apply-info-card">
                <button class="copy-btn" type="button" data-copy-friend>复制</button>
                ${infoRows}
              </div>
            </div>

            <div class="apply-card">
              <p class="apply-card-label">${esc(apply.rulesLabel)}</p>
              <div class="apply-rules-card">${rules}</div>
            </div>
          </div>

          <div class="apply-footer">
            <button class="apply-btn" type="button" data-open-apply>${esc(
              apply.submitLabel
            )}</button>
          </div>
        </div>
      </section>

      <!-- 申请弹窗：原站是飞书 iframe，这里换成同尺寸表单，提交后走邮件 -->
      <div class="modal-overlay" id="apply-modal" aria-hidden="true">
        <div class="modal-container" role="dialog" aria-modal="true" aria-label="友情链接申请">
          <div class="modal-header-bar">
            <span class="modal-header-title"><span class="title-slash">//</span> 友情链接申请</span>
            <button class="modal-close" type="button" data-close-apply aria-label="关闭">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
            </button>
          </div>

          <form class="apply-form" id="apply-form">
            <div class="apply-field">
              <label for="apply-name">名称</label>
              <input id="apply-name" name="name" type="text" maxlength="40" required />
            </div>
            <div class="apply-field">
              <label for="apply-url">网站</label>
              <input id="apply-url" name="url" type="url" placeholder="https://" required />
            </div>
            <div class="apply-field">
              <label for="apply-desc">简介</label>
              <input id="apply-desc" name="desc" type="text" maxlength="80" required />
            </div>
            <div class="apply-field">
              <label for="apply-avatar">头像</label>
              <input id="apply-avatar" name="avatar" type="url" placeholder="https://" />
            </div>
            <p class="modal-form-tip">提交后会打开邮件客户端，把信息发送到 ${esc(
              apply.mailto
            )}。</p>
            <div class="apply-form-actions">
              <button class="apply-btn" type="submit">发送申请</button>
            </div>
          </form>
        </div>
      </div>
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

    bg = createBackground(canvas, {
      accent: content.site.accent,
      theme: document.documentElement.getAttribute('data-theme') || 'dark',
      reducedMotion: window.matchMedia('(prefers-reduced-motion: reduce)')
        .matches,
    });

    if (bg?.fallback) {
      shaderHost.style.background =
        'radial-gradient(ellipse 90% 70% at 30% 100%, rgba(0,255,136,.20), transparent 62%), ' +
        'radial-gradient(ellipse 70% 60% at 78% 70%, rgba(0,133,88,.16), transparent 66%), #000';
    }

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
   9. 复制 / 友链申请弹窗
   ============================================================================ */

function buildFriendCopy() {
  const apply = content.friends.apply || {};
  return (apply.info || []).map((row) => `${row.label}：${row.value}`).join('\n');
}

async function copyText(text) {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    try {
      const ta = document.createElement('textarea');
      ta.value = text;
      ta.style.cssText = 'position:fixed;opacity:0;pointer-events:none';
      document.body.appendChild(ta);
      ta.select();
      const ok = document.execCommand('copy');
      document.body.removeChild(ta);
      return ok;
    } catch {
      return false;
    }
  }
}

function bindCopyButtons() {
  document.addEventListener('click', async (e) => {
    const btn = e.target.closest('[data-copy], [data-copy-friend]');
    if (!btn) return;

    const text = btn.hasAttribute('data-copy-friend')
      ? buildFriendCopy()
      : btn.dataset.copy;
    const original = btn.textContent;
    const ok = await copyText(text);

    btn.textContent = ok ? '已复制' : '失败';
    btn.style.opacity = '1';
    setTimeout(() => {
      btn.textContent = original;
    }, 1600);
  });
}

function openApplyModal() {
  const modal = document.getElementById('apply-modal');
  if (!modal) return;
  modal.classList.add('is-open');
  modal.setAttribute('aria-hidden', 'false');
  document.body.style.overflow = 'hidden';
  setTimeout(() => document.getElementById('apply-name')?.focus(), 50);
}

function closeApplyModal() {
  const modal = document.getElementById('apply-modal');
  if (!modal) return;
  modal.classList.remove('is-open');
  modal.setAttribute('aria-hidden', 'true');
  document.body.style.overflow = '';
}

function submitApplyForm(e) {
  e.preventDefault();

  const form = e.currentTarget;
  const data = new FormData(form);
  const mailto = content.friends.apply?.mailto || content.contact?.email;
  const subject = `友情链接申请 - ${data.get('name') || ''}`;
  const body = [
    `名称：${data.get('name') || ''}`,
    `网站：${data.get('url') || ''}`,
    `简介：${data.get('desc') || ''}`,
    `头像：${data.get('avatar') || ''}`,
  ].join('\n');

  window.location.href = `mailto:${mailto}?subject=${encodeURIComponent(
    subject
  )}&body=${encodeURIComponent(body)}`;
  closeApplyModal();
}

function bindApplyModal() {
  document.addEventListener('click', (e) => {
    if (e.target.closest('[data-open-apply]')) {
      openApplyModal();
      return;
    }

    if (e.target.closest('[data-close-apply]')) {
      closeApplyModal();
      return;
    }

    const modal = document.getElementById('apply-modal');
    if (modal && e.target === modal) closeApplyModal();
  });

  document.addEventListener('submit', (e) => {
    if (e.target.id === 'apply-form') submitApplyForm(e);
  });

  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') closeApplyModal();
  });
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
  bindCopyButtons();
  bindApplyModal();

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
