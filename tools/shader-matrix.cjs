/**
 * shader-matrix.cjs — 首屏纹理兼容性矩阵测试
 * ============================================================================
 * 目的：用**同一套**检测手段同时测量「本站」与「目标站 apanzinc.top」，
 *      找出"部分浏览器不显示"的真正差异点，而不是靠猜。
 *
 * 每个用例会采集：
 *   1. 是否有 .hero-shader canvas、其 drawingBuffer 尺寸
 *   2. 是否退化成 CSS 兜底（canvas 被隐藏 / host 被写入 background）
 *   3. WebGL2 着色器编译/链接日志（用 init script 劫持 compileShader）
 *   4. 浏览器真实上报的 FRAGMENT_SHADER/MEDIUM_FLOAT 精度
 *   5. 首屏像素统计（"有颜色"的像素占比、绿色均值）
 *   6. 两帧相隔 ~900ms 的截图是否不同（= 纹理是否真的在动）
 *
 * 可注入的环境扰动：
 *   LOWPREC  — 伪造"片段着色器 mediump 精度 < 23"的 GPU（不少移动端 GPU 如此）
 *   NOWEBGL  — 让 webgl2 上下文直接返回 null（老 Safari / 关硬件加速）
 *
 * 用法：
 *   node tools/shader-matrix.cjs                 # 本站（默认 http://localhost:4321/）
 *   node tools/shader-matrix.cjs https://apanzinc.top/
 *   MATRIX_URL=... node tools/shader-matrix.cjs
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
const URL_TARGET = process.argv[2] || process.env.MATRIX_URL || 'http://localhost:4321/';
const OUT_DIR = path.resolve(ROOT, 'shots', 'matrix');
const ONLY = process.env.MATRIX_ONLY || '';

const W = parseInt(process.env.MATRIX_W || '1440', 10);
const H = parseInt(process.env.MATRIX_H || '900', 10);
const DSF = parseFloat(process.env.MATRIX_DSF || '1');

/* ---------------------------------------------------------------------------
   最小 WebSocket 客户端（CDP 用）
   --------------------------------------------------------------------------- */
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
        const big = b.readBigUInt64BE(2);
        if (big > BigInt(64 * 1024 * 1024)) return void this.close();
        len = Number(big);
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
            // CDP 的响应体在 msg.result 里，错误在 msg.error 里
            if (msg.error) reject(new Error(JSON.stringify(msg.error)));
            else resolve(msg.result);
          } else if (msg && this.onEvent) {
            this.onEvent(msg);
          }
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

/* ---------------------------------------------------------------------------
   注入脚本
   --------------------------------------------------------------------------- */

/** 记录着色器编译/链接结果 + 真实精度（不改行为） */
const INSTRUMENT = `
(() => {
  const P = window.WebGL2RenderingContext && WebGL2RenderingContext.prototype;
  if (!P) return;
  window.__shaderLogs = [];
  window.__precQueries = [];
  // 记录页面**自己**查询到的精度（这是精度补丁的判据）
  const prec = P.getShaderPrecisionFormat;
  if (prec) {
    P.getShaderPrecisionFormat = function (st, pt) {
      const r = prec.call(this, st, pt);
      try {
        window.__precQueries.push({
          shader: st === 0x8B30 ? 'frag' : st === 0x8B31 ? 'vert' : String(st),
          precisionType:
            pt === 0x8df0 ? 'lowp-float' : pt === 0x8df1 ? 'mediump-float' : String(pt),
          precision: r && r.precision,
        });
      } catch (e) {}
      return r;
    };
  }
  const comp = P.compileShader;
  P.compileShader = function (sh) {
    comp.call(this, sh);
    try {
      const ok = this.getShaderParameter(sh, this.COMPILE_STATUS);
      const src = (this.getShaderSource(sh) || '');
      window.__shaderLogs.push({
        type: 'compile',
        ok: !!ok,
        log: (this.getShaderInfoLog(sh) || '').slice(0, 600),
        head: src.slice(0, 32).replace(/\\s+/g, ' '),
        bytes: src.length,
        // 编译时用的到底是什么精度 —— 这是判断补丁是否生效的关键
        declLowp: /precision\\s+lowp\\s+float/.test(src),
        declMedp: /precision\\s+mediump\\s+float/.test(src),
        highpUniforms: /uniform\\s+highp\\s+float/.test(src),
      });
    } catch (e) {
      window.__shaderLogs.push({ type: 'compile', ok: false, log: 'THROW ' + e.message });
    }
  };
  const link = P.linkProgram;
  P.linkProgram = function (p) {
    link.call(this, p);
    try {
      window.__shaderLogs.push({
        type: 'link',
        ok: !!this.getProgramParameter(p, this.LINK_STATUS),
        log: (this.getProgramInfoLog(p) || '').slice(0, 600),
      });
    } catch (e) {
      window.__shaderLogs.push({ type: 'link', ok: false, log: 'THROW ' + e.message });
    }
  };
})();
`;

