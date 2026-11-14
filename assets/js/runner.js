/* ============================================================================
 * runner.js — 首屏「奔跑线框人形」WebGL 背景
 * ============================================================================
 * 逆向自 index.anheyu.com 的 #about-hero 场景（它是整站最抓眼的部分）：
 *
 *   1. 人形线框不是普通 wireframe，而是一份「线框网格」数据（runner.buf）：
 *      256 行 × 128 列的顶点栅格，每个顶点带 position / normal / color /
 *      skinWeight / skinIndex，按行首尾相连成 32512 条线段。
 *      它和 runner-skeleton.glb 共用同一套 Mixamo 骨骼，因此能用 GPU 蒙皮
 *      跟着 Run 动作一起变形 —— 这是它比"静态线框"高级的地方。
 *
 *   素材来源：线框网格与骨骼模型取自参考站 index.anheyu.com，
 *   仅用于个人站点演示；若要商用，请替换成自有授权素材。
 *
 *   2. LineSegments 本身没有蒙皮能力。原站的 trick 是把一个普通
 *      LineSegments 伪装成 SkinnedMesh：补上 skeleton / bindMatrix /
 *      updateMatrixWorld，three 就会在渲染时喂骨骼贴图，
 *      顶点着色器里走 skinning_* 三个 chunk 完成蒙皮。
 *
 *   3. 着色器里的"流光"：lineLength 是一段很短的高光带，
 *      用 mod(u_time + color.x, 1+lineLength) 让高光沿着每根线自己跑，
 *      再 smoothstep 出软边。颜色按法线朝向在冷色/暖色之间插值，
 *      所以正面偏热、背面偏冷，形体才立得住。
 *
 *   4. Bloom 是必需品。线本身只有 1px，不加泛光就是一坨灰线。
 *      这里用两级降采样 + 分离高斯（1/4 分辨率）做轻量 bloom，
 *      比 UnrealBloomPass 省很多，观感差距肉眼几乎看不出来。
 *
 * ---------------------------------------------------------------------------
 * 针对本站做的裁剪与改动
 * ---------------------------------------------------------------------------
 * - 配色改成站点的荧光绿主色（原站是蓝紫 + 品红），深浅主题各一套。
 * - 去掉原站 384 根霓虹柱、粒子发射器和镜面地板（它们是别的 section
 *   的装饰，且会显著增加 GPU 开销），只保留人形 + 流光 + 泛光。
 * - 相机固定取景（本站首屏是单屏，不需要跟滚动切换机位），
 *   只保留鼠标视差，人形会随着指针轻微转头。
 * - 性能预算：DPR 上限 1.5、bloom 分辨率 1/4、不可见时停渲染、
 *   卸载时主动 loseContext（本站是 SPA，路由切走必须释放上下文）。
 * ============================================================================ */

const ASSET = {
  three: new URL('../vendor/three.r112.min.js', import.meta.url).href,
  loader: new URL('../vendor/GLTFLoader.r112.js', import.meta.url).href,
  model: new URL('../models/runner-skeleton.glb', import.meta.url).href,
  buffer: new URL('../models/runner.buf', import.meta.url).href,
};

/* 线框数据布局（字节）：position int16×3 | normal int8×3 | color uint8×3
   | skinWeight int16×4 | skinIndex uint8×4 | 索引由代码生成 */
const BUF_LAYOUT = {
  posCount: 98304,
  nrmCount: 98304,
  colCount: 98304,
  wgtCount: 131072,
  idxCount: 131072,
  rows: 256,
  cols: 128,
};

const FOV = 45;

const PALETTE = {
  dark: {
    bg: 0x000000,
    deep: '#0a5b46',
    hot: '#c9ffe4',
    tintA: '#8affcb',
    tintB: '#00ff88',
    brightness: 1.0,
    bloom: 1.55,
    alpha: 1,
  },
  light: {
    bg: 0xf8f8f8,
    deep: '#0b6b4f',
    hot: '#0f9c6b',
    tintA: '#0e8a63',
    tintB: '#0a6b4f',
    brightness: 0.9,
    bloom: 0.12,
    // 浅色底上用半透明叠色，线越密越深，才有"铅笔素描"的层次，
    // 否则不透明线一根压一根，整个人形会糊成一块墨
    alpha: 0.42,
  },
};

