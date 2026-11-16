# 浠诲姟娓呭崟锛堟湰杞細淇"閮ㄥ垎娴忚鍣ㄤ笉鏄剧ず棣栧睆绾圭悊"锛?
## 鑳屾櫙

涓婁竴杞凡鎶?apanzinc.top 鐨?GrainGradient **鐫€鑹插櫒**閫愬瓧鎼繃鏉ワ紝浣嗙嚎涓婁粛鏈夐儴鍒?娴忚鍣ㄥ畬鍏ㄧ湅涓嶅埌绾圭悊銆傛湰杞敤鍙鐜扮殑妫€娴嬫墜娈靛畾浣嶅埌锛?*闂涓嶅湪鐫€鑹插櫒锛屽湪杩愯鏃?*銆?
## 鍙栬瘉缁撹锛堝彲澶嶇幇锛?
鐢?`tools/shader-matrix.cjs` 鍚屾椂娴嬮噺鏈珯涓庣洰鏍囩珯锛屽悓涓€濂楁壈鍔ㄤ笅瀵规瘮锛?
| 鐢ㄤ緥 | 鐩爣绔?apanzinc.top | 鏈珯锛堜慨澶嶅墠锛?| 鏈珯锛堜慨澶嶅悗锛?|
| --- | --- | --- | --- |
| 甯歌 | decl=**highp**锛堣ˉ涓佺敓鏁堬級 | decl=**lowp** 鉂?| decl=**highp** 鉁?|
| 浣庣簿搴?GPU锛坢ediump=8/10锛?| 琛ヤ竵鐢熸晥锛屾甯?| 鍣０濉屾垚 0 鈫?**绾粦** 鉂?| 琛ヤ竵鐢熸晥锛屾甯?鉁?|
| 鏃?WebGL2 | 涓€鐗囬粦锛堟棤鍏滃簳锛?| CSS 娓愬彉鍏滃簳 | CSS 娓愬彉鍏滃簳 鉁?|
| 涓婁笅鏂囦涪澶?| **姘镐箙榛戝睆** | 涓€娆℃€?CSS 鍏滃簳 | 鍏滃簳 + 鑷姩閲嶅缓 鉁?|
| 璐村浘鍙栦笉鍒?| 涓嶅彈褰卞搷锛堝唴宓?base64锛?| 闈欓粯閫€鍖栨垚娓愬彉 鉂?| 涓嶅彈褰卞搷锛堝唴宓岋級鉁?|
| 鐖跺鍣ㄩ甯?0 楂?| ResizeObserver 鑷剤 | 鍋滃湪 300脳150 / 0脳0 鉂?| ResizeObserver 鑷剤 鉁?|

鍏抽敭璇佹嵁锛氭湰鏈?Chrome/SwiftShader 鐨?`getShaderPrecisionFormat(FRAGMENT_SHADER,
MEDIUM_FLOAT)` 杩斿洖 **10 bit**锛? 23锛夛紝鐩爣绔欑殑 PaperShaders 鍥犳鎶婄墖娈电潃鑹插櫒
鍏ㄩ儴鏀瑰啓涓?highp 鍐嶇紪璇戯紙`decl=highp`锛夛紱鑰屾湰绔欐棫鐗堟病鏈夎繖娈甸€昏緫锛屼粛浠?`precision lowp float;` 缂栬瘧锛坄decl=lowp`锛夈€傝繖姝ｆ槸"妗岄潰閮ㄥ垎鏈哄櫒姝ｅ父銆?绉诲姩绔?寮?GPU 涓€鐗囬粦"鐨勬牴鍥犮€?
## 宸插畬鎴?
- [x] 1. 鐢?`tools/extract-shader.cjs` 浠庣洰鏍囩珯 bundle 杩樺師鏈€缁?GLSL锛?      纭椤剁偣/鐗囨鐫€鑹插櫒涓庢湰浠撳簱鍐呭祵鐗堟湰**浠ょ墝绾у畬鍏ㄤ竴鑷?*锛堟帓闄ょ潃鑹插櫒宸紓锛?- [x] 2. 姣斿鍣０璐村浘锛氱洰鏍囩珯鍐呭祵 base64 瑙ｅ嚭鐨?PNG 涓?      `public/assets/img/grain-noise.png` **閫愬瓧鑺傜浉鍚?*
- [x] 3. 鏂板缓 `tools/shader-matrix.cjs`锛欳DP 椹卞姩鐨勫吋瀹规€х煩闃?      锛堝父瑙?/ 浣庣簿搴?GPU / 鏃?WebGL2 / 涓婁笅鏂囦涪澶?/ 璐村浘鍙栦笉鍒?/ 棣栧抚 0 灏哄 /
      鍑忓皯鍔ㄦ晥锛夛紝姣忕敤渚嬩竴涓嫭绔嬫祻瑙堝櫒瀹炰緥锛岃緭鍑烘埅鍥?+ 鍍忕礌缁熻 + 缂栬瘧鏃ュ織
- [x] 4. 鏂板缓 `tools/shader-nav.cjs`锛氶獙璇侀椤碘啋瀛愰〉鈫掗椤电汗鐞嗛噸寤恒€?      娴呰壊涓婚銆佺Щ鍔ㄧ DPR 3 涓嬬殑鐢诲竷灏哄
- [x] 5. 閲嶅啓 `src/lib/shader.js` 鐨勮繍琛屾椂锛岄€愭潯瀵归綈 PaperShaders锛?      - 绮惧害琛ヤ竵锛坄patchPrecision`锛?      - `getContext('webgl2')` 涓嶄紶灞炴€э紙鍘绘帀 `powerPreference`锛?      - ResizeObserver + `devicePixelContentBoxSize` + `maxPixelCount` 澶圭揣
      - visualViewport 鍙樺寲鍚庨噸寤?observer
      - IntersectionObserver + visibilitychange 鎺у埗 rAF
      - speed/currentSpeed 娓叉煋寰幆锛堝噺灏戝姩鏁?= speed 0锛屽彧鐢讳竴甯э級
      - Safari 鐨?devicePixelRatio 淇