/** 伪造低精度 GPU：把 FRAGMENT_SHADER 的 lowp/mediump 改为 8 / 16 bit。
 *  这是真实存在的一类移动 GPU（Mali-400、PowerVR SGX、部分 Adreno）。
 *  注意枚举值：0x8DF0 = LOW_FLOAT，0x8DF1 = MEDIUM_FLOAT，0x8DF2 = HIGH_FLOAT。 */
const LOWPREC = `
(() => {
  const P = window.WebGL2RenderingContext && WebGL2RenderingContext.prototype;
  if (!P || !P.getShaderPrecisionFormat) return;
  const orig = P.getShaderPrecisionFormat;
  P.getShaderPrecisionFormat = function (shaderType, precisionType) {
    if (shaderType === 0x8B30 && (precisionType === 0x8DF0 || precisionType === 0x8DF1)) {
      // 片段着色器的 lowp/mediump 都只有 8 bit
      window.__precSpoofed = true;
      return { precision: 8, rangeMin: 127, rangeMax: 127 };
    }
    return orig.call(this, shaderType, precisionType);
  };
})();
`;

/** 让 webgl2 直接不可用 */
const NOWEBGL = `
(() => {
  const orig = HTMLCanvasElement.prototype.getContext;
  HTMLCanvasElement.prototype.getContext = function (type, ...rest) {
    if (type === 'webgl2' || type === 'webgl' || type === 'experimental-webgl') return null;
    return orig.call(this, type, ...rest);
  };
  window.__noWebgl = true;
})();
`;

/* 下面三个是"上下文存在但用不了"的真实故障，比"完全不支持 WebGL2"更常见 */

/** webglcontextlost：移动端切后台、GPU 驱动重置、显存紧张 */
const CONTEXT_LOST = `
(() => {
  const P = window.WebGL2RenderingContext && WebGL2RenderingContext.prototype;
  if (!P) return;
  const orig = HTMLCanvasElement.prototype.getContext;
  HTMLCanvasElement.prototype.getContext = function (type, ...rest) {
    const gl = orig.call(this, type, ...rest);
    if (gl && !gl.__lostPatched) {
      gl.__lostPatched = true;
      setTimeout(() => {
        const ev = new Event('webglcontextlost', { cancelable: true });
        this.dispatchEvent(ev);
      }, 900);
    }
    return gl;
  };
})();
`;

/** 纹理贴图取不到（CDN/缓存/离线）—— 本站是**网络 PNG**，目标站是内嵌 base64 */
const NO_TEXTURE = `
(() => {
  const d = Object.getOwnPropertyDescriptor(HTMLImageElement.prototype, 'src');
  Object.defineProperty(HTMLImageElement.prototype, 'src', {
    get() { return d.get.call(this); },
    set(v) {
      if (/grain-noise/.test(String(v))) {
        // 模拟取图失败
        setTimeout(() => this.dispatchEvent(new Event('error')), 30);
        return;
      }
      return d.set.call(this, v);
    },
  });
})();
`;

