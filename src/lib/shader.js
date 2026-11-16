/* ==========================================================================
   shader.js — 首屏动态纹理
   --------------------------------------------------------------------------
   逐字照搬 apanzinc.top 首页的 @paper-design/shaders GrainGradient：
     · 顶点 / 片段着色器、颜色、shape、scale、offset、噪声贴图
       全部取自参考站线上构建产物
     · WebGL2 + 透明画布，深浅主题共用同一套颜色，
       由页面背景色决定最终观感（与原站一致）
     · 不响应鼠标，只有 u_time 在走
   ========================================================================== */

import { GRAIN_NOISE_DATA_URL } from './noise-texture.js';

const VERT_SRC = `#version 300 es
precision mediump float;

layout(location = 0) in vec4 a_position;

uniform vec2 u_resolution;
uniform float u_pixelRatio;
uniform float u_imageAspectRatio;
uniform float u_originX;
uniform float u_originY;
uniform float u_worldWidth;
uniform float u_worldHeight;
uniform float u_fit;
uniform float u_scale;
uniform float u_rotation;
uniform float u_offsetX;
uniform float u_offsetY;

out vec2 v_objectUV;
out vec2 v_objectBoxSize;
out vec2 v_responsiveUV;
out vec2 v_responsiveBoxGivenSize;
out vec2 v_patternUV;
out vec2 v_patternBoxSize;
out vec2 v_imageUV;

vec3 getBoxSize(float boxRatio, vec2 givenBoxSize) {
  vec2 box = vec2(0.);
  // fit = none
  box.x = boxRatio * min(givenBoxSize.x / boxRatio, givenBoxSize.y);
  float noFitBoxWidth = box.x;
  if (u_fit == 1.) { // fit = contain
    box.x = boxRatio * min(u_resolution.x / boxRatio, u_resolution.y);
  } else if (u_fit == 2.) { // fit = cover
    box.x = boxRatio * max(u_resolution.x / boxRatio, u_resolution.y);
  }
  box.y = box.x / boxRatio;
  return vec3(box, noFitBoxWidth);
}

void main() {
  gl_Position = a_position;

  vec2 uv = gl_Position.xy * .5;
  vec2 boxOrigin = vec2(.5 - u_originX, u_originY - .5);
  vec2 givenBoxSize = vec2(u_worldWidth, u_worldHeight);
  givenBoxSize = max(givenBoxSize, vec2(1.)) * u_pixelRatio;
  float r = u_rotation * 3.14159265358979323846 / 180.;
  mat2 graphicRotation = mat2(cos(r), sin(r), -sin(r), cos(r));
  vec2 graphicOffset = vec2(-u_offsetX, u_offsetY);


  // ===================================================

  float fixedRatio = 1.;
  vec2 fixedRatioBoxGivenSize = vec2(
  (u_worldWidth == 0.) ? u_resolution.x : givenBoxSize.x,
  (u_worldHeight == 0.) ? u_resolution.y : givenBoxSize.y
  );

  v_objectBoxSize = getBoxSize(fixedRatio, fixedRatioBoxGivenSize).xy;
  vec2 objectWorldScale = u_resolution.xy / v_objectBoxSize;

  v_objectUV = uv;
  v_objectUV *= objectWorldScale;
  v_objectUV += boxOrigin * (objectWorldScale - 1.);
  v_objectUV += graphicOffset;
  v_objectUV /= u_scale;
  v_objectUV = graphicRotation * v_objectUV;

  // ===================================================

  v_responsiveBoxGivenSize = vec2(
  (u_worldWidth == 0.) ? u_resolution.x : givenBoxSize.x,
  (u_worldHeight == 0.) ? u_resolution.y : givenBoxSize.y
  );
  float responsiveRatio = v_responsiveBoxGivenSize.x / v_responsiveBoxGivenSize.y;
  vec2 responsiveBoxSize = getBoxSize(responsiveRatio, v_responsiveBoxGivenSize).xy;
  vec2 responsiveBoxScale = u_resolution.xy / responsiveBoxSize;

  #ifdef ADD_HELPERS
  v_responsiveHelperBox = uv;
  v_responsiveHelperBox *= responsiveBoxScale;
  v_responsiveHelperBox += boxOrigin * (responsiveBoxScale - 1.);
  #endif

  v_responsiveUV = uv;
  v_responsiveUV *= responsiveBoxScale;
  v_responsiveUV += boxOrigin * (responsiveBoxScale - 1.);
  v_responsiveUV += graphicOffset;
  v_responsiveUV /= u_scale;
  v_responsiveUV.x *= responsiveRatio;
  v_responsiveUV = graphicRotation * v_responsiveUV;
  v_responsiveUV.x /= responsiveRatio;

  // ===================================================

  float patternBoxRatio = givenBoxSize.x / givenBoxSize.y;
  vec2 patternBoxGivenSize = vec2(
  (u_worldWidth == 0.) ? u_resolution.x : givenBoxSize.x,
  (u_worldHeight == 0.) ? u_resolution.y : givenBoxSize.y
  );
  patternBoxRatio = patternBoxGivenSize.x / patternBoxGivenSize.y;

  vec3 boxSizeData = getBoxSize(patternBoxRatio, patternBoxGivenSize);
  v_patternBoxSize = boxSizeData.xy;
  float patternBoxNoFitBoxWidth = boxSizeData.z;
  vec2 patternBoxScale = u_resolution.xy / v_patternBoxSize;

  v_patternUV = uv;
  v_patternUV += graphicOffset / patternBoxScale;
  v_patternUV += boxOrigin;
  v_patternUV -= boxOrigin / patternBoxScale;
  v_patternUV *= u_resolution.xy;
  v_patternUV /= u_pixelRatio;
  if (u_fit > 0.) {
    v_patternUV *= (patternBoxNoFitBoxWidth / v_patternBoxSize.x);
  }
  v_patternUV /= u_scale;
  v_patternUV = graphicRotation * v_patternUV;
  v_patternUV += boxOrigin / patternBoxScale;
  v_patternUV -= boxOrigin;
  // x100 is a default multiplier between vertex and fragmant shaders
  // we use it to avoid UV presision issues
  v_patternUV *= .01;

  // ===================================================

  vec2 imageBoxSize;
  if (u_fit == 1.) { // contain
    imageBoxSize.x = min(u_resolution.x / u_imageAspectRatio, u_resolution.y) * u_imageAspectRatio;
  } else if (u_fit == 2.) { // cover
    imageBoxSize.x = max(u_resolution.x / u_imageAspectRatio, u_resolution.y) * u_imageAspectRatio;
  } else {
    imageBoxSize.x = min(10.0, 10.0 / u_imageAspectRatio * u_imageAspectRatio);
  }
  imageBoxSize.y = imageBoxSize.x / u_imageAspectRatio;
  vec2 imageBoxScale = u_resolution.xy / imageBoxSize;

  v_imageUV = uv;
  v_imageUV *= imageBoxScale;
  v_imageUV += boxOrigin * (imageBoxScale - 1.);
  v_imageUV += graphicOffset;
  v_imageUV /= u_scale;
  v_imageUV.x *= u_imageAspectRatio;
  v_imageUV = graphicRotation * v_imageUV;
  v_imageUV.x /= u_imageAspectRatio;

  v_imageUV += .5;
  v_imageUV.y = 1. - v_imageUV.y;
}`;

