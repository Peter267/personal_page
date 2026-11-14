/**
 * shader.js — WebGL 背景（颗粒渐变 + 鼠标散射光晕）
 * ============================================================================
 * 这是全站视觉的重心，融合了两套参考实现：
 *
 *   ① 颗粒渐变（来自 apanzinc.top 的 @paper-design GrainGradient 思路）
 *      用域扭曲（domain warping）生成有机的柔和色块，
 *      再叠一层逐帧变化的胶片颗粒消除色带。
 *
 *   ② 鼠标散射光晕（来自 index.anheyu.com 的 getScatter）
 *      沿"像素→相机"射线对点光源做 1/r² 的**解析积分**，
 *      得到物理正确的雾气散射，而不是简单的径向渐变。
 *
 * 为什么两者能融合得很好：
 *   前者提供"底噪氛围"（低频、缓慢、全屏），
 *   后者提供"交互焦点"（高频、跟随鼠标、局部）。
 *   两者叠加正好覆盖了"静态好看"与"动态有回应"两个需求。
 *
 * ---------------------------------------------------------------------------
 * 实现要点与踩坑记录
 * ---------------------------------------------------------------------------
 * 1. 用 WebGL1（不是 WebGL2）
 *    兼容性更好，且本项目不需要 WebGL2 特性。代价是不能用 in/out、
 *    不能用动态数组索引 uniform，所以全部写死常量。
 *
 * 2. 帧率无关
 *    所有随时间推进的量都乘 deltaTime（秒）。若按"每帧加一点"写，
 *    120Hz 屏上动画会快一倍。
 *
 * 3. 分辨率上限
 *    像素总量限制在 1920*1080*4 以内。4K 屏上按比例降低内部分辨率，
 *    靠 CSS 拉伸回全屏。这个 shader 的颗粒本身就有"低分辨率"美感，
 *    降采样几乎看不出差别，但 GPU 压力降到 1/4。
 *
 * 4. 页面不可见时暂停
 *    切到别的标签页还在跑 rAF 会持续耗电。监听 visibilitychange 停掉，
 *    恢复时重置时间基准（否则会因 dt 过大导致时间跳变）。
 *
 * 5. 高斯噪声 vs 白噪声
 *    颗粒用 hash 白噪声而非 smooth noise：白噪声的"沙砾感"更接近胶片，
 *    平滑噪声看起来像雾。但白噪声必须逐帧变化，静止的颗粒会像脏屏幕。
 * ============================================================================
 */

/* ============================================================================
   顶点着色器
   ----------------------------------------------------------------------------
   全屏三角形：只画 2 个三角形覆盖整个视口，不需要任何顶点缓冲。
   用 gl_VertexID 在 WebGL2 才可用，WebGL1 下只能传一个 attribute
   或者直接用一个覆盖 [-1,1] 的四边形。这里用后者：6 个顶点 2 个三角形。
   ============================================================================ */

const VERT_SRC = `
attribute vec2 a_position;
// 传给片元的屏幕 UV，范围 [0,1]
varying vec2 v_uv;

void main() {
  v_uv = a_position * 0.5 + 0.5;
  gl_Position = vec4(a_position, 0.0, 1.0);
}
`;

/* ============================================================================
   片元着色器
   ----------------------------------------------------------------------------
   分三段组装：噪声工具 → 散射函数 → main
   ============================================================================ */