/** 首帧时父容器尺寸为 0（字体/布局尚未完成）—— 画布会被定成 0 或 300x150 */
const ZERO_SIZE = `
(() => {
  const P = Element.prototype;
  const gbcr = P.getBoundingClientRect;
  let armed = true;
  P.getBoundingClientRect = function () {
    if (armed && this.id === 'hero-shader') {
      armed = false;
      return { x: 0, y: 0, top: 0, left: 0, right: 0, bottom: 0, width: 0, height: 0, toJSON(){return this;} };
    }
    return gbcr.call(this);
  };
})();
`;

/* ---------------------------------------------------------------------------
   页面内统计脚本（截图 → 用浏览器自己的解码器算像素）
   --------------------------------------------------------------------------- */
const PROBE_EXPR = `
(async () => {
  const host = document.querySelector('.hero-shader');
  const canvas = host ? host.querySelector('canvas') : null;
  const cs = canvas ? getComputedStyle(canvas) : null;
  const hs = host ? getComputedStyle(host) : null;
  return {
    hasHost: !!host,
    hasCanvas: !!canvas,
    canvasW: canvas ? canvas.width : 0,
    canvasH: canvas ? canvas.height : 0,
    canvasDisplay: cs ? cs.display : null,
    hostBgImage: hs ? hs.backgroundImage.slice(0, 90) : null,
    hostW: host ? Math.round(host.getBoundingClientRect().width) : 0,
    hostH: host ? Math.round(host.getBoundingClientRect().height) : 0,
    dpr: window.devicePixelRatio,
    logs: window.__shaderLogs || [],
    precQueries: window.__precQueries || [],
    hasCssFallback: host ? !!(host.style.background && host.style.background !== 'none') : false,
    reducedMotion: matchMedia('(prefers-reduced-motion: reduce)').matches,
  };
})()
`;

const STATS_EXPR = (b64a, b64b) => `
(async () => {
  async function load(src) {
    const img = new Image();
    img.src = src;
    await img.decode();
    const c = document.createElement('canvas');
    c.width = img.width; c.height = img.height;
    const ctx = c.getContext('2d', { willReadFrequently: true });
    ctx.drawImage(img, 0, 0);
    return { w: c.width, h: c.height, d: ctx.getImageData(0, 0, c.width, c.height).data };
  }
  const A = await load('data:image/png;base64,${b64a}');
  const B = await load('data:image/png;base64,${b64b}');
  let lit = 0, greenish = 0, sumG = 0, n = 0, maxG = 0;
  let changed = 0, cn = 0;
  // 只看首屏区域（跳过顶栏 60px，避免导航文字干扰）
  const y0 = Math.min(A.h, 60);
  for (let y = Math.floor(y0); y < A.h; y += 2) {
    for (let x = 0; x < A.w; x += 2) {
      const i = (y * A.w + x) * 4;
      const r = A.d[i], g = A.d[i + 1], b = A.d[i + 2];
      const v = Math.max(r, g, b);
      if (v > 22) lit++;
      if (g > r + 6 && g > b + 6 && g > 30) greenish++;
      sumG += g; if (g > maxG) maxG = g;
      n++;
      // 两帧差异（纹理动画 vs 静态）
      const j = i;
      const dd = Math.abs(A.d[j] - B.d[j]) + Math.abs(A.d[j + 1] - B.d[j + 1]) + Math.abs(A.d[j + 2] - B.d[j + 2]);
      if (dd > 12) changed++;
      cn++;
    }
  }
  return {
    w: A.w, h: A.h,
    litRatio: +(lit / n).toFixed(4),
    greenRatio: +(greenish / n).toFixed(4),
    meanG: +(sumG / n).toFixed(1),
    maxG,
    animRatio: +(changed / cn).toFixed(4),
  };
})()
`;