const FRAG_SRC = `#version 300 es
precision lowp float;

uniform mediump float u_time;
uniform mediump vec2 u_resolution;
uniform mediump float u_pixelRatio;

uniform sampler2D u_noiseTexture;

uniform vec4 u_colorBack;
uniform vec4 u_colors[7];
uniform float u_colorsCount;
uniform float u_softness;
uniform float u_intensity;
uniform float u_noise;
uniform float u_shape;

uniform mediump float u_originX;
uniform mediump float u_originY;
uniform mediump float u_worldWidth;
uniform mediump float u_worldHeight;
uniform mediump float u_fit;

uniform mediump float u_scale;
uniform mediump float u_rotation;
uniform mediump float u_offsetX;
uniform mediump float u_offsetY;

in vec2 v_objectUV;
in vec2 v_patternUV;
in vec2 v_objectBoxSize;
in vec2 v_patternBoxSize;

out vec4 fragColor;


#define TWO_PI 6.28318530718
#define PI 3.14159265358979323846


vec3 permute(vec3 x) { return mod(((x * 34.0) + 1.0) * x, 289.0); }
float snoise(vec2 v) {
  const vec4 C = vec4(0.211324865405187, 0.366025403784439,
    -0.577350269189626, 0.024390243902439);
  vec2 i = floor(v + dot(v, C.yy));
  vec2 x0 = v - i + dot(i, C.xx);
  vec2 i1;
  i1 = (x0.x > x0.y) ? vec2(1.0, 0.0) : vec2(0.0, 1.0);
  vec4 x12 = x0.xyxy + C.xxzz;
  x12.xy -= i1;
  i = mod(i, 289.0);
  vec3 p = permute(permute(i.y + vec3(0.0, i1.y, 1.0))
    + i.x + vec3(0.0, i1.x, 1.0));
  vec3 m = max(0.5 - vec3(dot(x0, x0), dot(x12.xy, x12.xy),
      dot(x12.zw, x12.zw)), 0.0);
  m = m * m;
  m = m * m;
  vec3 x = 2.0 * fract(p * C.www) - 1.0;
  vec3 h = abs(x) - 0.5;
  vec3 ox = floor(x + 0.5);
  vec3 a0 = x - ox;
  m *= 1.79284291400159 - 0.85373472095314 * (a0 * a0 + h * h);
  vec3 g;
  g.x = a0.x * x0.x + h.x * x0.y;
  g.yz = a0.yz * x12.xz + h.yz * x12.yw;
  return 130.0 * dot(m, g);
}


vec2 rotate(vec2 uv, float th) {
  return mat2(cos(th), sin(th), -sin(th), cos(th)) * uv;
}


  float randomR(vec2 p) {
    vec2 uv = floor(p) / 100. + .5;
    return texture(u_noiseTexture, fract(uv)).r;
  }


float valueNoiseR(vec2 st) {
  vec2 i = floor(st);
  vec2 f = fract(st);
  float a = randomR(i);
  float b = randomR(i + vec2(1.0, 0.0));
  float c = randomR(i + vec2(0.0, 1.0));
  float d = randomR(i + vec2(1.0, 1.0));
  vec2 u = f * f * (3.0 - 2.0 * f);
  float x1 = mix(a, b, u.x);
  float x2 = mix(c, d, u.x);
  return mix(x1, x2, u.y);
}
vec4 fbmR(vec2 n0, vec2 n1, vec2 n2, vec2 n3) {
  float amplitude = 0.2;
  vec4 total = vec4(0.);
  for (int i = 0; i < 3; i++) {
    n0 = rotate(n0, 0.3);
    n1 = rotate(n1, 0.3);
    n2 = rotate(n2, 0.3);
    n3 = rotate(n3, 0.3);
    total.x += valueNoiseR(n0) * amplitude;
    total.y += valueNoiseR(n1) * amplitude;
    total.z += valueNoiseR(n2) * amplitude;
    total.z += valueNoiseR(n3) * amplitude;
    n0 *= 1.99;
    n1 *= 1.99;
    n2 *= 1.99;
    n3 *= 1.99;
    amplitude *= 0.6;
  }
  return total;
}


  float hash11(float p) {
    p = fract(p * 0.3183099) + 0.1;
    p *= p + 19.19;
    return fract(p * p);
  }


vec2 truchet(vec2 uv, float idx){
  idx = fract(((idx - .5) * 2.));
  if (idx > 0.75) {
    uv = vec2(1.0) - uv;
  } else if (idx > 0.5) {
    uv = vec2(1.0 - uv.x, uv.y);
  } else if (idx > 0.25) {
    uv = 1.0 - vec2(1.0 - uv.x, uv.y);
  }
  return uv;
}

void main() {

  const float firstFrameOffset = 7.;
  float t = .1 * (u_time + firstFrameOffset);

  vec2 shape_uv = vec2(0.);
  vec2 grain_uv = vec2(0.);

  float r = u_rotation * PI / 180.;
  float cr = cos(r);
  float sr = sin(r);
  mat2 graphicRotation = mat2(cr, sr, -sr, cr);
  vec2 graphicOffset = vec2(-u_offsetX, u_offsetY);

  if (u_shape > 3.5) {
    shape_uv = v_objectUV;
    grain_uv = shape_uv;

    // apply inverse transform to grain_uv so it respects the originXY
    grain_uv = transpose(graphicRotation) * grain_uv;
    grain_uv *= u_scale;
    grain_uv -= graphicOffset;
    grain_uv *= v_objectBoxSize;
    grain_uv *= .7;
  } else {
    shape_uv = .5 * v_patternUV;
    grain_uv = 100. * v_patternUV;

    // apply inverse transform to grain_uv so it respects the originXY
    grain_uv = transpose(graphicRotation) * grain_uv;
    grain_uv *= u_scale;
    if (u_fit > 0.) {
      vec2 givenBoxSize = vec2(u_worldWidth, u_worldHeight);
      givenBoxSize = max(givenBoxSize, vec2(1.)) * u_pixelRatio;
      float patternBoxRatio = givenBoxSize.x / givenBoxSize.y;
      vec2 patternBoxGivenSize = vec2(
      (u_worldWidth == 0.) ? u_resolution.x : givenBoxSize.x,
      (u_worldHeight == 0.) ? u_resolution.y : givenBoxSize.y
      );
      patternBoxRatio = patternBoxGivenSize.x / patternBoxGivenSize.y;
      float patternBoxNoFitBoxWidth = patternBoxRatio * min(patternBoxGivenSize.x / patternBoxRatio, patternBoxGivenSize.y);
      grain_uv /= (patternBoxNoFitBoxWidth / v_patternBoxSize.x);
    }
    vec2 patternBoxScale = u_resolution.xy / v_patternBoxSize;
    grain_uv -= graphicOffset / patternBoxScale;
    grain_uv *= 1.6;
  }


  float shape = 0.;

  if (u_shape < 1.5) {
    // Sine wave

    float wave = cos(.5 * shape_uv.x - 4. * t) * sin(1.5 * shape_uv.x + 2. * t) * (.75 + .25 * cos(6. * t));
    shape = 1. - smoothstep(-1., 1., shape_uv.y + wave);

  } else if (u_shape < 2.5) {
    // Grid (dots)

    float stripeIdx = floor(2. * shape_uv.x / TWO_PI);
    float rand = hash11(stripeIdx * 100.);
    rand = sign(rand - .5) * pow(4. * abs(rand), .3);
    shape = sin(shape_uv.x) * cos(shape_uv.y - 5. * rand * t);
    shape = pow(abs(shape), 4.);

  } else if (u_shape < 3.5) {
    // Truchet pattern

    float n2 = valueNoiseR(shape_uv * .4 - 3.75 * t);
    shape_uv.x += 10.;
    shape_uv *= .6;

    vec2 tile = truchet(fract(shape_uv), randomR(floor(shape_uv)));

    float distance1 = length(tile);
    float distance2 = length(tile - vec2(1.));

    n2 -= .5;
    n2 *= .1;
    shape = smoothstep(.2, .55, distance1 + n2) * (1. - smoothstep(.45, .8, distance1 - n2));
    shape += smoothstep(.2, .55, distance2 + n2) * (1. - smoothstep(.45, .8, distance2 - n2));

    shape = pow(shape, 1.5);

  } else if (u_shape < 4.5) {
    // Corners

    shape_uv *= .6;
    vec2 outer = vec2(.5);

    vec2 bl = smoothstep(vec2(0.), outer, shape_uv + vec2(.1 + .1 * sin(3. * t), .2 - .1 * sin(5.25 * t)));
    vec2 tr = smoothstep(vec2(0.), outer, 1. - shape_uv);
    shape = 1. - bl.x * bl.y * tr.x * tr.y;

    shape_uv = -shape_uv;
    bl = smoothstep(vec2(0.), outer, shape_uv + vec2(.1 + .1 * sin(3. * t), .2 - .1 * cos(5.25 * t)));
    tr = smoothstep(vec2(0.), outer, 1. - shape_uv);
    shape -= bl.x * bl.y * tr.x * tr.y;

    shape = 1. - smoothstep(0., 1., shape);

  } else if (u_shape < 5.5) {
    // Ripple

    shape_uv *= 2.;
    float dist = length(.4 * shape_uv);
    float waves = sin(pow(dist, 1.2) * 5. - 3. * t) * .5 + .5;
    shape = waves;

  } else if (u_shape < 6.5) {
    // Blob

    t *= 2.;

    vec2 f1_traj = .25 * vec2(1.3 * sin(t), .2 + 1.3 * cos(.6 * t + 4.));
    vec2 f2_traj = .2 * vec2(1.2 * sin(-t), 1.3 * sin(1.6 * t));
    vec2 f3_traj = .25 * vec2(1.7 * cos(-.6 * t), cos(-1.6 * t));
    vec2 f4_traj = .3 * vec2(1.4 * cos(.8 * t), 1.2 * sin(-.6 * t - 3.));

    shape = .5 * pow(1. - clamp(0., 1., length(shape_uv + f1_traj)), 5.);
    shape += .5 * pow(1. - clamp(0., 1., length(shape_uv + f2_traj)), 5.);
    shape += .5 * pow(1. - clamp(0., 1., length(shape_uv + f3_traj)), 5.);
    shape += .5 * pow(1. - clamp(0., 1., length(shape_uv + f4_traj)), 5.);

    shape = smoothstep(.0, .9, shape);
    float edge = smoothstep(.25, .3, shape);
    shape = mix(.0, shape, edge);

  } else {
    // Sphere

    shape_uv *= 2.;
    float d = 1. - pow(length(shape_uv), 2.);
    vec3 pos = vec3(shape_uv, sqrt(max(d, 0.)));
    vec3 lightPos = normalize(vec3(cos(1.5 * t), .8, sin(1.25 * t)));
    shape = .5 + .5 * dot(lightPos, pos);
    shape *= step(0., d);
  }

  float baseNoise = snoise(grain_uv * .5);
  vec4 fbmVals = fbmR(
  .002 * grain_uv + 10.,
  .003 * grain_uv,
  .001 * grain_uv,
  rotate(.4 * grain_uv, 2.)
  );
  float grainDist = baseNoise * snoise(grain_uv * .2) - fbmVals.x - fbmVals.y;
  float rawNoise = .75 * baseNoise - fbmVals.w - fbmVals.z;
  float noise = clamp(rawNoise, 0., 1.);

  shape += u_intensity * 2. / u_colorsCount * (grainDist + .5);
  shape += u_noise * 10. / u_colorsCount * noise;

  float aa = fwidth(shape);

  shape = clamp(shape - .5 / u_colorsCount, 0., 1.);
  float totalShape = smoothstep(0., u_softness + 2. * aa, clamp(shape * u_colorsCount, 0., 1.));
  float mixer = shape * (u_colorsCount - 1.);

  int cntStop = int(u_colorsCount) - 1;
  vec4 gradient = u_colors[0];
  gradient.rgb *= gradient.a;
  for (int i = 1; i < 7; i++) {
    if (i > cntStop) break;

    float localT = clamp(mixer - float(i - 1), 0., 1.);
    localT = smoothstep(.5 - .5 * u_softness - aa, .5 + .5 * u_softness + aa, localT);

    vec4 c = u_colors[i];
    c.rgb *= c.a;
    gradient = mix(gradient, c, localT);
  }

  vec3 color = gradient.rgb * totalShape;
  float opacity = gradient.a * totalShape;

  vec3 bgColor = u_colorBack.rgb * u_colorBack.a;
  color = color + bgColor * (1.0 - opacity);
  opacity = opacity + u_colorBack.a * (1.0 - opacity);

  fragColor = vec4(color, opacity);
}`;

