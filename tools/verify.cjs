/**
 * verify.cjs — 全量验收测试
 * ============================================================================
 * 覆盖重构目标与本次 bug 修复：
 *   1. 纹理在"无 WebGL2"浏览器下仍有可见背景（本次修复的核心）
 *   2. 纹理在正常浏览器下正常绘制
 *   3. 纹理在贴图加载失败时退化为 CSS 渐变
 *   4. 7 路由真实 URL + 独立 title/canonical
 *   5. 客户端导航：内容替换、无整页重载、无启动页遮罩残留
 *   6. 返回首页 WebGL 重建
 *   7. 深浅主题、移动端
 *   8. 经历页数轴几何
 *   9. 控制台无错误
 *
 * 用法： node tools/verify.cjs [baseUrl]
 * ============================================================================
 */

const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');
const http = require('http');
const os = require('os');
const crypto = require('crypto');

const CHROME = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const BASE = process.argv[2] || process.env.VERIFY_URL || 'http://localhost:4321';
const OUT = path.resolve(__dirname, '..', 'shots', 'astro');

/* ---------------------------------------------------------------------------
   最小 WebSocket + CDP
   --------------------------------------------------------------------------- */

class WS {
  constructor(url) { this.u = new URL(url); this.id = 0; this.cbs = new Map(); this.buf = Buffer.alloc(0); this.onEvent = null; }
  connect() {
    return new Promise((resolve, reject) => {
      const req = http.request({
        host: this.u.hostname, port: this.u.port, path: this.u.pathname + this.u.search,
        headers: { Connection: 'Upgrade', Upgrade: 'websocket', 'Sec-WebSocket-Key': crypto.randomBytes(16).toString('base64'), 'Sec-WebSocket-Version': '13' },
      });
      req.on('upgrade', (res, socket) => { this.sock = socket; socket.on('data', (d) => this._recv(d)); socket.on('error', reject); resolve(); });
      req.on('error', reject); req.end();
    });
  }
  _recv(chunk) {
    this.buf = Buffer.concat([this.buf, chunk]);
    while (this.buf.length >= 2) {
      const b0 = this.buf[0], b1 = this.buf[1];
      const fin = (b0 & 0x80) !== 0, opcode = b0 & 0x0f, masked = (b1 & 0x80) !== 0;
      let len = b1 & 0x7f, off = 2;
      if (len === 126) { if (this.buf.length < off + 2) return; len = this.buf.readUInt16BE(off); off += 2; }
      else if (len === 127) { if (this.buf.length < off + 8) return; len = Number(this.buf.readBigUInt64BE(off)); off += 8; }
      let maskKey = null;
      if (masked) { if (this.buf.length < off + 4) return; maskKey = this.buf.slice(off, off + 4); off += 4; }
      if (this.buf.length < off + len) return;
      let payload = this.buf.slice(off, off + len);
      this.buf = this.buf.slice(off + len);
      if (maskKey) { const out = Buffer.allocUnsafe(payload.length); for (let i = 0; i < payload.length; i++) out[i] = payload[i] ^ maskKey[i % 4]; payload = out; }
      if (opcode === 0x8) { try { this.sock.destroy(); } catch {} return; }
      if (opcode === 0x9) continue;
      if (opcode !== 0x1 || !fin) continue;
      let msg; try { msg = JSON.parse(payload.toString('utf8')); } catch { continue; }
      if (msg.id && this.cbs.has(msg.id)) { const { resolve, reject } = this.cbs.get(msg.id); this.cbs.delete(msg.id); msg.error ? reject(new Error(JSON.stringify(msg.error))) : resolve(msg.result); }
      else if (msg.method && this.onEvent) this.onEvent(msg);
    }
  }
  _frame(text) {
    const payload = Buffer.from(text, 'utf8'), len = payload.length;
    let header;
    if (len < 126) { header = Buffer.alloc(2); header[0] = 0x81; header[1] = 0x80 | len; }
    else if (len < 65536) { header = Buffer.alloc(4); header[0] = 0x81; header[1] = 0x80 | 126; header.writeUInt16BE(len, 2); }
    else { header = Buffer.alloc(10); header[0] = 0x81; header[1] = 0x80 | 127; header.writeBigUInt64BE(BigInt(len), 2); }
    const mask = crypto.randomBytes(4);
    const masked = Buffer.allocUnsafe(len);
    for (let i = 0; i < len; i++) masked[i] = payload[i] ^ mask[i % 4];
    this.sock.write(Buffer.concat([header, mask, masked]));
  }
  send(method, params = {}) {
    const id = ++this.id;
    return new Promise((resolve, reject) => { this.cbs.set(id, { resolve, reject }); this._frame(JSON.stringify({ id, method, params })); });
  }
  close() { try { this.sock.destroy(); } catch {} }
}

