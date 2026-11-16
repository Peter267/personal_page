/**
 * extract-shader.cjs — 从 apanzinc.top 线上 bundle 还原 PaperShaders 源码
 * ============================================================================
 * 目标站点把 GrainGradient 打包进 app.[hash].js，其中：
 *   · 顶点着色器  Jl = `#version 300 es ...`
 *   · 片段着色器  uu = `#version 300 es ...${模板变量}...`
 *   · 公共 chunk  iu / au / ou / su / cu 等以 `${名}` 形式拼接
 *   · lu = {maxColorCount: 7}
 *
 * 本脚本把模板变量**真正替换掉**，得到最终送进 WebGL 的 GLSL 原文，
 * 用于与本仓库 src/lib/shader.js 内嵌的版本逐字比对。
 *
 * 用法：node tools/extract-shader.cjs [bundlePath] [outDir]
 * ============================================================================
 */
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const BUNDLE = process.argv[2] || path.join(ROOT, '_research2', 'app.dec.js');
const OUT = process.argv[3] || path.join(ROOT, 'shots');

const src = fs.readFileSync(BUNDLE, 'utf8');

/** 取 `var NAME=` 后面那个模板字符串的内容（不做转义处理，源里已转义） */
function readTemplate(nameMarker, fromIndex = 0) {
  const at = src.indexOf(nameMarker, fromIndex);
  if (at < 0) return null;
  const tick = src.indexOf('`', at + nameMarker.length - 1);
  if (tick < 0) return null;
  // 找到配对的结束反引号（源中无反引号转义出现）
  const end = src.indexOf('`', tick + 1);
  return { body: src.slice(tick + 1, end), start: tick + 1, end };
}

// ---- 顶点着色器：Jl=`#version 300 es ----
const vert = readTemplate('Jl=`');
if (!vert) throw new Error('未找到顶点着色器 Jl');

// ---- 片段着色器：uu=`#version 300 es ----
const frag = readTemplate('uu=`');
if (!frag) throw new Error('未找到片段着色器 uu');

// ---- chunk 变量表：从片段着色器起点往前找定义 ----
const chunkNames = ['iu', 'au', 'ou', 'su', 'cu'];
const chunks = {};
for (const name of chunkNames) {
  // 变量名形如  ,XX=`  或  var XX=`  —— 取片段模板之前最近的一次
  const re = new RegExp('[,;{}\\s]' + name + '=`');
  let best = null;
  let idx = -1;
  while (true) {
    const hit = src.slice(idx + 1).search(re);
    if (hit < 0) break;
    const abs = idx + 1 + hit;
    if (abs > frag.start) break;
    best = abs;
    idx = abs;
  }
  if (best == null) continue;
  const tick = src.indexOf('`', best);
  const end = src.indexOf('`', tick + 1);
  chunks[name] = src.slice(tick + 1, end);
}

const maxColorCount = 7;

function resolve(tpl, isFrag) {
  let out = tpl;
  // ${lu.maxColorCount}
  out = out.replace(/\$\{lu\.maxColorCount\}/g, String(maxColorCount));
  // ${iu} 等 chunk
  out = out.replace(/\$\{(\w+)\}/g, (m, name) => {
    if (chunks[name] === undefined) {
      throw new Error(`未解析的模板变量: ${name}`);
    }
    return chunks[name];
  });
  // JS 模板里对反引号/美元符的转义在 GLSL 中不需要
  out = out.replace(/\\`/g, '`').replace(/\\\$/g, '$');
  return out;
}

const vertGlsl = resolve(vert.body);
const fragGlsl = resolve(frag.body, true);

fs.mkdirSync(OUT, { recursive: true });
fs.writeFileSync(path.join(OUT, 'target-vert.glsl'), vertGlsl);
fs.writeFileSync(path.join(OUT, 'target-frag.glsl'), fragGlsl);

console.log('chunks found:', Object.keys(chunks).join(', '));
console.log('vertex GLSL bytes:', vertGlsl.length);
console.log('fragment GLSL bytes:', fragGlsl.length);

/* ---- 与本仓库内嵌版本对比 ---- */
const oursPath = path.join(ROOT, 'src', 'lib', 'shader.js');
if (fs.existsSync(oursPath)) {
  const ours = fs.readFileSync(oursPath, 'utf8');
  const oursVert = /const VERT_SRC = `([\s\S]*?)`;/.exec(ours);
  const oursFrag = /const FRAG_SRC = `([\s\S]*?)`;/.exec(ours);

  /** 去掉所有空白后比较，只关心令牌序列（缩进不同不算差异） */
  const norm = (s) =>
    s
      .replace(/\s+/g, ' ')
      .replace(/\s*([{}();,:+\-*/=<>!&|?])\s*/g, '$1')
      .trim();

  function diffTokens(a, b, label) {
    const A = norm(a);
    const B = norm(b);
    if (A === B) {
      console.log(`${label}: 令牌序列完全一致`);
      return true;
    }
    // 找第一个不同的位置
    let i = 0;
    while (i < A.length && i < B.length && A[i] === B[i]) i++;
    const from = Math.max(0, i - 120);
    console.log(`${label}: 存在差异 @${i}`);
    console.log('  target: ...' + A.slice(from, i + 160));
    console.log('  ours  : ...' + B.slice(from, i + 160));
    return false;
  }

  if (oursVert) diffTokens(vertGlsl, oursVert[1], 'VERT');
  if (oursFrag) diffTokens(fragGlsl, oursFrag[1], 'FRAG');
}