const FRAG_SRC = `
precision highp float;

varying vec2 v_uv;

uniform vec2  u_resolution;     // 画布分辨率（像素）
uniform float u_time;           // 累计时间（秒）
uniform float u_dt;             // 本帧时长（秒），用于颗粒抖动
uniform vec3  u_accent;         // 主色（线性 0~1）
uniform int   u_theme;          // 0 = 深色, 1 = 浅色
uniform float u_grain;          // 颗粒强度
uniform float u_softness;       // 色块柔和度
uniform float u_intensity;      // 色块强度
uniform vec2  u_mouse;          // 鼠标位置（归一化 [0,1]）
uniform float u_mouseActive;    // 鼠标光晕强度 0~1
uniform float u_scatterDivider; // 散射光圈大小（越大越小）
uniform float u_scatterPowInv;  // 散射软硬（越小越硬）

/* ---------------------------------------------------------------------------
   噪声工具
   --------------------------------------------------------------------------- */

/**
 * 2D hash 白噪声。
 * 用 fract(sin(dot())) 这个经典技巧：不是密码学安全，但足够便宜且分布均匀。
 * 常数 43758.5453123 是常用的"无理数乘子"，能让 fract 的输出看起来随机。
 */
float hash12(vec2 p) {
  vec3 p3 = fract(vec3(p.xyx) * 0.1031);
  p3 += dot(p3, p3.yzx + 33.33);
  return fract((p3.x + p3.y) * p3.z);
}

/**
 * 值噪声（value noise）：在格点上取随机值，格内做双三次插值。
 * 比纯白噪声平滑，用于生成低频的色块起伏。
 */
float valueNoise(vec2 p) {
  vec2 i = floor(p);
  vec2 f = fract(p);
  // 五次平滑插值（smootherstep），比 smoothstep 更平缓，
  // 可避免格点处出现可见的方块边界
  vec2 u = f * f * f * (f * (f * 6.0 - 15.0) + 10.0);

  float a = hash12(i + vec2(0.0, 0.0));
  float b = hash12(i + vec2(1.0, 0.0));
  float c = hash12(i + vec2(0.0, 1.0));
  float d = hash12(i + vec2(1.0, 1.0));

  return mix(mix(a, b, u.x), mix(c, d, u.x), u.y);
}

/**
 * 分形布朗运动（fBm）：把多个频率的噪声叠加，得到"自相似"的起伏。
 * 4 个 octave 是质量/性能的平衡点，再多肉眼几乎看不出。
 */
float fbm(vec2 p) {
  float sum = 0.0;
  float amp = 0.5;
  float freq = 1.0;
  for (int i = 0; i < 4; i++) {
    sum += amp * valueNoise(p * freq);
    freq *= 2.03;   // 用非整数倍率，避免各层对齐产生摩尔纹
    amp *= 0.5;
  }
  return sum;
}

/* ---------------------------------------------------------------------------
   解析散射（来自 anheyu 的 getScatter）
   ---------------------------------------------------------------------------

   问题：给定相机位置、视线方向、点光源位置，求这条视线上
        "散射光总量" —— 即沿射线对 1/r² 做积分。

   推导：
     设射线上一点为 start + dir * t (t ∈ [0, d])
     到光源的距离平方为 |start + dir*t - lightPos|²
     展开成 t 的二次式：t² + 2bt + c
       其中 b = dot(dir, q), c = dot(q, q), q = start - lightPos
     积分 ∫ dt / (t² + 2bt + c) = (1/s) * atan((t + b) / s)
       其中 s = 1/sqrt(c - b²)

   结果就是下面这一行：s * (atan((d+b)*s) - atan(b*s))

   为什么值得这么做（而不是用径向渐变）：
     - 光是"穿过空间"的，有正确的远近衰减和角度关系
     - 光晕可以自然地被 3D 物体遮挡（如果有深度信息）
     - 参数 divider/powInv 可以独立控制"大小"和"软硬"，
       而径向渐变只有一个半径参数
   --------------------------------------------------------------------------- */
float getScatter(vec3 start, vec3 dir, vec3 lightPos, float d) {
  vec3 q = start - lightPos;

  float b = dot(dir, q);
  float c = dot(q, q);

  // s = 1/sqrt(c - b²)：discriminant 保护，避免除零
  float s = 1.0 / sqrt(max(0.0001, c - b * b));

  float l = s * (atan((d + b) * s) - atan(b * s));

  // 归一化 + 软硬调节：
  //   divider 越大 → 整体越暗越小
  //   powInv 越小 → 曲线越陡 → 光晕边缘越硬
  return pow(max(0.0, l / u_scatterDivider), u_scatterPowInv);
}

/* ---------------------------------------------------------------------------
   主函数
   --------------------------------------------------------------------------- */
void main() {
  // 用较短边做归一化，避免超宽屏上图案被横向拉伸
  float aspect = u_resolution.x / u_resolution.y;
  vec2 uv = v_uv;
  // 居中且保持长宽比的坐标
  vec2 p = (uv - 0.5) * vec2(aspect, 1.0);

  /* ---------- 第一层：域扭曲生成有机色块 ---------- */

  // 时间用一个很慢的速率推进（周期约 30 秒），
  // 太快会显得躁动，太慢又看不出在动
  float t = u_time * 0.035;

  // 第一次扭曲：用噪声偏移采样坐标本身
  vec2 warp1 = vec2(
    fbm(p * 1.6 + vec2(t, 0.0)),
    fbm(p * 1.6 + vec2(5.2, t * 0.7))
  );

  // 第二次扭曲：用上一步的结果再偏移一次。
  // 双重域扭曲（double domain warping）是产生"大理石纹路/流体"观感的关键，
  // 单次扭曲只会得到模糊的云雾。
  vec2 warp2 = vec2(
    fbm(p * 2.2 + warp1 * 1.5 + vec2(t * 0.8, 1.7)),
    fbm(p * 2.2 + warp1 * 1.5 + vec2(-1.3, t * 0.6))
  );

  // 组合成最终的"形状场"，值域大致 [0,1]
  float shape = fbm(p * 1.3 + warp2 * 1.1 + vec2(t * 0.4, -t * 0.3));

  // softness 控制色块边缘的柔和程度：
  // softness 大 → 过渡宽（雾状）；小 → 过渡窄（水彩块）
  float edge = mix(0.18, 0.55, clamp(u_softness, 0.0, 1.0));
  float mask = smoothstep(0.35 - edge, 0.72 + edge * 0.4, shape);

  // intensity 控制整体色块的存在感
  mask *= clamp(u_intensity, 0.0, 2.0);

  /* ---------- 第二层：从主色派生三个色相 ---------- */

  // 原站 GrainGradient 用的是三个固定的深绿，而不是从主色算法派生：
  //   #189168（中绿）、#008558（深绿）、#00ffaa29（亮绿，带 alpha）
  // 直接写死这三个值，画面才和原站一致。
  // 注意最后一个带 alpha：它只用来"提亮某块区域"，不参与色相决定。
  vec3 cDeep = vec3(0.000, 0.522, 0.345); // #008558
  vec3 cMid = vec3(0.094, 0.569, 0.408); // #189168
  vec3 cLight = vec3(0.000, 1.000, 0.667); // #00ffaa

  // 按 shape 的不同区间取不同色，形成"由深到亮"的层次。
  // 这里用两次 smoothstep 做三段映射，比一次 mix 更有层次感。
  vec3 gradient = mix(cDeep, cMid, smoothstep(0.2, 0.55, shape));
  gradient = mix(gradient, cLight, smoothstep(0.62, 0.95, shape));

  // 叠加到背景上。
  //
  // 【关键：这个系数决定"像不像原站"】
  // 原站的渐变是从画面右下角"涌出"一大团深绿，其余是纯黑。
  // 所以不能整屏均匀铺色，必须用 mask 让色块集中在局部。
  //
  // 0.55 是试出来的：再低就只剩黑底（看不出渐变），
  // 再高就变成整块绿幕（失去"黑底上透出光"的高级感）。
  vec3 bg;
  if (u_theme == 1) {
    vec3 base = vec3(0.972, 0.972, 0.972);
    bg = mix(base, gradient, mask * 0.16);
  } else {
    vec3 base = vec3(0.0);
    // 暗角式分布：让色块偏向右下（光源位置），用 uv 做权重
    vec2 lightCenter = vec2(0.68, 0.28);
    float distToLight = length((uv - lightCenter) * vec2(aspect, 1.0));
    float falloff = 1.0 - smoothstep(0.15, 1.05, distToLight);
    bg = base + gradient * mask * 0.55 * (0.25 + falloff * 0.95);
  }

  /* ---------- 第三层：鼠标散射光晕 ---------- */

  if (u_mouseActive > 0.001) {
    // 把鼠标的 2D 坐标映射成一个"世界空间"的点。
    // z 取负值表示在背景稍前方，这样散射有正确的远近感。
    vec3 lightPos = vec3(
      (u_mouse.x - 0.5) * vec2(aspect, 1.0).x * 2.4,
      (u_mouse.y - 0.5) * 2.4,
      -1.15
    );

    // 相机在原点，看向 -z
    vec3 camPos = vec3(0.0, 0.0, 0.0);

    // 当前像素对应的视线方向（近似正交投影，
    // 对全屏背景来说透视差异可忽略，且正交更可控）
    vec3 rayDir = normalize(vec3(p * 1.15, -1.0));

    // 射线长度取一个足够大的值，保证光晕延伸到屏幕边缘
    float rayLen = 3.2;

    float scatter = getScatter(camPos, rayDir, lightPos, rayLen);

    // 光晕颜色：主色向白偏移，做出"发光核心 + 主色边缘"的层次
    vec3 haloColor = mix(u_accent, vec3(1.0), 0.62);

    // 深色主题加色，浅色主题反过来"压暗"（用减去更自然）
    if (u_theme == 1) {
      // 浅色下光晕表现为"提亮 + 轻微加强饱和"
      bg = mix(bg, mix(bg, u_accent, 0.18), scatter * u_mouseActive);
    } else {
      // 系数同样要克制：0.55 会让鼠标处变成一个刺眼的绿色灯泡。
      // 0.14 才是"一圈若隐若现的暖光"，符合参考站那种含蓄的光感。
      bg += haloColor * scatter * 0.14 * u_mouseActive;
    }
  }

  /* ---------- 第四层：胶片颗粒 ---------- */

  // 颗粒坐标用 gl_FragCoord（像素坐标）而非 uv：
  // 这样颗粒尺寸固定在"1 像素"量级，不会随分辨率变化而变大变小。
  // 若用 uv，4K 屏上颗粒会被拉伸成很大的色块。
  float grainNoise = hash12(
    gl_FragCoord.xy * 0.7 + vec2(u_time * 61.7, u_time * 43.3)
  );

  // 把颗粒做成"围绕 0 的扰动"而不是"叠加白点"，
  // 这样不会整体提亮画面，只增加质感。
  // 系数 0.085 偏重（暗部会明显发麻），0.055 更接近胶片颗粒的克制程度。
  float grainStrength = u_grain * (u_theme == 1 ? 0.55 : 1.0) * 0.055;
  bg += (grainNoise - 0.5) * grainStrength;

  /* ---------- 第五层：暗角 ---------- */

  // 边缘轻微压暗，把视线收拢到中间。
  // 这是摄影里的经典手法，能让画面"聚焦"，成本几乎为零。
  float vignette = 1.0 - smoothstep(0.55, 1.5, length(p));
  bg *= mix(1.0, vignette, u_theme == 1 ? 0.10 : 0.28);

  /* ---------- 第六层：抖动输出 ---------- */

  // 8-bit 色深下，平滑渐变必然产生色带（banding）。
  // 在输出前加一点点随机抖动，把色带打散成噪点 —— 这就是 dithering。
  // 注意：必须在所有颜色计算**之后**加，否则会被后续计算平滑掉。
  float dither = (hash12(gl_FragCoord.xy + u_time) - 0.5) / 255.0;
  bg += dither;

  gl_FragColor = vec4(clamp(bg, 0.0, 1.0), 1.0);
}
`;

