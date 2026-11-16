/**
 * shader-nav.cjs — 首屏纹理的"生命周期"验证
 * ============================================================================
 * 覆盖 shader-matrix 覆盖不到的三件事：
 *   1. 客户端换页（首页 → 项目页 → 首页）后纹理是否重新建起来并继续动
 *   2. 浅色主题下是否正常（同一套颜色，页面底色不同）
 *   3. 移动端视口下画布尺寸是否正确（DPR 2/3 的夹紧公式）
 *
 * 用法：node tools/shader-nav.cjs [baseUrl]
 * ============================================================================
 */
const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');
const http = require('http');
const os = require('os');
const crypto = require('crypto');

const ROOT = path.resolve(__dirname, '..');
const CHROME = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const BASE = process.argv[2] || 'http://localhost:4400';
const OUT_DIR = path.resolve(ROOT, 'shots', 'matrix');

class WS {
  constructor(url) {
    this.u = new URL(url);
    this.id = 0;
    this.cbs = new Map();
    this.buf = Buffer.alloc(0);
    this.onEvent = null;
  }
  connect() {
    return new Promise((resolve, reject) => {
      const req = http.request({
        host: this.u.hostname,
        port: this.u.port,
        path: this.u.pathname + this.u.search,
        headers: {
          Connection: 'Upgrade',
          Upgrade: 'websocket',
          'Sec-WebSocket-Key': crypto.randomBytes(16).toString('base64'),
          'Sec-WebSocket-Version': '13',
        },
      });
      req.on('upgrade', (res, socket) => {
        this.sock = socket;
        socket.on('data', (d) => this._recv(d));
        socket.on('error', reject);
        resolve();
      });
      req.on('error', reject);
      req.end();
    });
  }
  _recv(chunk) {
    this.buf = Buffer.concat([this.buf, chunk]);
    for (;;) {
      const b = this.buf;
      if (b.length < 2) return;
      const fin = (b[0] & 0x80) !== 0;
      const op = b[0] & 0x0f;
      let len = b[1] & 0x7f;
      let off = 2;
      if (len === 126) {
        if (b.length < 4) return;
        len = b.readUInt16BE(2);
        off = 4;
      } else if (len === 127) {
        if (b.length < 10) return;
        len = Number(b.readBigUInt64BE(2));
        off = 10;
      }
      if (b.length < off + len) return;
      const payload = b.slice(off, off + len);
      this.buf = b.slice(off + len);
      if (op === 0x1) {
        if (!this._frag) this._frag = '';
        this._frag += payload.toString('utf8');
        if (fin) {
          const txt = this._frag;
          this._frag = '';
          let msg = null;
          try {
            msg = JSON.parse(txt);
          } catch {}
          if (msg && msg.id && this.cbs.has(msg.id)) {
            const { resolve, reject } = this.cbs.get(msg.id);
            this.cbs.delete(msg.id);
            if (msg.error) reject(new Error(JSON.stringify(msg.error)));
            else resolve(msg.result);
          } else if (msg && this.onEvent) this.onEvent(msg);
        }
      } else if (op === 0x8) {
        this.close();
        return;
      } else if (op === 0x9) {
        this._sendFrame(0xa, payload);
      }
    }
  }
  _sendFrame(opcode, payload) {
    const len = payload.length;
    let header;
    if (len < 126) {
      header = Buffer.alloc(2);
      header[1] = 0x80 | len;
    } else if (len < 65536) {
      header = Buffer.alloc(4);
      header[1] = 0x80 | 126;
      header.writeUInt16BE(len, 2);
    } else {
      header = Buffer.alloc(10);
      header[1] = 0x80 | 127;
      header.writeBigUInt64BE(BigInt(len), 2);
    }
    header[0] = 0x80 | opcode;
    const mask = crypto.randomBytes(4);
    const masked = Buffer.allocUnsafe(len);
    for (let i = 0; i < len; i++) masked[i] = payload[i] ^ mask[i % 4];
    this.sock.write(Buffer.concat([header, mask, masked]));
  }
  send(method, params = {}) {
    const id = ++this.id;
    return new Promise((resolve, reject) => {
      this.cbs.set(id, { resolve, reject });
      this._sendFrame(0x1, Buffer.from(JSON.stringify({ id, method, params })));
      setTimeout(() => {
        if (this.cbs.has(id)) {
          this.cbs.delete(id);
          reject(new Error('CDP 超时: ' + method));
        }
      }, 60000);
    });
  }
  close() {
    try {
      this.sock.destroy();
    } catch {}
  }
}