function waitForTarget(port, timeout = 20000) {
  return new Promise((resolve, reject) => {
    const start = Date.now();
    const tick = () => {
      const req = http.get({ host: '127.0.0.1', port, path: '/json/list', timeout: 1200 }, (res) => {
        let d = ''; res.on('data', (c) => (d += c));
        res.on('end', () => {
          try { const page = JSON.parse(d).find((t) => t.type === 'page'); if (page?.webSocketDebuggerUrl) return resolve(page.webSocketDebuggerUrl); } catch {}
          retry();
        });
      });
      req.on('error', retry);
      req.on('timeout', () => { req.destroy(); retry(); });
      function retry() { if (Date.now() - start > timeout) return reject(new Error('CDP 超时')); setTimeout(tick, 200); }
    };
    tick();
  });
}

let pass = 0, fail = 0;
const failures = [];
function check(name, cond, detail = '') {
  if (cond) { pass++; console.log(`  ✅ ${name}`); }
  else { fail++; failures.push(name + (detail ? ` — ${detail}` : '')); console.log(`  ❌ ${name}${detail ? ' — ' + detail : ''}`); }
}

/** 启动一个 Chrome 实例并返回可用的会话 */
async function openBrowser(flags) {
  const port = 9200 + Math.floor(Math.random() * 300);
  const userDir = fs.mkdtempSync(path.join(os.tmpdir(), 'verify-'));
  const chrome = spawn(
    CHROME,
    [
      '--headless=new', `--remote-debugging-port=${port}`, `--user-data-dir=${userDir}`,
      '--window-size=1440,900', '--hide-scrollbars', '--no-first-run', '--no-default-browser-check',
      ...flags, 'about:blank',
    ],
    { stdio: 'ignore' }
  );
  const close = () => {
    try { chrome.kill(); } catch {}
    setTimeout(() => { try { fs.rmSync(userDir, { recursive: true, force: true }); } catch {} }, 300);
  };
  const ws = new WS(await waitForTarget(port));
  await ws.connect();
  return { ws, close };
}

const GL_FLAGS = ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--disable-gpu-sandbox'];

/* ---------------------------------------------------------------------------
   1. 纹理兼容性（本次 bug 修复的验收）
   --------------------------------------------------------------------------- */