/* ============================================================================
   WebGL 工具
   ============================================================================ */

/**
 * 编译着色器。
 * 失败时把编译日志带出来 —— WebGL 的报错信息只有通过 getShaderInfoLog
 * 才能看到，直接 throw 一个 "compile failed" 毫无帮助。
 */
function compile(gl, type, src) {
  const sh = gl.createShader(type);
  gl.shaderSource(sh, src);
  gl.compileShader(sh);
  if (!gl.getShaderParameter(sh, gl.COMPILE_STATUS)) {
    const log = gl.getShaderInfoLog(sh);
    gl.deleteShader(sh);
    throw new Error(`着色器编译失败:\n${log}`);
  }
  return sh;
}

/** 链接程序 */
function link(gl, vertSrc, fragSrc) {
  const vs = compile(gl, gl.VERTEX_SHADER, vertSrc);
  const fs = compile(gl, gl.FRAGMENT_SHADER, fragSrc);

  const prog = gl.createProgram();
  gl.attachShader(prog, vs);
  gl.attachShader(prog, fs);
  gl.linkProgram(prog);

  // 链接完成后即可释放 shader 对象
  gl.deleteShader(vs);
  gl.deleteShader(fs);

  if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) {
    const log = gl.getProgramInfoLog(prog);
    gl.deleteProgram(prog);
    throw new Error(`程序链接失败:\n${log}`);
  }
  return prog;
}