/* 顶点着色器：three 的 skinning chunk 负责把线框跟着骨骼变形 */
const VERT_SRC = `
#include <skinning_pars_vertex>

varying vec3 v_color;
varying vec3 v_viewNormal;
varying vec3 v_worldPosition;

uniform float u_time;

void main() {
  #include <skinbase_vertex>
  #include <beginnormal_vertex>
  #include <skinnormal_vertex>
  #include <begin_vertex>
  #include <skinning_vertex>

  v_color = color;
  v_viewNormal = normalMatrix * objectNormal;
  v_worldPosition = (modelMatrix * vec4(transformed, 1.0)).xyz;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(transformed, 1.0);
}
`;

/* 片元着色器：沿线段奔跑的高光带 + 法线控色 */
const FRAG_SRC = `
precision highp float;

uniform float u_time;
uniform float u_emitRatio;
uniform float u_boost;
uniform float u_brightness;
uniform float u_alpha;
uniform vec3  u_deep;   // 背光色
uniform vec3  u_hot;    // 受光色
uniform vec3  u_tintA;  // 顶点色 z < 0.5 的染色
uniform vec3  u_tintB;  // 顶点色 z >= 0.5 的染色

varying vec3 v_color;
varying vec3 v_viewNormal;
varying vec3 v_worldPosition;

void main() {
  vec3 viewNormal = normalize(v_viewNormal);

  // 高光带长度：太长会糊成一片，0.2 刚好是一小段"电流"
  float lineLength = 0.2;
  float modTime = mod(u_time + v_color.x * (1.0 + lineLength), 1.0 + lineLength);

  // 法线朝向决定冷暖，b 是 0.04~1.29 的插值系数
  float b = 0.04 + max(0.0, dot(viewNormal, normalize(vec3(1.0, 1.0, 1.0)))) * 1.25;

  // 高光带：左边缘硬、右边缘软
  float t = smoothstep(v_color.y, v_color.y - lineLength, modTime - lineLength)
          * step(v_color.y - lineLength, modTime - lineLength);

  vec3 color = mix(u_deep, u_hot, b)
             * (0.65 + t * 3.0)
             * mix(u_tintA, u_tintB, step(0.5, v_color.z))
             * (0.75 + (0.025 + t) * u_emitRatio * 12.0);

  gl_FragColor = vec4(color * u_brightness * u_boost, u_alpha);
}
`;

/* bloom 用的全屏 quad 着色器 */
const QUAD_VERT = `
varying vec2 v_uv;
void main() {
  v_uv = uv;
  gl_Position = vec4(position.xy, 0.0, 1.0);
}
`;

const BLUR_FRAG = `
precision mediump float;
varying vec2 v_uv;
uniform sampler2D u_tex;
uniform vec2 u_dir;

void main() {
  vec4 sum = texture2D(u_tex, v_uv) * 0.2270270270;
  sum += texture2D(u_tex, v_uv + u_dir * 1.3846153846) * 0.3162162162;
  sum += texture2D(u_tex, v_uv - u_dir * 1.3846153846) * 0.3162162162;
  sum += texture2D(u_tex, v_uv + u_dir * 3.2307692308) * 0.0702702703;
  sum += texture2D(u_tex, v_uv - u_dir * 3.2307692308) * 0.0702702703;
  gl_FragColor = sum;
}
`;

const COMP_FRAG = `
precision mediump float;
varying vec2 v_uv;
uniform sampler2D u_base;
uniform sampler2D u_glow;
uniform float u_strength;

void main() {
  vec3 base = texture2D(u_base, v_uv).rgb;
  vec3 glow = texture2D(u_glow, v_uv).rgb;
  gl_FragColor = vec4(base + glow * u_strength, 1.0);
}
`;