async function testTextureCompat() {
  console.log('\n=== 1. 首页纹理兼容性 ===');

  const cases = [
    { label: '正常浏览器（WebGL2 可用）', flags: GL_FLAGS, expect: 'webgl' },
    { label: '无 WebGL2 的浏览器', flags: ['--disable-webgl', '--disable-webgl2'], expect: 'fallback' },
  ];

  for (const c of cases) {
    const { ws, close } = await openBrowser(c.flags);
    try {
      await ws.send('Runtime.enable');
      await ws.send('Page.enable');
      await ws.send('Emulation.setEmulatedMedia', {
        features: [{ name: 'prefers-reduced-motion', value: 'no-preference' }, { name: 'prefers-color-scheme', value: 'dark' }],
      });
      await ws.send('Page.navigate', { url: BASE + '/' });
      await new Promise((r) => setTimeout(r, 3800));

      const r = await ws.send('Runtime.evaluate', {
        expression: `JSON.stringify({
          webgl2: (()=>{try{return !!document.createElement('canvas').getContext('webgl2')}catch(e){return false}})(),
          canvasDisplay: (()=>{const c=document.querySelector('.hero-shader canvas'); return c? getComputedStyle(c).display : null})(),
          hostBg: (()=>{const h=document.querySelector('.hero-shader'); return h? getComputedStyle(h).backgroundImage : ''})(),
          canvasW: (document.querySelector('.hero-shader canvas')||{}).width || 0
        })`,
        returnByValue: true,
      });
      const v = JSON.parse(r.result.value);
      const hasGradient = String(v.hostBg).includes('gradient');

      if (c.expect === 'webgl') {
        check(`${c.label}：canvas 绘制中`, v.canvasDisplay === 'block' && v.canvasW > 0);
      } else {
        // 核心断言：拿不到 WebGL2 时，必须隐藏 canvas 并铺上渐变兜底
        check(`${c.label}：canvas 已隐藏`, v.canvasDisplay === 'none', `display=${v.canvasDisplay}`);
        check(`${c.label}：有 CSS 渐变兜底（背景不会全黑）`, hasGradient, `background=${String(v.hostBg).slice(0, 40)}`);
      }
    } finally { ws.close(); close(); }
  }

  // 贴图加载失败
  const { ws, close } = await openBrowser(GL_FLAGS);
  try {
    await ws.send('Runtime.enable');
    await ws.send('Page.enable');
    await ws.send('Fetch.enable', { patterns: [{ urlPattern: '*grain-noise*', requestStage: 'Request' }] });
    ws.onEvent = (msg) => {
      if (msg.method === 'Fetch.requestPaused') {
        ws.send('Fetch.failRequest', { requestId: msg.params.requestId, errorReason: 'Failed' }).catch(() => {});
      }
    };
    await ws.send('Emulation.setEmulatedMedia', {
      features: [{ name: 'prefers-reduced-motion', value: 'no-preference' }, { name: 'prefers-color-scheme', value: 'dark' }],
    });
    await ws.send('Page.navigate', { url: BASE + '/' });
    await new Promise((r) => setTimeout(r, 3800));

    const r = await ws.send('Runtime.evaluate', {
      expression: `JSON.stringify({
        canvasDisplay: (()=>{const c=document.querySelector('.hero-shader canvas'); return c? getComputedStyle(c).display : null})(),
        hostBg: (()=>{const h=document.querySelector('.hero-shader'); return h? getComputedStyle(h).backgroundImage : ''})()
      })`,
      returnByValue: true,
    });
    const v = JSON.parse(r.result.value);
    check('贴图加载失败：canvas 已隐藏', v.canvasDisplay === 'none');
    check('贴图加载失败：有 CSS 渐变兜底', String(v.hostBg).includes('gradient'));
  } finally { ws.close(); close(); }
}

/* ---------------------------------------------------------------------------
   2. 主流程
   --------------------------------------------------------------------------- */