/* ==========================================================================
   运行时 —— 逐条对齐参考站用的 @paper-design/shaders `PaperShaders` 类
   --------------------------------------------------------------------------
   上一版只把**着色器**搬过来了，没搬**运行时**。而"哪些浏览器能看见纹理"
   恰恰由运行时决定。下面几条差异就是线上"部分浏览器不显示"的真正来源，
   每一条都能单独把纹理打成一片死黑：

   1) 精度补丁（最要命的一条，已在 Chrome/SwiftShader 环境下复现）
      片段着色器首行是 `precision lowp float;`，正文全是 snoise / fbm /
      smoothstep 的高频运算。移动端 GPU（Mali、PowerVR、部分 Adreno）的
      mediump 只有 10~16 bit，lowp 更低 —— 噪声直接算成 0 或 NaN，
      画出来就是**纯黑/全透明**；同一份代码在桌面显卡上完全正常。
      PaperShaders 的对策：建完上下文先问 GPU
          getShaderPrecisionFormat(FRAGMENT_SHADER, MEDIUM_FLOAT)
      精度 < 23 就把源码里所有 lowp / mediump 统统改写成 highp 再编译。
      参考站有这段代码，本站之前没有 —— 这就是"部分浏览器不显示"的头号原因。
      （实测：目标站编译时 decl=highp，本站旧版编译时 decl=lowp，可复现。）

   2) 噪声贴图的来源
      参考站把 128×128 噪声图 base64 内嵌进 bundle，随 JS 一起到达；
      本站之前是 `new Image()` 走网络请求，失败/被拦/离线就退化成静态渐变，
      而且是**静默**退化（控制台只有一条 warn）。现已改为内嵌。

   3) 上下文属性
      参考站 `getContext('webgl2')` 一个属性都不传。本站之前传了
      `powerPreference: 'high-performance'`，在低端 Android WebView、
      省电模式、多标签抢 GPU 时，这个"高性能"提示会让 getContext 直接返回 null。

   4) 尺寸测量的时机
      参考站用 ResizeObserver 盯住父容器，布局一变就重算；本站之前只在
      image.onload 里量一次 clientWidth/Height。如果那一刻布局还没完成
      （字体未就绪、移动端地址栏变化、Flex 高度未定），画布就停在 0×0 或
      300×150，之后除非用户手动缩放窗口否则**永不自愈**。这是竞态，所以时好时坏。

   5) 是否在视口内
      参考站用 IntersectionObserver + visibilitychange 控制 rAF：离屏即停、
      回到视口即续。本站之前只处理了 visibilitychange。

   另外补了一条参考站没做的：webglcontextlost 之后先铺 CSS 兜底，
   webglcontextrestored 之后重建资源。移动端切后台、驱动重置会丢上下文，
   参考站在这种情况下会永久黑屏；我们多做一步，丢上下文也有背景可看。
   ========================================================================== */