/** hex 颜色 → [r, g, b]，范围 0~1 */
function hexToRgb(hex) {
  let h = String(hex || '#00ff88').replace('#', '').trim();
  // 支持简写 #0f8
  if (h.length === 3) {
    h = h
      .split('')
      .map((c) => c + c)
      .join('');
  }
  const num = parseInt(h, 16);
  if (isNaN(num)) return [0, 1, 0.533];
  return [
    ((num >> 16) & 255) / 255,
    ((num >> 8) & 255) / 255,
    (num & 255) / 255,
  ];
}

/* ============================================================================
   主入口：createBackground
   ============================================================================ */

/**
 * 创建全屏背景渲染器。
 *
 * @param {HTMLCanvasElement} canvasEl
 * @param {object} [options]
 * @param {string} [options.accent='#00ff88'] 主色
 * @param {'dark'|'light'} [options.theme='dark'] 主题
 * @param {boolean} [options.reducedMotion=false] 是否减少动效
 * @returns {object} API 对象
 */
export function createBackground(canvasEl, options = {}) {
  const {
    accent = '#00ff88',
    theme = 'dark',
    reducedMotion = false,
  } = options;

  /* ---------- 空壳：不可用时的降级返回 ----------
     所有方法都是空函数，调用方不需要写 if 判断。
     这是"失败也要返回一个形状正确的对象"原则。 */
  const nullApi = {
    fallback: true,
    setAccent() {},
    setTheme() {},
    setGrain() {},
    resize() {},
    destroy() {},
    pause() {},
    resume() {},
  };

  if (!canvasEl) return nullApi;

  /* ---------- 获取 WebGL 上下文 ---------- */

  // 依次尝试 webgl2 / webgl / experimental-webgl。
  // 注意：同一个 canvas 只能拿到一个上下文，
  // 所以这里 try-catch 每个失败的情况（虽然通常第二个就会成功）。
  let gl = null;
  const contextAttrs = {
    // 关键：我们的 shader 自己做了 dithering，
    // 开启 antialias 反而是浪费（全屏三角形没有边缘要抗锯齿）
    antialias: false,
    alpha: false,
    depth: false,
    stencil: false,
    // 不要保留绘图缓冲，省显存
    preserveDrawingBuffer: false,
    powerPreference: 'high-performance',
    failIfMajorPerformanceCaveat: false,
  };

  try {
    gl =
      canvasEl.getContext('webgl2', contextAttrs) ||
      canvasEl.getContext('webgl', contextAttrs) ||
      canvasEl.getContext('experimental-webgl', contextAttrs);
  } catch {
    gl = null;
  }

  if (!gl) {
    console.warn('[shader] WebGL 不可用，降级到 CSS 渐变背景');
    return nullApi;
  }

  /* ---------- 编译程序 ---------- */

  let program;
  try {
    program = link(gl, VERT_SRC, FRAG_SRC);
  } catch (err) {
    console.error('[shader]', err.message);
    return nullApi;
  }

  gl.useProgram(program);

  /* ---------- 全屏四边形缓冲 ----------
     两个三角形覆盖 [-1,1]²：
       (-1,-1) (1,-1) (-1,1)   和   (-1,1) (1,-1) (1,1) */
  const quad = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, quad);
  gl.bufferData(
    gl.ARRAY_BUFFER,
    new Float32Array([-1, -1, 1, -1, -1, 1, -1, 1, 1, -1, 1, 1]),
    gl.STATIC_DRAW
  );

  const aPosition = gl.getAttribLocation(program, 'a_position');
  gl.enableVertexAttribArray(aPosition);
  gl.vertexAttribPointer(aPosition, 2, gl.FLOAT, false, 0, 0);

  /* ---------- uniform 位置缓存 ----------
     getUniformLocation 是相对昂贵的调用（要遍历符号表），
     每帧调用会明显拖慢。所以初始化时一次性取好。 */
  const U = {
    resolution: gl.getUniformLocation(program, 'u_resolution'),
    time: gl.getUniformLocation(program, 'u_time'),
    dt: gl.getUniformLocation(program, 'u_dt'),
    accent: gl.getUniformLocation(program, 'u_accent'),
    theme: gl.getUniformLocation(program, 'u_theme'),
    grain: gl.getUniformLocation(program, 'u_grain'),
    softness: gl.getUniformLocation(program, 'u_softness'),
    intensity: gl.getUniformLocation(program, 'u_intensity'),
    mouse: gl.getUniformLocation(program, 'u_mouse'),
    mouseActive: gl.getUniformLocation(program, 'u_mouseActive'),
    scatterDivider: gl.getUniformLocation(program, 'u_scatterDivider'),
    scatterPowInv: gl.getUniformLocation(program, 'u_scatterPowInv'),
  };

  /* ---------- 运行时状态 ---------- */

  const state = {
    accent: hexToRgb(accent),
    theme: theme === 'light' ? 1 : 0,
    // 颗粒强度：这是"胶片感"的主要来源，0.9 偏明显，0.5 很克制
    grain: 0.9,
    softness: 1.0,
    intensity: 1.0,
    // 散射参数：divider 越大光圈越小；powInv 越小边缘越硬
    scatterDivider: 120.0,
    scatterPowInv: 0.45,

    // 鼠标位置（归一化）。初始放中心偏上，看起来像有光照在上方
    mouse: { x: 0.5, y: 0.35 },
    // 平滑后的鼠标（弹簧）
    mouseSmooth: { x: 0.5, y: 0.35 },
    mouseVel: { x: 0, y: 0 },
    // 鼠标激活度（0~1）：鼠标没动过时为 0，避免一进来就有个突兀的光斑
    mouseActive: 0,

    time: 0,
    lastFrame: 0,
    rafId: null,
    running: false,
    // 实际渲染分辨率
    renderW: 0,
    renderH: 0,
  };

  // 减少动效时直接把颗粒关掉（静止的颗粒像脏屏幕，不好看）
  if (reducedMotion) {
    state.grain = 0;
    state.mouseActive = 0;
  }

  /* ---------- 尺寸管理 ---------- */

  // 像素总量上限。1920*1080*4 ≈ 8.3M 像素，
  // 足够清晰又不会让 4K 屏的核显吃力。
  const MAX_PIXELS = 1920 * 1080 * 4;
  const MAX_DPR = 2;

  function resize() {
    const rect = canvasEl.getBoundingClientRect();
    // 有些情况下（CSS 还没生效）rect 会是 0，用窗口尺寸兜底
    const cssW = rect.width || window.innerWidth;
    const cssH = rect.height || window.innerHeight;
    if (cssW <= 0 || cssH <= 0) return;

    const dpr = Math.min(window.devicePixelRatio || 1, MAX_DPR);
    let w = Math.round(cssW * dpr);
    let h = Math.round(cssH * dpr);

    // 超过像素预算就按比例降采样
    const pixelCount = w * h;
    if (pixelCount > MAX_PIXELS) {
      const scale = Math.sqrt(MAX_PIXELS / pixelCount);
      w = Math.max(1, Math.round(w * scale));
      h = Math.max(1, Math.round(h * scale));
    }

    // 尺寸没变就不动，避免每帧重置 canvas（会清空内容）
    if (w === state.renderW && h === state.renderH) return;

    state.renderW = w;
    state.renderH = h;
    canvasEl.width = w;
    canvasEl.height = h;
    gl.viewport(0, 0, w, h);
  }

  /* ---------- 鼠标追踪 ---------- */

  function onPointerMove(e) {
    // 归一化到 [0,1]，注意 y 轴要翻转：
    // WebGL 的纹理坐标原点在左下，而鼠标在左上
    state.mouse.x = e.clientX / window.innerWidth;
    state.mouse.y = 1 - e.clientY / window.innerHeight;
    // 一旦有真实移动，就激活光晕
    state.mouseActive = 1;
  }

  function onPointerLeave() {
    // 鼠标离开窗口时光晕淡出，不要突然消失
    state.mouseActive = 0;
  }

  if (!reducedMotion) {
    window.addEventListener('pointermove', onPointerMove, { passive: true });
    document.addEventListener('pointerleave', onPointerLeave);
    // 触摸设备：手指按下时也有光晕
    window.addEventListener(
      'touchmove',
      (e) => {
        if (e.touches.length > 0) {
          state.mouse.x = e.touches[0].clientX / window.innerWidth;
          state.mouse.y = 1 - e.touches[0].clientY / window.innerHeight;
          state.mouseActive = 1;
        }
      },
      { passive: true }
    );
  }

  /* ---------- 渲染 ---------- */

  function draw(dt) {
    state.time += dt;
    // 时间取模防止 float 精度损失（跑几小时后 u_time 过大会导致画面抖动）
    if (state.time > 3600) state.time -= 3600;

    /* 鼠标弹簧平滑：
       刚度 0.09、阻尼按 dt 归一化。
       这个系数比 UI 里的更"软"，因为背景光斑应该慢半拍才显得厚重。 */
    const stiffness = 0.09;
    const damping = Math.pow(0.86, dt * 60);

    state.mouseVel.x += (state.mouse.x - state.mouseSmooth.x) * stiffness;
    state.mouseVel.y += (state.mouse.y - state.mouseSmooth.y) * stiffness;
    state.mouseVel.x *= damping;
    state.mouseVel.y *= damping;
    state.mouseSmooth.x += state.mouseVel.x;
    state.mouseSmooth.y += state.mouseVel.y;

    gl.useProgram(program);

    gl.uniform2f(U.resolution, state.renderW, state.renderH);
    gl.uniform1f(U.time, state.time);
    gl.uniform1f(U.dt, dt);
    gl.uniform3f(U.accent, state.accent[0], state.accent[1], state.accent[2]);
    gl.uniform1i(U.theme, state.theme);
    gl.uniform1f(U.grain, state.grain);
    gl.uniform1f(U.softness, state.softness);
    gl.uniform1f(U.intensity, state.intensity);
    gl.uniform2f(U.mouse, state.mouseSmooth.x, state.mouseSmooth.y);
    gl.uniform1f(U.mouseActive, state.mouseActive);
    gl.uniform1f(U.scatterDivider, state.scatterDivider);
    gl.uniform1f(U.scatterPowInv, state.scatterPowInv);

    gl.drawArrays(gl.TRIANGLES, 0, 6);
  }

  function frame(now) {
    if (!state.running) return;
    state.rafId = requestAnimationFrame(frame);

    if (!state.lastFrame) state.lastFrame = now;
    // 同上：dt 上限 0.05s，防止切回标签页时时间跳变
    const dt = Math.min((now - state.lastFrame) / 1000, 0.05);
    state.lastFrame = now;

    draw(dt);
  }

  function start() {
    if (state.running) return;
    state.running = true;
    state.lastFrame = 0;
    state.rafId = requestAnimationFrame(frame);
  }

  function stop() {
    state.running = false;
    if (state.rafId) cancelAnimationFrame(state.rafId);
    state.rafId = null;
  }

  /* ---------- 可见性：不可见时停止渲染 ---------- */

  function onVisibility() {
    if (document.hidden) {
      stop();
    } else if (!reducedMotion) {
      state.lastFrame = 0;
      start();
    }
  }

  document.addEventListener('visibilitychange', onVisibility);

  /* ---------- resize 监听（防抖） ---------- */

  let resizeTimer = null;
  let ro = null;

  function scheduleResize() {
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(() => {
      resize();
      // 减少动效模式下只画一帧静态图
      if (reducedMotion) {
        draw(0);
      }
    }, 120);
  }

  if (typeof ResizeObserver !== 'undefined') {
    ro = new ResizeObserver(scheduleResize);
    ro.observe(canvasEl);
  } else {
    window.addEventListener('resize', scheduleResize, { passive: true });
  }

  /* ---------- 启动 ---------- */

  resize();

  if (reducedMotion) {
    // 只画一帧，然后停住
    draw(0);
  } else {
    start();
  }

  /* ---------- 对外 API ---------- */

  return {
    fallback: false,

    /** 实时换主色（不重建程序） */
    setAccent(hex) {
      const rgb = hexToRgb(hex);
      state.accent = rgb;
      if (reducedMotion) draw(0);
    },

    /** 切换深浅主题 */
    setTheme(next) {
      state.theme = next === 'light' ? 1 : 0;
      // 浅色下颗粒和散射都要弱一些，否则显脏
      state.grain = next === 'light' ? 0.5 : 0.9;
      if (reducedMotion) draw(0);
    },

    /** 调整颗粒强度（0~2） */
    setGrain(v) {
      state.grain = Math.max(0, v);
    },

    /** 调整色块参数 */
    setStyle({ softness, intensity, scatterDivider, scatterPowInv } = {}) {
      if (softness !== undefined) state.softness = softness;
      if (intensity !== undefined) state.intensity = intensity;
      if (scatterDivider !== undefined) state.scatterDivider = scatterDivider;
      if (scatterPowInv !== undefined) state.scatterPowInv = scatterPowInv;
    },

    resize() {
      resize();
      if (reducedMotion) draw(0);
    },

    pause: stop,
    resume: () => {
      if (!reducedMotion) start();
    },

    /** 彻底销毁：释放 GPU 资源 + 移除监听 */
    destroy() {
      stop();
      document.removeEventListener('visibilitychange', onVisibility);
      window.removeEventListener('pointermove', onPointerMove);
      document.removeEventListener('pointerleave', onPointerLeave);
      if (ro) ro.disconnect();
      else window.removeEventListener('resize', scheduleResize);

      gl.deleteBuffer(quad);
      gl.deleteProgram(program);

      // 主动释放上下文。不释放的话反复创建会耗尽浏览器的上下文配额
      // （Chrome 上限约 16 个），页面会开始报 "Too many active WebGL contexts"。
      const loseExt = gl.getExtension('WEBGL_lose_context');
      if (loseExt) loseExt.loseContext();
    },
  };
}