/* ---------- 小工具 ---------- */

let threePromise = null;

/** 按顺序注入 vendor 脚本（three + GLTFLoader 都是 UMD，挂到 window.THREE） */
function loadVendor() {
  if (threePromise) return threePromise;

  const inject = (src) =>
    new Promise((resolve, reject) => {
      const s = document.createElement('script');
      s.src = src;
      s.async = false;
      s.onload = resolve;
      s.onerror = () => reject(new Error('脚本加载失败: ' + src));
      document.head.appendChild(s);
    });

  threePromise = inject(ASSET.three)
    .then(() => inject(ASSET.loader))
    .then(() => window.THREE);

  return threePromise;
}

/** 当前环境是否值得跑 3D（省流/弱网直接放弃，退回 CSS 渐变） */
export function canRun3D() {
  if (typeof window.WebGLRenderingContext === 'undefined') return false;

  const conn = navigator.connection;
  if (conn && (conn.saveData || /(^|-)2g$/.test(conn.effectiveType || ''))) {
    return false;
  }

  try {
    const c = document.createElement('canvas');
    return !!(c.getContext('webgl') || c.getContext('experimental-webgl'));
  } catch (e) {
    return false;
  }
}

/* ---------- 主体 ---------- */

/**
 * 在容器里创建 3D 背景。返回的控制器可以立即使用，
 * 资源在后台加载，onReady 后画布淡入。
 *
 * @param {HTMLElement} host    .hero-shader 容器
 * @param {object} opts
 * @param {'dark'|'light'} [opts.theme]
 * @param {() => void} [opts.onReady]
 */