/* 与参考站完全相同的两个渲染预算常量 */
const MAX_PIXEL_COUNT = 1920 * 1080 * 4;
const MIN_PIXEL_RATIO = 2;

/* 参考站传入的三个颜色（sRGB，直传不做线性转换）。
   u_colors 固定 7 个 vec4，未使用的补零。 */
const COLORS = [
  [0x18 / 255, 0x91 / 255, 0x68 / 255, 1],
  [0x00 / 255, 0x85 / 255, 0x58 / 255, 1],
  [0x00 / 255, 0xff / 255, 0xaa / 255, 0x29 / 255],
  [0, 0, 0, 0],
  [0, 0, 0, 0],
  [0, 0, 0, 0],
  [0, 0, 0, 0],
];

const FALLBACK_BG =
  'radial-gradient(ellipse 90% 70% at 30% 100%, rgba(24,145,104,.32), transparent 62%),' +
  'radial-gradient(ellipse 70% 60% at 78% 70%, rgba(0,133,88,.16), transparent 66%),' +
  'var(--bg-primary)';

/** 参考站的 Safari 判定（同一段 UA 逻辑） */
function isSafari() {
  const ua = navigator.userAgent.toLowerCase();
  return ua.includes('safari') && !ua.includes('chrome') && !ua.includes('android');
}

