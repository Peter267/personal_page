/**
 * site.js — 全站交互（主题切换、移动端菜单）
 * ============================================================================
 * 为什么是普通模块而不是组件内脚本：
 *   这些逻辑挂在导航栏/按钮上，而导航栏属于 layout，在 ClientRouter 下
 *   每次切页都会换掉 DOM。所以必须用事件委托绑在 document 上，
 *   只执行一次，永久有效 —— 否则每切一页就丢一次监听。
 * ============================================================================
 */

const THEME_KEY = 'theme';

const SUN = `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><circle cx="12" cy="12" r="5"/><line x1="12" y1="1" x2="12" y2="3"/><line x1="12" y1="21" x2="12" y2="23"/><line x1="4.22" y1="4.22" x2="5.64" y2="5.64"/><line x1="18.36" y1="18.36" x2="19.78" y2="19.78"/><line x1="1" y1="12" x2="3" y2="12"/><line x1="21" y1="12" x2="23" y2="12"/><line x1="4.22" y1="19.78" x2="5.64" y2="18.36"/><line x1="18.36" y1="5.64" x2="19.78" y2="4.22"/></svg>`;
const MOON = `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8Z"/></svg>`;

function currentTheme() {
  return document.documentElement.getAttribute('data-theme') === 'light'
    ? 'light'
    : 'dark';
}

/** 把主题作用到 DOM，并同步按钮图标、aria、theme-color。 */
function applyTheme(theme, persist = false) {
  document.documentElement.setAttribute('data-theme', theme);

  const iconWrap = document.getElementById('theme-icon');
  if (iconWrap) iconWrap.innerHTML = theme === 'dark' ? SUN : MOON;

  const toggle = document.getElementById('theme-toggle');
  if (toggle) {
    toggle.setAttribute(
      'aria-label',
      theme === 'dark' ? '切换到浅色模式' : '切换到深色模式'
    );
  }

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

/* ---------- 移动端菜单 ---------- */

function setMenu(open) {
  const menu = document.getElementById('mobile-menu');
  const btn = document.getElementById('menu-toggle');
  const iconEl = document.getElementById('menu-icon');
  if (!menu || !btn) return;

  menu.classList.toggle('is-open', open);
  menu.setAttribute('aria-hidden', String(!open));
  btn.setAttribute('aria-expanded', String(open));
  btn.setAttribute('aria-label', open ? '关闭菜单' : '打开菜单');
  iconEl?.classList.toggle('menu-open', open);
  document.body.style.overflow = open ? 'hidden' : '';
}

/* ---------- 绑定（只绑一次） ---------- */

let bound = false;

export function bindSiteInteractions() {
  if (bound) return;
  bound = true;

  // 事件委托：DOM 被 ClientRouter 换掉后依然有效
  document.addEventListener('click', (e) => {
    const target = e.target instanceof Element ? e.target : null;
    if (!target) return;

    if (target.closest('#theme-toggle')) {
      applyTheme(currentTheme() === 'light' ? 'dark' : 'light', true);
      return;
    }

    if (target.closest('#menu-toggle')) {
      const expanded =
        document.getElementById('menu-toggle')?.getAttribute('aria-expanded') ===
        'true';
      setMenu(!expanded);
      return;
    }

    // 点菜单里的链接后关闭
    if (target.closest('.mobile-nav-link')) setMenu(false);
  });

  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') setMenu(false);
  });

  window
    .matchMedia('(min-width: 769px)')
    .addEventListener('change', (e) => {
      if (e.matches) setMenu(false);
    });
}

/** 每次页面加载都要跑一次：同步主题图标等与 DOM 相关的状态。 */
export function syncPageState() {
  applyTheme(currentTheme());
  setMenu(false);
}

bindSiteInteractions();