export function createRunner(host, { theme = 'dark', onReady } = {}) {
  const canvas = document.createElement('canvas');
  canvas.className = 'runner-canvas';
  canvas.setAttribute('aria-hidden', 'true');
  host.appendChild(canvas);

  let disposed = false;
  let running = false;
  let rafId = 0;
  let THREE = null;
  let renderer = null;
  let scene = null;
  let camera = null;
  let mixer = null;
  let lines = null;
  let runAction = null;
  let oneShot = null;
  let loadedModel = null;
  let glowTargets = null;
  let quadScene = null;
  let quadCamera = null;
  let quadMesh = null;
  let blurMat = null;
  let compMat = null;

  let themeName = theme;
  let lastTime = 0;
  let elapsed = 0;
  let emit = 1;
  let emitCooldown = 2.4;

  // 鼠标视差：目标值 + 缓动值
  const pointer = { tx: 0, ty: 0, x: 0, y: 0 };
  const cameraBase = { x: 0, y: 0, z: 0 };
  const lookAt = { x: 0, y: 0.92, z: 0 };

  let renderScale = 1;

  /* ---------- 初始化 ---------- */

  async function boot() {
    THREE = await loadVendor();
    if (disposed) return;

    const [gltf, buffer] = await Promise.all([
      loadModel(),
      fetch(ASSET.buffer).then((r) => {
        if (!r.ok) throw new Error('线框数据加载失败');
        return r.arrayBuffer();
      }),
    ]);
    if (disposed) return;

    buildScene(gltf, buffer);
    bindEvents();
    resize();

    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (reduce) {
      drawFrame(0);
    } else {
      start();
    }

    canvas.classList.add('is-ready');
    if (onReady) onReady();
  }

  function loadModel() {
    return new Promise((resolve, reject) => {
      new THREE.GLTFLoader().load(ASSET.model, resolve, undefined, reject);
    });
  }

  /** runner.buf → BufferGeometry（含蒙皮属性） */
  function buildGeometry(buffer) {
    const L = BUF_LAYOUT;
    const geometry = new THREE.BufferGeometry();

    let offset = 0;

    // position：int16 定点数，范围 ±4
    const rawPos = new Int16Array(buffer, offset, L.posCount);
    offset += L.posCount * 2;
    const position = new Float32Array(L.posCount);
    for (let i = 0; i < rawPos.length; i++) position[i] = (4 * rawPos[i]) / 32768;

    // normal / color：int8 / uint8，直接交给 GPU 归一化
    const normal = new Int8Array(buffer, offset, L.nrmCount);
    offset += L.nrmCount;
    const color = new Uint8Array(buffer, offset, L.colCount);
    offset += L.colCount;

    // skinWeight：int16 定点数（4 个影响）
    const rawWeight = new Int16Array(buffer, offset, L.wgtCount);
    offset += L.wgtCount * 2;
    const weights = new Float32Array(L.wgtCount);
    for (let i = 0; i < rawWeight.length; i++) weights[i] = (4 * rawWeight[i]) / 32768;

    const skinIndex = new Uint8Array(buffer, offset, L.idxCount);

    geometry.setAttribute('position', new THREE.BufferAttribute(position, 3));
    geometry.setAttribute('normal', new THREE.BufferAttribute(normal, 3, true));
    geometry.setAttribute('color', new THREE.BufferAttribute(color, 3, true));
    geometry.setAttribute('skinWeight', new THREE.BufferAttribute(weights, 4));
    geometry.setAttribute('skinIndex', new THREE.BufferAttribute(skinIndex, 4));

    // 索引不是普通三角面，而是每行 128 个顶点首尾相连的线段
    const index = new Uint16Array((L.cols - 1) * L.rows * 2);
    let p = 0;
    for (let row = 0; row < L.rows; row++) {
      for (let col = 0; col < L.cols - 1; col++) {
        index[p++] = L.cols * row + col;
        index[p++] = L.cols * row + col + 1;
      }
    }
    geometry.setIndex(new THREE.BufferAttribute(index, 1));

    return geometry;
  }

  function makeLineMaterial({ boost = 1 } = {}) {
    const pal = PALETTE[themeName];
    return new THREE.ShaderMaterial({
      uniforms: {
        u_time: { value: 0 },
        u_emitRatio: { value: 0 },
        u_boost: { value: boost },
        u_brightness: { value: pal.brightness },
        u_alpha: { value: pal.alpha },
        u_deep: { value: new THREE.Color(pal.deep) },
        u_hot: { value: new THREE.Color(pal.hot) },
        u_tintA: { value: new THREE.Color(pal.tintA) },
        u_tintB: { value: new THREE.Color(pal.tintB) },
      },
      vertexShader: VERT_SRC,
      fragmentShader: FRAG_SRC,
      vertexColors: true,
      skinning: true,
      transparent: true,
      depthWrite: false,
      blending:
        themeName === 'light' ? THREE.NormalBlending : THREE.NoBlending,
    });
  }

  /** 把 LineSegments 伪装成 SkinnedMesh，让它跟着骨骼实时变形 */
  function fakeSkinned(object, skinned) {
    object.bindMatrix = skinned.bindMatrix;
    object.bindMatrixInverse = skinned.bindMatrixInverse;
    object.updateMatrixWorld = THREE.SkinnedMesh.prototype.updateMatrixWorld;
    object.isSkinnedMesh = true;
    object.skeleton = skinned.skeleton;
    object.frustumCulled = false;
    THREE.SkinnedMesh.prototype.normalizeSkinWeights.call(object);
  }

  function buildScene(gltf, buffer) {
    renderer = new THREE.WebGLRenderer({
      canvas,
      antialias: false,
      alpha: false,
      powerPreference: 'high-performance',
    });
    renderer.setClearColor(PALETTE[themeName].bg, 1);

    scene = new THREE.Scene();

    camera = new THREE.PerspectiveCamera(FOV, 1, 0.01, 100);

    // 原始骨骼是 Z-up（Mixamo 导出的坐标被摆成横躺），整体转 90° 立起来
    const root = new THREE.Group();
    root.rotation.x = Math.PI / 2;
    scene.add(root);

    loadedModel = gltf;
    const skinned = gltf.scene.getObjectByProperty('isSkinnedMesh', true);
    skinned.visible = false; // 只要骨骼，不要它自带的实体网格

    // 骨架必须进场景（哪怕不可见），AnimationMixer 才能驱动到 bone
    root.add(gltf.scene);

    const geometry = buildGeometry(buffer);
    lines = new THREE.LineSegments(geometry, makeLineMaterial());
    fakeSkinned(lines, skinned);
    root.add(lines);

    mixer = new THREE.AnimationMixer(gltf.scene);

    const clips = gltf.animations || [];
    const runClip =
      THREE.AnimationClip.findByName(clips, 'Run') || clips[0] || null;

    if (runClip) {
      runAction = mixer.clipAction(runClip);
      runAction.play();
    }

    // Jump / Slide 用来做点击彩蛋：播完自动回到 Run
    const jumpClip = THREE.AnimationClip.findByName(clips, 'Jump');
    if (jumpClip) {
      oneShot = mixer.clipAction(jumpClip);
      oneShot.setLoop(THREE.LoopOnce, 1);
      oneShot.clampWhenFinished = true;
      oneShot.weight = 0;
    }

    buildBloom();
    updateProjection();

    // 首帧时间随机化，避免所有人打开页面时高光带位置一模一样
    elapsed = Math.random() * 40;
    lines.material.uniforms.u_time.value = elapsed * 1.75;
  }

  function buildBloom() {
    const params = {
      minFilter: THREE.LinearFilter,
      magFilter: THREE.LinearFilter,
      format: THREE.RGBAFormat,
      depthBuffer: false,
      stencilBuffer: false,
    };

    glowTargets = {
      // 场景用全分辨率 + 深度缓冲：线框是"壳"，有深度才不会前后穿帮
      scene: new THREE.WebGLRenderTarget(2, 2, { ...params, depthBuffer: true }),
      a: new THREE.WebGLRenderTarget(2, 2, params),
      b: new THREE.WebGLRenderTarget(2, 2, params),
    };

    quadScene = new THREE.Scene();
    quadCamera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);

    blurMat = new THREE.ShaderMaterial({
      uniforms: { u_tex: { value: null }, u_dir: { value: new THREE.Vector2() } },
      vertexShader: QUAD_VERT,
      fragmentShader: BLUR_FRAG,
      depthTest: false,
      depthWrite: false,
    });

    const pal = PALETTE[themeName];
    compMat = new THREE.ShaderMaterial({
      uniforms: {
        u_base: { value: null },
        u_glow: { value: null },
        u_strength: { value: pal.bloom },
      },
      vertexShader: QUAD_VERT,
      fragmentShader: COMP_FRAG,
      depthTest: false,
      depthWrite: false,
    });

    quadMesh = new THREE.Mesh(new THREE.PlaneBufferGeometry(2, 2), blurMat);
    quadScene.add(quadMesh);
  }

  /* ---------- 尺寸 / 取景 ---------- */

  function updateProjection() {
    if (!camera) return;

    const width = host.clientWidth || 1;
    const height = host.clientHeight || 1;
    const aspect = width / height;

    camera.aspect = aspect;

    // 竖屏：机位拉远 + 视线上移，把人形收进上半屏，
    // 给底部堆叠的头像、简介、chips 留出干净的空间。
    const portrait = aspect < 0.95;
    cameraBase.z = portrait ? 4.6 : 2.8;
    cameraBase.x = portrait ? 0.08 : 0.34;
    cameraBase.y = portrait ? 0.95 : 1.12;
    lookAt.y = portrait ? 0.5 : 0.92;

    camera.updateProjectionMatrix();
  }

  function resize() {
    if (!renderer) return;

    const width = Math.max(1, host.clientWidth);
    const height = Math.max(1, host.clientHeight);
    const dpr = Math.min(window.devicePixelRatio || 1, 1.5);

    renderer.setPixelRatio(dpr);
    renderer.setSize(width, height, false);

    const bufferWidth = Math.max(2, Math.floor(width * dpr));
    const bufferHeight = Math.max(2, Math.floor(height * dpr));

    glowTargets.scene.setSize(bufferWidth, bufferHeight);

    const qw = Math.max(2, Math.floor(bufferWidth / 4));
    const qh = Math.max(2, Math.floor(bufferHeight / 4));
    glowTargets.a.setSize(qw, qh);
    glowTargets.b.setSize(qw, qh);

    updateProjection();
    if (!running) drawFrame(0);
  }

  /* ---------- 渲染 ---------- */

  function pass(material, target) {
    quadMesh.material = material;
    renderer.setRenderTarget(target);
    renderer.render(quadScene, quadCamera);
  }

  function drawFrame(dt) {
    if (!renderer || disposed) return;

    // 相机缓动跟随指针，幅度很小：是"呼吸感"而不是"跟屁虫"
    pointer.x += (pointer.tx - pointer.x) * Math.min(1, dt * 2.2);
    pointer.y += (pointer.ty - pointer.y) * Math.min(1, dt * 2.2);

    camera.position.set(
      cameraBase.x + pointer.x * 0.5,
      cameraBase.y + pointer.y * 0.32,
      cameraBase.z
    );
    camera.lookAt(lookAt.x, lookAt.y, lookAt.z);

    const uniforms = lines.material.uniforms;
    uniforms.u_time.value = elapsed * 1.75;
    uniforms.u_emitRatio.value = emit;

    renderer.setRenderTarget(glowTargets.scene);
    renderer.clear();
    renderer.render(scene, camera);

    // 1/4 分辨率做三次高斯：横 → 竖 → 横，第二次横轴加宽半径，光晕更蓬松
    const qw = glowTargets.a.width;
    const qh = glowTargets.a.height;

    blurMat.uniforms.u_tex.value = glowTargets.scene.texture;
    blurMat.uniforms.u_dir.value.set(1 / qw, 0);
    pass(blurMat, glowTargets.a);

    blurMat.uniforms.u_tex.value = glowTargets.a.texture;
    blurMat.uniforms.u_dir.value.set(0, 1 / qh);
    pass(blurMat, glowTargets.b);

    blurMat.uniforms.u_tex.value = glowTargets.b.texture;
    blurMat.uniforms.u_dir.value.set(2 / qw, 0);
    pass(blurMat, glowTargets.a);

    compMat.uniforms.u_base.value = glowTargets.scene.texture;
    compMat.uniforms.u_glow.value = glowTargets.a.texture;
    pass(compMat, null);
  }

  function tick(now) {
    if (!running) return;
    rafId = requestAnimationFrame(tick);

    const dt = Math.min(0.05, (now - lastTime) / 1000 || 0.016);
    lastTime = now;
    elapsed += dt;

    if (mixer) mixer.update(dt);

    // 每隔几秒来一次"电流涌动"，让形体不是匀速闪烁
    emit = Math.max(0, emit - dt * 1.1);
    emitCooldown -= dt;
    if (emitCooldown <= 0) {
      emit = 1;
      emitCooldown = 2.6 + Math.random() * 2.2;
    }

    drawFrame(dt);
  }

  function start() {
    if (running || disposed) return;
    running = true;
    lastTime = performance.now();
    rafId = requestAnimationFrame(tick);
  }

  function stop() {
    running = false;
    if (rafId) cancelAnimationFrame(rafId);
    rafId = 0;
  }

  /* ---------- 事件 ---------- */

  function onPointerMove(e) {
    const rect = host.getBoundingClientRect();
    if (!rect.width || !rect.height) return;
    pointer.tx = ((e.clientX - rect.left) / rect.width - 0.5) * 2;
    pointer.ty = ((e.clientY - rect.top) / rect.height - 0.5) * 2;
  }

  function onPointerLeave() {
    pointer.tx = 0;
    pointer.ty = 0;
  }

  function onVisibility() {
    if (document.hidden) stop();
    else start();
  }

  /** 点击空白处让人形跳一下（参考站的彩蛋） */
  function onHostClick(e) {
    if (!oneShot || !runAction) return;
    if (e.target.closest('a, button')) return;
    if (oneShot.isRunning()) return;

    oneShot.reset();
    oneShot.setEffectiveWeight(1);
    oneShot.play();
    runAction.crossFadeTo(oneShot, 0.18, false);
  }

  function onOneShotFinished(e) {
    if (!runAction || e.action !== oneShot) return;
    runAction.reset();
    runAction.setEffectiveWeight(1);
    runAction.fadeIn(0.22);
    runAction.play();
    oneShot.fadeOut(0.22);
  }

  let resizeObserver = null;

  function bindEvents() {
    window.addEventListener('pointermove', onPointerMove, { passive: true });
    document.addEventListener('pointerleave', onPointerLeave, { passive: true });
    document.addEventListener('visibilitychange', onVisibility);

    // 点击彩蛋挂在 hero 容器上，避免和链接抢事件
    host.parentElement?.addEventListener('click', onHostClick);
    mixer?.addEventListener('finished', onOneShotFinished);

    if ('ResizeObserver' in window) {
      resizeObserver = new ResizeObserver(() => resize());
      resizeObserver.observe(host);
    } else {
      window.addEventListener('resize', resize, { passive: true });
    }
  }

  function unbindEvents() {
    window.removeEventListener('pointermove', onPointerMove);
    document.removeEventListener('pointerleave', onPointerLeave);
    document.removeEventListener('visibilitychange', onVisibility);
    host.parentElement?.removeEventListener('click', onHostClick);
    mixer?.removeEventListener('finished', onOneShotFinished);

    if (resizeObserver) resizeObserver.disconnect();
    else window.removeEventListener('resize', resize);
  }

  /* ---------- 对外 API ---------- */

  const ready = boot().catch((err) => {
    // 加载/初始化失败就静默退场，原来的渐变背景还在，不影响首屏
    console.warn('[runner] 3D 背景加载失败，已回退渐变背景：', err);
    destroy();
    throw err;
  });

  function destroy() {
    if (disposed) return;
    disposed = true;

    stop();
    unbindEvents();

    if (mixer) {
      mixer.stopAllAction();
      mixer = null;
    }

    if (lines) {
      lines.geometry.dispose();
      lines.material.dispose();
      lines = null;
    }

    // glb 自带的实体网格虽然不可见，几何体仍然占显存，一起释放
    if (loadedModel) {
      loadedModel.scene.traverse((obj) => {
        if (obj.geometry) obj.geometry.dispose();
        if (obj.material) obj.material.dispose();
      });
      loadedModel = null;
    }

    if (glowTargets) {
      glowTargets.scene.dispose();
      glowTargets.a.dispose();
      glowTargets.b.dispose();
      glowTargets = null;
    }

    if (quadMesh) {
      quadMesh.geometry.dispose();
      quadMesh = null;
    }
    if (blurMat) blurMat.dispose();
    if (compMat) compMat.dispose();

    if (renderer) {
      renderer.dispose();
      // 释放上下文：SPA 来回切路由时，不释放会撞上浏览器的上下文数量上限
      const lose = renderer.getContext().getExtension('WEBGL_lose_context');
      if (lose) lose.loseContext();
      renderer = null;
    }

    canvas.remove();
  }

  return {
    ready,
    destroy,

    /** 深浅主题切换：换配色、清屏色、泛光强度 */
    setTheme(next) {
      themeName = next === 'light' ? 'light' : 'dark';
      const pal = PALETTE[themeName];

      if (renderer) renderer.setClearColor(pal.bg, 1);
      if (lines) {
        const u = lines.material.uniforms;
        u.u_deep.value.set(pal.deep);
        u.u_hot.value.set(pal.hot);
        u.u_tintA.value.set(pal.tintA);
        u.u_tintB.value.set(pal.tintB);
        u.u_brightness.value = pal.brightness;
        u.u_alpha.value = pal.alpha;
        lines.material.blending =
          themeName === 'light' ? THREE.NormalBlending : THREE.NoBlending;
      }
      if (compMat) compMat.uniforms.u_strength.value = pal.bloom;

      if (!running) drawFrame(0);
    },

    pause: stop,
    resume: start,
    resize,
  };
}