/**
 * Safari 的 devicePixelRatio 会把页面缩放算进去，直接乘上去画布会被开得过大。
 * 参考站用「物理宽度 / 逻辑宽度」把这个缩放因子还原出来。
 */
function getSafariScale(doc) {
  const vv = window.visualViewport;
  const scale = (vv && vv.scale) || 1;
  const vvWidth = (vv && vv.width) || window.innerWidth;
  const scrollbar = window.innerWidth - doc.documentElement.clientWidth;
  const physical = scale * vvWidth + scrollbar;
  if (!physical) return 1;
  const ratio = window.outerWidth / physical;
  const rounded = Math.round(100 * ratio);
  if (rounded % 5 === 0) return rounded / 100;
  if (rounded === 33) return 1 / 3;
  if (rounded === 67) return 2 / 3;
  if (rounded === 133) return 4 / 3;
  return ratio;
}

/**
 * PaperShaders 的精度补丁（原样照搬）。
 * 只有当片段着色器的 mediump float 精度低于 23 bit 时才改写源码 ——
 * 桌面显卡通常报 23，不受影响；低端移动 GPU 会被升级为 highp。
 */
function patchPrecision(gl, vertSource, fragSource) {
  let mediumFloat = null;
  try {
    const fmt = gl.getShaderPrecisionFormat(gl.FRAGMENT_SHADER, gl.MEDIUM_FLOAT);
    mediumFloat = fmt ? fmt.precision : null;
  } catch {
    mediumFloat = null;
  }
  if (!mediumFloat || mediumFloat >= 23) {
    return { vertSource, fragSource, patched: false, mediumFloat };
  }
  return {
    vertSource: vertSource.replace(
      /precision\s+(lowp|mediump)\s+float;/g,
      'precision highp float;'
    ),
    fragSource: fragSource
      .replace(/precision\s+(lowp|mediump)\s+float/g, 'precision highp float')
      .replace(/\b(uniform|varying|attribute)\s+(lowp|mediump)\s+(\w+)/g, '$1 highp $3'),
    patched: true,
    mediumFloat,
  };
}

function compileShader(gl, type, source) {
  const shader = gl.createShader(type);
  if (!shader) return null;
  gl.shaderSource(shader, source);
  gl.compileShader(shader);
  if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
    console.warn('[shader] 着色器编译失败:', gl.getShaderInfoLog(shader));
    gl.deleteShader(shader);
    return null;
  }
  return shader;
}

function buildProgram(gl, vertexSource, fragmentSource) {
  const vs = compileShader(gl, gl.VERTEX_SHADER, vertexSource);
  const fs = compileShader(gl, gl.FRAGMENT_SHADER, fragmentSource);
  if (!vs || !fs) {
    if (vs) gl.deleteShader(vs);
    if (fs) gl.deleteShader(fs);
    return null;
  }
  const program = gl.createProgram();
  if (!program) {
    gl.deleteShader(vs);
    gl.deleteShader(fs);
    return null;
  }
  gl.attachShader(program, vs);
  gl.attachShader(program, fs);
  gl.linkProgram(program);
  gl.detachShader(program, vs);
  gl.detachShader(program, fs);
  gl.deleteShader(vs);
  gl.deleteShader(fs);
  if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
    console.warn('[shader] 着色器链接失败:', gl.getProgramInfoLog(program));
    gl.deleteProgram(program);
    return null;
  }
  return program;
}

function fallbackHandle() {
  const noop = () => {};
  return {
    fallback: true,
    setTheme: noop,
    setAccent: noop,
    setGrain: noop,
    resize: noop,
    destroy: noop,
    pause: noop,
    resume: noop,
  };
}

/** 是否偏好减少动效。取不到 matchMedia 时按"不减少"处理，保持原视觉。 */
function prefersReducedMotion() {
  try {
    return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  } catch {
    return false;
  }
}

/**
 * @param {HTMLCanvasElement} canvas 已插入 DOM 的画布
 */