/* ---------------------------------------------------------------------------
   用例定义
   --------------------------------------------------------------------------- */
const CASES = [
  { name: 'baseline', inject: [INSTRUMENT] },
  { name: 'lowprec-gpu', inject: [INSTRUMENT, LOWPREC] },
  { name: 'no-webgl2', inject: [INSTRUMENT, NOWEBGL] },
  { name: 'context-lost', inject: [INSTRUMENT, CONTEXT_LOST] },
  { name: 'texture-404', inject: [INSTRUMENT, NO_TEXTURE] },
  { name: 'zero-size-first', inject: [INSTRUMENT, ZERO_SIZE] },
  { name: 'reduced-motion', inject: [INSTRUMENT], media: 'reduce' },
];

/* ---------------------------------------------------------------------------
   主流程
   --------------------------------------------------------------------------- */
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

async function runCase(port, wsUrlFactory, c) {
  const ws = new WS(await wsUrlFactory());
  await ws.connect();
  const errors = [];
  ws.onEvent = (msg) => {
    if (msg.method === 'Runtime.exceptionThrown') {
      const d = msg.params.exceptionDetails;
      errors.push((d.exception?.description || d.text || '').slice(0, 200));
    }
    if (msg.method === 'Runtime.consoleAPICalled' && msg.params.type === 'error') {
      errors.push(
        '[console] ' +
          (msg.params.args || [])
            .map((a) => a.value ?? a.description ?? '')
            .join(' ')
            .slice(0, 200)
      );
    }
  };
  /* 后台标签不会渲染，截图拿到的是旧帧。必须显式把标签拉到前台。 */
  await ws.send('Page.enable');
  await ws.send('Page.bringToFront');
  await ws.send('Runtime.enable');
  await ws.send('Emulation.setEmulatedMedia', {
    features: [
      {
        name: 'prefers-reduced-motion',
        value: c.media === 'reduce' ? 'reduce' : 'no-preference',
      },
      { name: 'prefers-color-scheme', value: 'dark' },
    ],
  });
  await ws.send('Emulation.setDeviceMetricsOverride', {
    width: W,
    height: H,
    deviceScaleFactor: DSF,
    mobile: false,
  });
  for (const src of c.inject) {
    await ws.send('Page.addScriptToEvaluateOnNewDocument', { source: src });
  }

  await ws.send('Page.navigate', { url: URL_TARGET });
  await new Promise((r) => setTimeout(r, 5000));
  // 导航后再次确保在前台（新建标签时 bringToFront 可能早于导航生效）
  await ws.send('Page.bringToFront').catch(() => {});
  await new Promise((r) => setTimeout(r, 300));

  const info = await ws.send('Runtime.evaluate', {
    expression: PROBE_EXPR,
    returnByValue: true,
    awaitPromise: true,
  });
  const meta = info?.result?.value || {};

  const s1 = await ws.send('Page.captureScreenshot', { format: 'png' });
  await new Promise((r) => setTimeout(r, 900));
  const s2 = await ws.send('Page.captureScreenshot', { format: 'png' });

  const animated = s1.data !== s2.data;

  const st = await ws.send('Runtime.evaluate', {
    expression: STATS_EXPR(s1.data, s2.data),
    returnByValue: true,
    awaitPromise: true,
  });
  if (st?.exceptionDetails) {
    console.log('   [stats error]', JSON.stringify(st.exceptionDetails).slice(0, 400));
  }

  fs.mkdirSync(OUT_DIR, { recursive: true });
  const safe = URL_TARGET.replace(/https?:\/\//, '').replace(/[^\w.-]/g, '_');
  fs.writeFileSync(path.join(OUT_DIR, `${safe}-${c.name}.png`), Buffer.from(s1.data, 'base64'));

  ws.close();
  return {
    case: c.name,
    canvas: `${meta.canvasW}x${meta.canvasH}`,
    canvasShown: meta.canvasDisplay,
    fallback: meta.hostBgImage && meta.hostBgImage !== 'none' ? 'CSS' : '-',
    animated,
    lit: st?.result?.value?.litRatio,
    green: st?.result?.value?.greenRatio,
    meanG: st?.result?.value?.meanG,
    anim: st?.result?.value?.animRatio,
    logs: (meta.logs || []).map((l) =>
      l.type === 'compile'
        ? `compile:${l.ok ? 'ok' : 'FAIL'} decl=${l.declLowp ? 'lowp' : l.declMedp ? 'mediump' : 'highp'}${
            l.highpUniforms ? '+highp-uniforms' : ''
          }${l.ok ? '' : ' ' + l.log}`
        : `link:${l.ok ? 'ok' : 'FAIL'}${l.ok ? '' : ' ' + l.log}`
    ),
    precQueries: (meta.precQueries || []).map((q) => `${q.shader}/${q.precisionType}=${q.precision}`),
    cssFallback: meta.hasCssFallback,
    dpr: meta.dpr,
    reducedMotion: meta.reducedMotion,
    errors: errors.slice(0, 4),
  };
}

/** 为一个用例启动独立浏览器实例（互不干扰，避免后台标签不渲染/共享 GPU 状态） */
async function withBrowser(fn) {
  const port = 9600 + Math.floor(Math.random() * 400);
  const userDir = fs.mkdtempSync(path.join(os.tmpdir(), 'matrix-'));
  const chrome = spawn(
    CHROME,
    [
      '--headless=new',
      `--remote-debugging-port=${port}`,
      `--user-data-dir=${userDir}`,
      `--window-size=${W},${H}`,
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

  try {
    const wsUrl = await waitForTarget(port);
    return await fn(async () => wsUrl);
  } finally {
    cleanup();
  }
}

(async () => {
  console.log(`\n目标: ${URL_TARGET}`);
  console.log(`视口: ${W}x${H} @${DSF}x\n`);

  const rows = [];
  for (const c of CASES) {
    if (ONLY && !c.name.includes(ONLY)) continue;
    try {
      // 每个用例一个全新浏览器：后台标签/共享 GPU 状态都会污染截图
      rows.push(await withBrowser((getUrl) => runCase(null, getUrl, c)));
    } catch (e) {
      rows.push({ case: c.name, error: e.message });
    }
  }

  for (const r of rows) {
    if (r.error) {
      console.log(`✗ ${r.case}: ${r.error}`);
      continue;
    }
    const verdict = r.cssFallback ? 'CSS兜底' : r.animated ? '动态纹理✓' : '静态/无纹理';
    console.log(`── ${r.case} → ${verdict}  (动画像素占比 anim=${r.anim})`);
    console.log(
      `   canvas=${r.canvas} shown=${r.canvasShown} dpr=${r.dpr} reducedMotion=${r.reducedMotion} lit=${r.lit} green=${r.green} meanG=${r.meanG}`
    );
    if (r.logs.length) console.log('   ' + r.logs.join('\n   '));
    else console.log('   (无着色器编译记录)');
    if (r.precQueries && r.precQueries.length) {
      console.log('   precision queries: ' + [...new Set(r.precQueries)].join(', '));
    }
    if (r.errors.length) console.log('   errors: ' + r.errors.join(' | '));
    console.log('');
  }

  fs.mkdirSync(OUT_DIR, { recursive: true });
  fs.writeFileSync(
    path.join(OUT_DIR, 'last-run.json'),
    JSON.stringify({ url: URL_TARGET, w: W, h: H, dsf: DSF, rows }, null, 2)
  );

  process.exit(0);
})().catch((e) => {
  console.error('失败:', e.message);
  process.exit(1);
});