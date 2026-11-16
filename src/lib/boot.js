/**
 * boot.js — 启动页进度条
 * ============================================================================
 * 从原 index.html 的内联脚本迁移而来，行为保持一致：
 *   最短 1.2s、最长 7s、模块就绪（window.__bootReady）后收尾。
 *
 * 与 Astro/ClientRouter 的关键配合（这是一个真实踩到的坑）：
 *   ClientRouter 换页时会把整个 <body> 替换掉，于是待在各页面 HTML 里的
 *   #boot 元素会被重新插入，而首次加载时已经把它 remove 了、没有任何人
 *   再负责清理它。
 *   结果：从首页点到任何子页后，一个 z-index:99999、opacity:1 的纯黑遮罩
 *   重新盖住整页 —— 用户看到的是"白屏/黑屏"，控制台却毫无报错。
 *
 *   因此这里必须区分"首次加载"与"客户端换页"：
 *     首次 → 跑完整进度条动画
 *     换页 → 立即移除，绝不再显示
 * ============================================================================
 */

const reduceMotion = (() => {
  try {
    return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  } catch {
    return false;
  }
})();

/** 换页后立即抹掉启动页（不带动画，因为它根本不该出现）。 */
export function teardownBoot() {
  const boot = document.getElementById('boot');
  if (boot) boot.remove();
  const styles = document.getElementById('loading-styles');
  if (styles) styles.remove();
}

export function initBoot() {
  const boot = document.getElementById('boot');
  if (!boot) return;

  const bar = document.getElementById('boot-bar');
  let done = false;
  let progress = 0;
  let appReady = false;
  let minElapsed = false;
  const startedAt = Date.now();
  const MIN_MS = 1200;
  const MAX_MS = 7000;

  function setProgress(value) {
    progress = Math.max(progress, Math.min(100, value | 0));
    if (bar) bar.style.width = progress + '%';
    boot.setAttribute('aria-valuenow', String(progress));
  }

  function tickFake() {
    if (done || appReady) return;
    const elapsed = Date.now() - startedAt;
    const target = Math.min(90, 8 + elapsed / 40);
    if (progress < target) {
      setProgress(Math.floor(progress + (target - progress) * 0.3));
    }
    requestAnimationFrame(tickFake);
  }

  function remove() {
    if (boot.parentNode) boot.parentNode.removeChild(boot);
    const styles = document.getElementById('loading-styles');
    if (styles?.parentNode) styles.parentNode.removeChild(styles);
  }

  function tryFinish() {
    if (done || !appReady || !minElapsed) return;
    done = true;
    setProgress(100);

    requestAnimationFrame(() => {
      boot.classList.add('is-done');
      setTimeout(remove, reduceMotion ? 0 : 650);
    });
  }

  function markAppReady() {
    if (appReady) return;
    appReady = true;
    setProgress(96);
    tryFinish();
  }

  setTimeout(() => {
    minElapsed = true;
    tryFinish();
  }, reduceMotion ? 0 : MIN_MS);

  setTimeout(() => {
    if (!appReady) markAppReady();
  }, MAX_MS);

  if (document.readyState === 'complete') setProgress(28);
  else
    window.addEventListener('load', () => setProgress(48), { once: true });

  if (!reduceMotion) requestAnimationFrame(tickFake);
  else setProgress(40);

  // 页面已由 Astro 渲染完毕，直接放行（不再等 JS 模板渲染）
  markAppReady();
}