export function createBackground(canvas) {
  const host = canvas.parentElement || null;
  const ownerDocument = canvas.ownerDocument || document;

  /* 兜底：拿不到 WebGL2 / 编译失败 / 贴图异常时，用 CSS 渐变顶上，
     保证背景永远不是纯黑。参考站没有这一层（它失败就是一片黑），
     这是本站有意保留的退化路径。 */
  function applyCssFallback() {
    canvas.style.display = 'none';
    if (host) host.style.background = FALLBACK_BG;
  }

  function clearCssFallback() {
    canvas.style.display = '';
    if (host) host.style.background = '';
  }

  /* 上下文属性：与参考站一致 —— 一个都不传。
     旧实现传的 powerPreference:'high-performance' 在弱 GPU 上会让
     getContext 直接返回 null（纹理彻底消失），这里不要加回去。 */
  const gl = canvas.getContext('webgl2');
  if (!gl) {
    console.info('[shader] 当前浏览器不支持 WebGL2，改用静态渐变兜底');
    applyCssFallback();
    return fallbackHandle();
  }

  let program = null;
  let quad = null;
  let texture = null;
  let noiseImage = null;
  const loc = {};
  let renderScale = 1;
  let resolutionChanged = true;
  let currentFrame = 0;
  let lastRenderTime = 0;
  let rafId = null;
  let currentSpeed = 0;
  let isInViewport = true;
  let disposed = false;
  let contextLost = false;

  /* 父容器尺寸（来自 ResizeObserver）。devicePixelContentBoxSize 只有部分
     浏览器支持，但它给的是**真正的物理像素**，比 devicePixelRatio 推断准。 */
  let parentWidth = 0;
  let parentHeight = 0;
  let parentDevicePixelWidth = 0;
  let parentDevicePixelHeight = 0;
  let devicePixelsSupported = false;
  let resizeObserver = null;
  let intersectionObserver = null;

  /* 参考站 speed = 1；减少动效时用 0，只画一帧静态图 */
  const speed = prefersReducedMotion() ? 0 : 1;

  function getUniformLocations() {
    const names = [
      'u_time',
      'u_resolution',
      'u_pixelRatio',
      'u_imageAspectRatio',
      'u_noiseTexture',
      'u_colorBack',
      'u_colors',
      'u_colors[0]',
      'u_colorsCount',
      'u_softness',
      'u_intensity',
      'u_noise',
      'u_shape',
      'u_originX',
      'u_originY',
      'u_worldWidth',
      'u_worldHeight',
      'u_fit',
      'u_scale',
      'u_rotation',
      'u_offsetX',
      'u_offsetY',
    ];
    for (const name of names) loc[name] = gl.getUniformLocation(program, name);
  }

  /** 一次性写入参考站 Hero 传入的全部参数 */
  function setUniformValues() {
    gl.useProgram(program);
    const colorsLoc = loc.u_colors || loc['u_colors[0]'];
    if (colorsLoc) gl.uniform4fv(colorsLoc, COLORS.flat());

    if (loc.u_colorBack) gl.uniform4f(loc.u_colorBack, 0, 0, 0, 0);
    if (loc.u_colorsCount) gl.uniform1f(loc.u_colorsCount, 3);
    if (loc.u_softness) gl.uniform1f(loc.u_softness, 1);
    if (loc.u_intensity) gl.uniform1f(loc.u_intensity, 1);
    if (loc.u_noise) gl.uniform1f(loc.u_noise, 1);
    if (loc.u_shape) gl.uniform1f(loc.u_shape, 4); // corners
    if (loc.u_originX) gl.uniform1f(loc.u_originX, 0.5);
    if (loc.u_originY) gl.uniform1f(loc.u_originY, 0.5);
    if (loc.u_worldWidth) gl.uniform1f(loc.u_worldWidth, 0);
    if (loc.u_worldHeight) gl.uniform1f(loc.u_worldHeight, 0);
    if (loc.u_fit) gl.uniform1f(loc.u_fit, 1); // contain
    if (loc.u_scale) gl.uniform1f(loc.u_scale, 1.24);
    if (loc.u_rotation) gl.uniform1f(loc.u_rotation, 0);
    if (loc.u_offsetX) gl.uniform1f(loc.u_offsetX, -0.12);
    if (loc.u_offsetY) gl.uniform1f(loc.u_offsetY, 0);
    /* 参考站没有传 u_imageAspectRatio（无 image uniform），默认是 0；
       着色器里那个分支算的是 v_imageUV，而片段着色器只用 v_objectUV /
       v_patternUV，所以这里填 1 只为避开除零，不影响任何像素。 */
    if (loc.u_imageAspectRatio) gl.uniform1f(loc.u_imageAspectRatio, 1);
    if (loc.u_time) gl.uniform1f(loc.u_time, 0);
  }

  function uploadTexture() {
    if (!noiseImage) return;
    if (texture) gl.deleteTexture(texture);
    texture = gl.createTexture();
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, texture);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, noiseImage);
    if (loc.u_noiseTexture) gl.uniform1i(loc.u_noiseTexture, 0);
  }

  /** 建 program / VBO / uniform。上下文恢复后会被再调一次。 */
  function initResources() {
    const patched = patchPrecision(gl, VERT_SRC, FRAG_SRC);
    if (patched.patched) {
      console.info(
        `[shader] 检测到片段着色器 mediump 精度仅 ${patched.mediumFloat} bit，` +
          '已按 PaperShaders 的方式升级为 highp'
      );
    }

    program = buildProgram(gl, patched.vertSource, patched.fragSource);
    if (!program) return false;

    const attrib = gl.getAttribLocation(program, 'a_position');
    quad = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, quad);
    gl.bufferData(
      gl.ARRAY_BUFFER,
      new Float32Array([-1, -1, 1, -1, -1, 1, -1, 1, 1, -1, 1, 1]),
      gl.STATIC_DRAW
    );
    gl.enableVertexAttribArray(attrib);
    gl.vertexAttribPointer(attrib, 2, gl.FLOAT, false, 0, 0);

    getUniformLocations();
    setUniformValues();
    uploadTexture();

    resolutionChanged = true;
    return true;
  }

  /* ---------------------------------------------------------------- 渲染 */

  function render(now) {
    if (disposed || contextLost || !program) {
      rafId = null;
      return;
    }
    const delta = now - lastRenderTime;
    lastRenderTime = now;
    if (currentSpeed !== 0) currentFrame += delta * currentSpeed;

    gl.clear(gl.COLOR_BUFFER_BIT);
    gl.useProgram(program);
    if (loc.u_time) gl.uniform1f(loc.u_time, currentFrame * 0.001);
    if (resolutionChanged) {
      if (loc.u_resolution) gl.uniform2f(loc.u_resolution, canvas.width, canvas.height);
      if (loc.u_pixelRatio) gl.uniform1f(loc.u_pixelRatio, renderScale);
      resolutionChanged = false;
    }
    gl.drawArrays(gl.TRIANGLES, 0, 6);

    if (currentSpeed === 0) rafId = null;
    else requestRender();
  }

  function requestRender() {
    if (rafId !== null) cancelAnimationFrame(rafId);
    rafId = requestAnimationFrame(render);
  }

  function setCurrentSpeed(next) {
    currentSpeed = next;
    if (rafId === null && next !== 0) {
      lastRenderTime = performance.now();
      rafId = requestAnimationFrame(render);
    } else if (rafId !== null && next === 0) {
      cancelAnimationFrame(rafId);
      rafId = null;
    }
  }

  function updateCurrentSpeed() {
    setCurrentSpeed(ownerDocument.hidden || !isInViewport ? 0 : speed);
  }

  /* ---------------------------------------------------------------- 尺寸 */

  /**
   * 与参考站 handleResize 完全一致的算法：
   *   · devicePixelContentBoxSize 可用 → 直接用它（物理像素，最准）
   *   · 否则 devicePixelRatio（Safari 再乘一次缩放修正）
   *   · 最后用 maxPixelCount 夹紧总像素数，renderScale = 实际宽 / 逻辑宽
   */
  function handleResize() {
    if (disposed || contextLost) return;

    const dprValue = Math.max(1, window.devicePixelRatio || 1);
    const vvScale = (window.visualViewport && window.visualViewport.scale) || 1;

    let deviceWidth = 0;
    let deviceHeight = 0;

    if (devicePixelsSupported && parentDevicePixelWidth && parentDevicePixelHeight) {
      const ratio = Math.max(1, MIN_PIXEL_RATIO / dprValue);
      deviceWidth = parentDevicePixelWidth * ratio * vvScale;
      deviceHeight = parentDevicePixelHeight * ratio * vvScale;
    } else {
      let ratio = Math.max(dprValue, MIN_PIXEL_RATIO) * vvScale;
      if (isSafari()) ratio *= Math.max(1, getSafariScale(ownerDocument));
      const w = parentWidth || host?.clientWidth || 0;
      const h = parentHeight || host?.clientHeight || 0;
      deviceWidth = Math.round(w) * ratio;
      deviceHeight = Math.round(h) * ratio;
    }

    if (!deviceWidth || !deviceHeight) return;

    const budget = Math.min(
      1,
      Math.sqrt(MAX_PIXEL_COUNT) / Math.sqrt(deviceWidth * deviceHeight)
    );
    const canvasWidth = Math.round(deviceWidth * budget);
    const canvasHeight = Math.round(deviceHeight * budget);
    if (!canvasWidth || !canvasHeight) return;

    const logicalWidth = Math.round(parentWidth || host?.clientWidth || canvasWidth);
    const nextScale = canvasWidth / logicalWidth;

    if (
      canvas.width !== canvasWidth ||
      canvas.height !== canvasHeight ||
      renderScale !== nextScale
    ) {
      renderScale = nextScale;
      canvas.width = canvasWidth;
      canvas.height = canvasHeight;
      resolutionChanged = true;
      gl.viewport(0, 0, gl.drawingBufferWidth, gl.drawingBufferHeight);
      // 参考站在这里立刻补画一帧，避免暂停态（减少动效）下尺寸变了画面还是旧的
      render(performance.now());
    }
  }

  function setupResizeObserver() {
    if (typeof ResizeObserver !== 'function') {
      // 兜底：老浏览器用 resize 事件 + clientWidth
      const onResize = () => {
        parentWidth = host?.clientWidth || 0;
        parentHeight = host?.clientHeight || 0;
        handleResize();
      };
      window.addEventListener('resize', onResize, { passive: true });
      window.addEventListener('orientationchange', onResize, { passive: true });
      onResize();
      return () => {
        window.removeEventListener('resize', onResize);
        window.removeEventListener('orientationchange', onResize);
      };
    }

    resizeObserver = new ResizeObserver((entries) => {
      const entry = entries[0];
      if (entry) {
        const deviceBox = entry.devicePixelContentBoxSize && entry.devicePixelContentBoxSize[0];
        if (deviceBox !== undefined) {
          devicePixelsSupported = true;
          parentDevicePixelWidth = deviceBox.inlineSize;
          parentDevicePixelHeight = deviceBox.blockSize;
        }
        const borderBox = entry.borderBoxSize && entry.borderBoxSize[0];
        if (borderBox) {
          parentWidth = borderBox.inlineSize;
          parentHeight = borderBox.blockSize;
        } else if (entry.contentRect) {
          parentWidth = entry.contentRect.width;
          parentHeight = entry.contentRect.height;
        }
      }
      handleResize();
    });
    resizeObserver.observe(host);
    return () => {
      if (resizeObserver) {
        resizeObserver.disconnect();
        resizeObserver = null;
      }
    };
  }

  /* visualViewport 缩放/旋转后 ResizeObserver 不会重新报尺寸，
     参考站的做法是直接重建 observer。 */
  function handleVisualViewportChange() {
    if (resizeObserver) {
      resizeObserver.disconnect();
      resizeObserver = null;
      setupResizeObserver();
      handleResize();
    }
  }

  function setupIntersectionObserver() {
    if (typeof IntersectionObserver !== 'function' || !host) return;
    intersectionObserver = new IntersectionObserver(([entry]) => {
      isInViewport = entry ? entry.isIntersecting : true;
      updateCurrentSpeed();
    });
    intersectionObserver.observe(host);
  }

  function handleVisibilityChange() {
    updateCurrentSpeed();
  }

  /* 上下文丢失/恢复。
     参考站完全不管这两个事件 —— 一旦丢上下文，画布就永久黑掉。
     这里多做三步：
       1. lost 时 preventDefault（不阻止的话浏览器不会再尝试恢复）；
       2. 立刻铺上 CSS 渐变兜底，保证"等待恢复"期间背景不是一块黑；
       3. restored 时重建 program / VBO / 贴图，撤掉兜底并继续动画。 */
  function handleContextLost(event) {
    event.preventDefault();
    contextLost = true;
    if (rafId !== null) cancelAnimationFrame(rafId);
    rafId = null;
    console.info('[shader] WebGL 上下文丢失，先铺 CSS 兜底，等待恢复…');
    applyCssFallback();
  }

  function handleContextRestored() {
    contextLost = false;
    for (const key of Object.keys(loc)) delete loc[key];
    program = null;
    quad = null;
    texture = null;
    if (!initResources()) {
      console.warn('[shader] 上下文恢复后重建失败，继续用 CSS 兜底');
      applyCssFallback();
      return;
    }
    clearCssFallback();
    handleResize();
    updateCurrentSpeed();
  }

  canvas.addEventListener('webglcontextlost', handleContextLost, false);
  canvas.addEventListener('webglcontextrestored', handleContextRestored, false);
  ownerDocument.addEventListener('visibilitychange', handleVisibilityChange);

  let teardownResizeObserver = null;

  /* ---------------------------------------------------------------- 启动 */

  /* 贴图来自内嵌 base64（与参考站逐字节相同）。
     仍然用 Image 解码，但不再依赖任何网络请求；失败只可能是数据损坏。 */
  function loadNoise() {
    return new Promise((resolve) => {
      const img = new Image();
      img.decoding = 'async';
      img.onload = () => resolve(img);
      img.onerror = () => resolve(null);
      img.src = GRAIN_NOISE_DATA_URL;
      if (typeof img.decode === 'function') {
        img.decode().then(
          () => resolve(img),
          () => resolve(img.complete && img.naturalWidth ? img : null)
        );
      }
    });
  }

  let booted = false;

  async function boot() {
    if (disposed || booted) return;
    booted = true;

    noiseImage = await loadNoise();
    if (disposed) return;
    if (!noiseImage) {
      console.warn('[shader] 噪声贴图解码失败，改用 CSS 兜底');
      applyCssFallback();
      return;
    }

    if (!initResources()) {
      console.warn('[shader] GrainGradient 初始化失败，改用 CSS 兜底');
      applyCssFallback();
      return;
    }

    // 先量一次尺寸，再交给 ResizeObserver 持续跟踪
    parentWidth = host?.clientWidth || 0;
    parentHeight = host?.clientHeight || 0;
    handleResize();
    teardownResizeObserver = setupResizeObserver();

    if (window.visualViewport) {
      window.visualViewport.addEventListener('resize', handleVisualViewportChange, {
        passive: true,
      });
    }

    setupIntersectionObserver();
    updateCurrentSpeed();
  }

  boot();

  return {
    fallback: false,
    setTheme() {},
    setAccent() {},
    setGrain() {},
    resize: handleResize,
    destroy() {
      if (disposed) return;
      disposed = true;
      if (rafId !== null) cancelAnimationFrame(rafId);
      rafId = null;
      ownerDocument.removeEventListener('visibilitychange', handleVisibilityChange);
      if (window.visualViewport) {
        window.visualViewport.removeEventListener('resize', handleVisualViewportChange);
      }
      if (teardownResizeObserver) teardownResizeObserver();
      if (resizeObserver) {
        resizeObserver.disconnect();
        resizeObserver = null;
      }
      if (intersectionObserver) {
        intersectionObserver.disconnect();
        intersectionObserver = null;
      }
      canvas.removeEventListener('webglcontextlost', handleContextLost, false);
      canvas.removeEventListener('webglcontextrestored', handleContextRestored, false);
      if (gl) {
        if (texture) gl.deleteTexture(texture);
        if (quad) gl.deleteBuffer(quad);
        if (program) gl.deleteProgram(program);
        const lose = gl.getExtension('WEBGL_lose_context');
        if (lose) lose.loseContext();
      }
      texture = null;
      quad = null;
      program = null;
      noiseImage = null;
      if (canvas.parentElement) canvas.parentElement.removeChild(canvas);
    },
    pause() {
      setCurrentSpeed(0);
    },
    resume() {
      updateCurrentSpeed();
    },
  };
}