(async () => {
  fs.mkdirSync(OUT, { recursive: true });

  await testTextureCompat();

  const { ws, close } = await openBrowser(GL_FLAGS);
  const errors = [];
  try {
    ws.onEvent = (msg) => {
      if (msg.method === 'Runtime.exceptionThrown') {
        const d = msg.params.exceptionDetails;
        errors.push((d.exception?.description || d.text || '').slice(0, 160));
      }
      if (msg.method === 'Runtime.consoleAPICalled' && msg.params.type === 'error') {
        errors.push('[console] ' + (msg.params.args || []).map((a) => a.value ?? a.description ?? '').join(' ').slice(0, 160));
      }
    };
    await ws.send('Runtime.enable');
    await ws.send('Page.enable');
    await ws.send('Emulation.setEmulatedMedia', {
      features: [{ name: 'prefers-reduced-motion', value: 'no-preference' }, { name: 'prefers-color-scheme', value: 'dark' }],
    });

    const setViewport = (w, h, mobile = false) =>
      ws.send('Emulation.setDeviceMetricsOverride', { width: w, height: h, deviceScaleFactor: 1, mobile });
    const ev = async (e) => {
      const r = await ws.send('Runtime.evaluate', { expression: e, returnByValue: true, awaitPromise: true });
      return r.result.value;
    };
    const shot = async (name) => {
      const s = await ws.send('Page.captureScreenshot', { format: 'png' });
      fs.writeFileSync(path.join(OUT, name), Buffer.from(s.data, 'base64'));
    };

    /* ---- 路由 ---- */
    console.log('\n=== 2. 各路由直接访问 ===');
    await setViewport(1440, 900);
    const routes = [
      { p: '/', title: 'Peter267 · 无限进步', h1: null },
      { p: '/achievements/', title: '奖项 · Peter267', h1: '成就' },
      { p: '/experience/', title: '经历 · Peter267', h1: '经历' },
      { p: '/projects/', title: '项目 · Peter267', h1: '项目' },
      { p: '/friends/', title: '友情链接 · Peter267', h1: '友情链接' },
      { p: '/contact/', title: '联系我 · Peter267', h1: '找到我' },
      { p: '/posts/', title: '文章 · Peter267', h1: '最近文章' },
    ];

    for (const r of routes) {
      await ws.send('Page.navigate', { url: BASE + r.p });
      // 等待文档就绪；本地 astro preview 首次请求需要即时编译，
      // 个别页面可能要几秒，所以这里轮询而不是固定 sleep。
      await new Promise((res) => setTimeout(res, 2000));
      // 启动页最长 7s 兜底 + 650ms 淡出，给它足够时间自行消失
      const bootGone = await ev(`(async () => {
        const dl = Date.now() + 12000;
        while (document.getElementById('boot') && Date.now() < dl) {
          await new Promise(r => setTimeout(r, 100));
        }
        return !document.getElementById('boot');
      })()`);
      const info = JSON.parse(await ev(`JSON.stringify({
        title: document.title,
        canonical: (document.querySelector('link[rel=canonical]')||{}).href||'',
        h1: (document.querySelector('h1')||{}).textContent||'',
        label: !!document.querySelector('.section-label svg'),
        active: (document.querySelector('.nav-link-active')||{}).textContent||''
      })`));
      check(`${r.p} title`, info.title === r.title, `实际 "${info.title}"`);
      check(`${r.p} canonical`, info.canonical.endsWith(r.p), info.canonical);
      check(`${r.p} 启动页已退出`, bootGone === true);
      if (r.p !== '/') {
        check(`${r.p} 字标 SVG`, info.label === true);
        check(`${r.p} h1`, info.h1 === r.h1, `实际 "${info.h1}"`);
      }
    }

    /* ---- 首页 ---- */
    console.log('\n=== 3. 首页 ===');
    await ws.send('Page.navigate', { url: BASE + '/' });
    await new Promise((res) => setTimeout(res, 3800));
    const home = JSON.parse(await ev(`JSON.stringify({
      canvas: document.querySelectorAll('.hero-shader canvas').length,
      canvasW: (document.querySelector('.hero-shader canvas')||{}).width||0,
      logo: !!document.querySelector('#hero-logo svg'),
      chips: document.querySelectorAll('.hero-chip').length,
      alive: (()=>{const c=document.querySelector('.hero-shader canvas'); if(!c) return false; const gl=c.getContext('webgl2'); return !!gl && !gl.isContextLost();})()
    })`));
    check('canvas 存在', home.canvas === 1);
    check('canvas 尺寸非零', home.canvasW > 0, `${home.canvasW}px`);
    check('WebGL 上下文有效', home.alive === true);
    check('站标 SVG', home.logo === true);
    check('胶囊 6 个', home.chips === 6, String(home.chips));
    await shot('01-home-dark.png');

    /* ---- 主题 ---- */
    console.log('\n=== 4. 主题 ===');
    await ev(`document.getElementById('theme-toggle').click()`);
    await new Promise((res) => setTimeout(res, 1300));
    const light = JSON.parse(await ev(`JSON.stringify({
      theme: document.documentElement.getAttribute('data-theme'),
      stored: localStorage.getItem('theme'),
      bg: getComputedStyle(document.body).backgroundColor
    })`));
    check('切到浅色', light.theme === 'light');
    check('主题持久化', light.stored === 'light');
    await shot('02-home-light.png');
    await ev(`document.getElementById('theme-toggle').click()`);
    await new Promise((res) => setTimeout(res, 900));
    check('切回深色', (await ev(`document.documentElement.getAttribute('data-theme')`)) === 'dark');

    /* ---- 客户端导航 ---- */
    console.log('\n=== 5. 客户端导航 ===');
    await ev(`window.__m0 = 'alive'; 'ok'`);
    for (const r of routes.filter((x) => x.p !== '/')) {
      const out = JSON.parse(await ev(`(async () => {
        const a = document.querySelector('a[href="${r.p}"]');
        if (!a) return JSON.stringify({err:'no link'});
        const t0 = performance.now();
        a.click();
        const dl = Date.now() + 8000;
        while (location.pathname !== '${r.p}' && Date.now() < dl) await new Promise(r => setTimeout(r, 30));
        await new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)));
        return JSON.stringify({
          ms: Math.round(performance.now() - t0),
          h1: (document.querySelector('h1')||{}).textContent||'',
          noReload: window.__m0 === 'alive',
          bootGone: !document.getElementById('boot')
        });
      })()`));
      check(`${r.p} 内容替换`, out.h1 === r.h1, `h1 "${out.h1}"`);
      check(`${r.p} 无整页重载`, out.noReload === true);
      check(`${r.p} 无启动页遮罩残留`, out.bootGone === true);
      console.log(`     切换 ${out.ms}ms`);
    }

    /* ---- 返回首页 ---- */
    console.log('\n=== 6. 返回首页 ===');
    const back = JSON.parse(await ev(`(async () => {
      document.querySelector('a[href="/"]').click();
      const dl = Date.now() + 8000;
      while (location.pathname !== '/' && Date.now() < dl) await new Promise(r => setTimeout(r, 30));
      await new Promise(r => setTimeout(r, 1800));
      const c = document.querySelector('.hero-shader canvas');
      const gl = c && c.getContext('webgl2');
      return JSON.stringify({
        canvas: document.querySelectorAll('.hero-shader canvas').length,
        alive: !!gl && !gl.isContextLost(),
        noReload: window.__m0 === 'alive',
        logo: !!document.querySelector('#hero-logo svg')
      });
    })()`));
    check('canvas 重建（未泄漏）', back.canvas === 1, `${back.canvas} 个`);
    check('上下文有效', back.alive === true);
    check('往返无整页重载', back.noReload === true);
    check('站标仍在', back.logo === true);

    /* ---- 移动端 ---- */
    console.log('\n=== 7. 移动端 390×844 ===');
    await setViewport(390, 844, true);
    await ws.send('Page.navigate', { url: BASE + '/' });
    await new Promise((res) => setTimeout(res, 4200));
    const mob = JSON.parse(await ev(`JSON.stringify({
      overflow: document.documentElement.scrollWidth > window.innerWidth + 1,
      sw: document.documentElement.scrollWidth,
      iw: window.innerWidth,
      canvas: document.querySelectorAll('.hero-shader canvas').length,
      burger: getComputedStyle(document.getElementById('menu-toggle')).display !== 'none'
    })`));
    check('无横向溢出', mob.overflow === false, `${mob.sw} vs ${mob.iw}`);
    check('canvas 正常', mob.canvas === 1);
    check('汉堡按钮可见', mob.burger === true);
    await shot('03-home-mobile.png');

    await ev(`document.getElementById('menu-toggle').click()`);
    await new Promise((res) => setTimeout(res, 900));
    const menu = JSON.parse(await ev(`JSON.stringify({
      open: document.getElementById('mobile-menu').classList.contains('is-open'),
      expanded: document.getElementById('menu-toggle').getAttribute('aria-expanded'),
      links: document.querySelectorAll('.mobile-nav-link').length
    })`));
    check('菜单可打开', menu.open === true);
    check('aria 同步', menu.expanded === 'true');
    check('菜单 6 项', menu.links === 6, String(menu.links));
    await shot('04-mobile-menu.png');
    await ev(`document.getElementById('menu-toggle').click()`);

    /* ---- 数轴 ---- */
    console.log('\n=== 8. 经历页数轴 ===');
    await setViewport(1440, 900);
    await ws.send('Page.navigate', { url: BASE + '/experience/' });
    await new Promise((res) => setTimeout(res, 3200));
    const axis = JSON.parse(await ev(`JSON.stringify({
      ticks: document.querySelectorAll('.axis-tick').length,
      grid: document.querySelectorAll('.axis-gridline').length,
      bars: document.querySelectorAll('.timeline-bar').length,
      open: document.querySelectorAll('.timeline-item-open').length,
      current: document.querySelectorAll('.timeline-item-current').length,
      widths: Array.from(document.querySelectorAll('.timeline-bar')).map(b => +b.style.getPropertyValue('--w').replace('%','')),
      lefts: Array.from(document.querySelectorAll('.timeline-bar')).map(b => +b.style.getPropertyValue('--l').replace('%',''))
    })`));
    check('5 个刻度', axis.ticks === 5, String(axis.ticks));
    check('网格线与刻度等数', axis.grid === axis.ticks);
    check('6 条横条', axis.bars === 6, String(axis.bars));
    check('1 条开口', axis.open === 1);
    check('1 条高亮', axis.current === 1);
    check('宽度均 > 0', axis.widths.every((w) => w > 0), axis.widths.map(w=>w.toFixed(1)).join(','));
    // 跨度 1 年(2022-2023) vs 1.3 年(2024.3-2025.6)：宽度应与跨度成正比
    const ratio = axis.widths[3] / axis.widths[0];
    check('宽度正比于跨度', Math.abs(ratio - 1.3) < 0.06, `实测 ${ratio.toFixed(3)}，期望≈1.30`);

    /* ---- 控制台 ---- */
    console.log('\n=== 9. 控制台 ===');
    const real = [...new Set(errors)].filter((e) => !/favicon|404/i.test(e));
    check('无 JS 错误', real.length === 0, real.slice(0, 3).join(' | '));

    /* ---- 其他页面截图 ---- */
    await setViewport(1440, 900);
    for (const [p, n] of [
      ['/achievements/', '05-achievements.png'],
      ['/experience/', '06-experience.png'],
      ['/projects/', '07-projects.png'],
      ['/friends/', '08-friends.png'],
      ['/contact/', '09-contact.png'],
      ['/posts/', '10-posts.png'],
    ]) {
      await ws.send('Page.navigate', { url: BASE + p });
      await new Promise((res) => setTimeout(res, 3200));
      await shot(n);
    }

    console.log('\n================ 汇总 ================');
    console.log(`  通过 ${pass} / 失败 ${fail}`);
    if (fail) failures.forEach((f) => console.log(`   ✗ ${f}`));
    console.log(`  截图: shots/astro/`);
  } finally {
    ws.close();
    close();
  }

  process.exit(fail === 0 ? 0 : 1);
})();