function waitForTarget(port, timeout = 25000) {
  const start = Date.now();
  return new Promise((resolve, reject) => {
    const tick = () => {
      const req = http.get(
        { host: '127.0.0.1', port, path: '/json/list', timeout: 1200 },
        (res) => {
          let d = '';
          res.on('data', (c) => (d += c));
          res.on('end', () => {
            try {
              const list = JSON.parse(d);
              const page = list.find((t) => t.type === 'page');
              if (page?.webSocketDebuggerUrl) return resolve(page.webSocketDebuggerUrl);
            } catch {}
            retry();
          });
        }
      );
      req.on('error', retry);
      req.on('timeout', () => {
        req.destroy();
        retry();
      });
      function retry() {
        if (Date.now() - start > timeout) return reject(new Error('CDP 就绪超时'));
        setTimeout(tick, 200);
      }
    };
    tick();
  });
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const STATE = `JSON.stringify({
  url: location.pathname,
  canvas: (() => { const c = document.querySelector('.hero-shader canvas'); return c ? c.width + 'x' + c.height : 'none'; })(),
  theme: document.documentElement.getAttribute('data-theme'),
  boot: !!document.getElementById('boot'),
  fallback: (() => { const h = document.getElementById('hero-shader'); return h ? (h.style.background || '') !== '' : false; })(),
})`;

async function shot(ws, name) {
  const s = await ws.send('Page.captureScreenshot', { format: 'png' });
  fs.mkdirSync(OUT_DIR, { recursive: true });
  fs.writeFileSync(path.join(OUT_DIR, name), Buffer.from(s.data, 'base64'));
  return s.data;
}

async function main() {
  const port = 9900 + Math.floor(Math.random() * 90);
  const userDir = fs.mkdtempSync(path.join(os.tmpdir(), 'nav-'));
  const chrome = spawn(
    CHROME,
    [
      '--headless=new',
      `--remote-debugging-port=${port}`,
      `--user-data-dir=${userDir}`,
      '--hide-scrollbars',
      '--no-first-run',
      '--no-default-browser-check',
      '--use-gl=angle',
      '--use-angle=swiftshader',
      '--enable-unsafe-swiftshader',
      '--disable-gpu-sandbox',
      'about:blank',
    ],
    { stdio: 'ignore' }
  );
  const cleanup = () => {
    try {
      chrome.kill();
    } catch {}
    setTimeout(() => {
      try {
        fs.rmSync(userDir, { recursive: true, force: true });
      } catch {}
    }, 300);
  };

  const results = {};
  try {
    const ws = new WS(await waitForTarget(port));
    await ws.connect();
    const errors = [];
    ws.onEvent = (m) => {
      if (m.method === 'Runtime.exceptionThrown') {
        errors.push((m.params.exceptionDetails.exception?.description || '').slice(0, 160));
      }
      if (m.method === 'Runtime.consoleAPICalled' && m.params.type === 'error') {
        errors.push(
          '[console] ' +
            (m.params.args || []).map((a) => a.value ?? a.description ?? '').join(' ').slice(0, 160)
        );
      }
    };
    await ws.send('Page.enable');
    await ws.send('Page.bringToFront');
    await ws.send('Runtime.enable');
    await ws.send('Emulation.setEmulatedMedia', {
      features: [
        { name: 'prefers-reduced-motion', value: 'no-preference' },
        { name: 'prefers-color-scheme', value: 'dark' },
      ],
    });
    await ws.send('Emulation.setDeviceMetricsOverride', {
      width: 1440,
      height: 900,
      deviceScaleFactor: 1,
      mobile: false,
    });

    // ---- 1. 首屏 ----
    await ws.send('Page.navigate', { url: BASE + '/' });
    await sleep(4200);
    await ws.send('Page.bringToFront').catch(() => {});
    const home1 = JSON.parse((await ws.send('Runtime.evaluate', { expression: STATE, returnByValue: true })).result.value);
    const a1 = await shot(ws, 'nav-1-home-a.png');
    await sleep(900);
    const a2 = await shot(ws, 'nav-1-home-b.png');
    results.home = { ...home1, animated: a1 !== a2 };

    // ---- 2. 客户端换页到项目页（ClientRouter）----
    await ws.send('Runtime.evaluate', {
      expression: `document.querySelector('a[href="/projects/"]')?.click(); 'ok'`,
      returnByValue: true,
    });
    await sleep(2600);
    results.projects = JSON.parse((await ws.send('Runtime.evaluate', { expression: STATE, returnByValue: true })).result.value);

    // ---- 3. 返回首页：纹理必须重建且继续动 ----
    await ws.send('Runtime.evaluate', {
      expression: `document.querySelector('a[href="/"]')?.click(); 'ok'`,
      returnByValue: true,
    });
    await sleep(3200);
    const back1 = JSON.parse((await ws.send('Runtime.evaluate', { expression: STATE, returnByValue: true })).result.value);
    const b1 = await shot(ws, 'nav-3-back-a.png');
    await sleep(900);
    const b2 = await shot(ws, 'nav-3-back-b.png');
    results.backHome = { ...back1, animated: b1 !== b2 };

    // ---- 4. 浅色主题 ----
    await ws.send('Runtime.evaluate', {
      expression: `document.getElementById('theme-toggle')?.click(); 'ok'`,
      returnByValue: true,
    });
    await sleep(1800);
    const light = JSON.parse((await ws.send('Runtime.evaluate', { expression: STATE, returnByValue: true })).result.value);
    const l1 = await shot(ws, 'nav-4-light-a.png');
    await sleep(900);
    const l2 = await shot(ws, 'nav-4-light-b.png');
    results.light = { ...light, animated: l1 !== l2 };

    // ---- 5. 移动端视口（DPR 3，验证夹紧公式与尺寸）----
    await ws.send('Emulation.setDeviceMetricsOverride', {
      width: 390,
      height: 844,
      deviceScaleFactor: 3,
      mobile: true,
    });
    await sleep(2000);
    const mobile = JSON.parse((await ws.send('Runtime.evaluate', { expression: STATE, returnByValue: true })).result.value);
    const m1 = await shot(ws, 'nav-5-mobile-a.png');
    await sleep(900);
    const m2 = await shot(ws, 'nav-5-mobile-b.png');
    results.mobile = { ...mobile, animated: m1 !== m2 };

    results.errors = errors.slice(0, 6);
  } catch (e) {
    console.error('失败:', e.message);
  } finally {
    cleanup();
    console.log(JSON.stringify(results, null, 2));
    process.exit(0);
  }
}

main();