- [x] 6. 鏂板 `src/lib/noise-texture.js`锛氭妸 128脳128 鍣０鍥?base64 鍐呭祵锛?      鍘绘帀瀵?`/assets/img/grain-noise.png` 鐨勭綉缁滀緷璧?- [x] 7. 棰濆澧炲己锛堝弬鑰冪珯娌℃湁鐨勶級锛歚webglcontextlost` 鍏堥摵 CSS 鍏滃簳銆?      `webglcontextrestored` 閲嶅缓 program/VBO/璐村浘 鍚庢挙鎺夊厹搴?- [x] 8. 鏋勫缓 + 鍏ㄧ煩闃靛洖褰掞紝娴呰壊/娣辫壊/绉诲姩绔?鎹㈤〉杩斿洖鍧囨甯革紝鎺у埗鍙版棤鎶ラ敊

## 楠屾敹缁撴灉

- 妗岄潰 1440脳900锛氱敾甯?2880脳1616锛屼笌鐩爣绔?*瀹屽叏涓€鑷?*
- 绉诲姩 390脳844 @3x锛氱敾甯?390脳769锛堣蛋 `devicePixelContentBoxSize` 鍒嗘敮锛屼笉瓒呴噰鏍凤級
- 浣庣簿搴?GPU 妯℃嫙涓嬩粛姝ｅ父鏄剧ず锛堣ˉ涓佺敓鏁堬級
- 棣栭〉 鈫?椤圭洰椤?鈫?棣栭〉锛氱汗鐞嗛噸寤哄苟缁х画鍔ㄧ敾
- 娴呰壊 / 娣辫壊涓婚鍧囨甯革紝鍚屼竴濂楅鑹茬敱椤甸潰搴曡壊鍐冲畾瑙傛劅
- 鎺у埗鍙版棤閿欒

## 澶囨敞

- `public/assets/img/grain-noise.png` 淇濈暀锛堜綋绉皬锛屼笖 `_research` 鑴氭湰浠嶅紩鐢級锛?  浣嗛灞忕汗鐞嗗凡涓嶅啀渚濊禆瀹?- `_research2/` 鏄彇璇佺敤鐨勭洰鏍囩珯浜х墿蹇収锛屼笉鍙備笌鏋勫缓
---

# 任务清单（上一轮：照搬 GrainGradient 着色器）

- [x] 1. 从 git `566c76f` 恢复 `assets/js/logo.js`
- [x] 2. 将提取出的 `grain-noise.png` 放入 `assets/img/`（128×128）
- [x] 3. 重写 `assets/js/shader.js` 为 apanzinc.top 同款 GrainGradient（原始顶点/片段着色器 + 2.2 参数 + 同款尺寸策略）
- [x] 4. 修改 `assets/js/main.js`（恢复 hero-logo、删除 runner、保留 veil 保证文字可读）
- [x] 5. 修改 `assets/css/components.css`（恢复 `.hero-logo`、删除 `.hero-avatar`/runner-canvas、恢复 5 处断点）
- [x] 6. 修改 `assets/js/labels.js`（POSTS → 同字体 `/ Posts` 矢量字标）
- [x] 7. 删除 `runner.js`、`runner-skeleton.glb`、`runner.buf`、`GLTFLoader.r112.js`、`three.r112.min.js`
- [x] 8. 起服务截图验证首页（深/浅/移动端）与文章页字标，修复问题
- [x] 9. 验证路由切换与控制台，提交并推送 `main`