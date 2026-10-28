# Beat 2.3.2 — 导出中文乱码：根因、三条路线实测、落地方案

> 实测环境：macOS / node v26.11.1 / jsPDF 2.5.2（`vendor/jspdf.umd.min.js`, 365,730 B）
> 全部实验在 `/tmp/zhpdf/` 进行，`src/` 未改动一个字节。
> 产物已归档到 `design/artifacts/`。

---

## 1. 基线现象：中文在 PDF 里坏成什么样

**一句话结论：中文不是被丢弃，而是"UTF-16 码位被硬塞进 8-bit WinAnsi 字符串"——每个汉字拆成两个字节，各自当拉丁字形渲染，于是变成乱码符号，同时字符宽度翻倍导致整行拉伸错位。**

### 实测依据（可复现）

```bash
# 复现脚本
node /tmp/zhpdf/baseline.js
# 渲染
qlmanage -t -s 1400 -o /tmp/zhpdf/render /tmp/zhpdf/base.pdf
```

`new jsPDF(); doc.text('中文测试 Chinese Test',10,20)` 解压后内容流：

```
BT
/F1 16 Tf
28.3464566929133888 785.1970866141732586 Td
(N-e\x87mK\x8b\xd5\x00 \x00C\x00h\x00i\x00n\x00e\x00s\x00e\x00 \x00T\x00e\x00s\x00t) Tj
ET
```

字体资源：`/BaseFont /Helvetica`，`/Encoding /WinAnsiEncoding`，无 `FontFile2`、无 `ToUnicode`。

十六进制印证 —— `4e2d` = U+4E2D = 「中」，`6587` = U+6587 = 「文」：

| 输入 | 写入的字节 | WinAnsi 渲染成 |
|---|---|---|
| 中 (U+4E2D) | `4e 2d` | `N` `-` |
| 文 (U+6587) | `65 87` | `e` `‡` |
| 测 (U+6D4B) | `6d 4b` | `m` `K` |
| 试 (U+8BD5) | `8b d5` | `‹` `Õ` |

三处硬证据：

1. **字符数翻倍**：`\x00` 隔一个字节出现一次，纯 ASCII 也被撑成"全角"间距（截图里 `C h i n e s e   T e s t` 被拉开）。
2. **PDF 里没有 CJK 原始 UTF-8 字节**：`raw.includes(Buffer.from('中文测试','utf8')) === false`。
3. **`getFontList()` 只有五个标准字体**：
   ```
   helvetica / Helvetica / courier / Courier / times / Times / zapfdingbats / ZapfDingbats / symbol / Symbol
   ```
   全部是 PDF 标准 14 字体，**不含任何 CJK 字形，也没有 FontFile**。

截图：`design/artifacts/01-baseline-mojibake.png`
→ 实拍为 `N-e‡mK·Õ Chinese Test` / `W:fo Scene 1 - eö?? Duration 5s` / `Prepared for _O / ïyvïi‰Ê Project overview`。

**影响面**：所有走 jsPDF 的导出（Project overview / Treatment / Storyboard / Pitch deck / Shot list / Breakdown / Gear summary / Call sheet / Day sheet / Canvas→PDF / Contact sheet）。docx / csv / fountain / md / zip 不受影响（见 §5）。

---

## 2. 三条候选路线：PASS / FAIL

| | R1 嵌入子集字体 | R2 栅格化 addImage | R3 打印通道 window.print |
|---|---|---|---|
| **判定** | **PASS**（需外置字体文件） | **PASS**（机制成立，代价大） | **PASS**（需用户交互） |
| 依据一句话 | 子集 TTF 走 `addFileToVFS`+`addFont`+`setFont('cn')`，中文完美渲染且带 ToUnicode | 实例级覆盖 `pdf.text`，CJK 行渲成 PNG 再 `addImage`，几何换算与对齐均正确 | WebKit 已链接且二进制含 `printOperationWithPrintInfo`，WKWebView 支持 `window.print()` |
| **文本可选/可搜** | ✅ 有 `ToUnicode` CMap（`Identity-H` + `CIDFontType2`） | ❌ 纯位图 | ✅ 系统字体排版，完美 |
| **PDF 体积** | 固定 **+51 KB** 字体程序开销 + **≈200 B / 唯一汉字**；字体整篇只嵌一次 | 整页 A4 纯中文 @300dpi **+877 KB**；单行条 @300dpi **+14.4 KB**；1-bit 整页 +98 KB | 0（浏览器直接生成） |
| **内嵌 app.js（余量 17,766 B）** | ❌ FAIL：子集 1,683,652 B（b64 2,244,869 B），brotli 后 **1,021,068 B —— 超 57 倍** | ✅ 代码约 2 KB，装得下 | ✅ 代码约 3 KB，装得下 |
| **字体来源** | 必须外置一个 TTF | 无需字体文件（用系统 PingFang 渲染） | 无需字体文件 |
| **实现复杂度** | 中（字体子集 + 存储 + 一次性加载） | 中高（canvas 度量/基线/对齐/DPI 全套） | 低（生成 HTML + CSS `@page`） |
| **是否要用户交互** | ❌ 一键落盘 | ❌ 一键落盘 | ✅ 弹系统打印面板，用户手动「存储为 PDF」 |
| **清晰度** | 矢量，无限缩放 | 300dpi 等效清晰；缩放后发虚 | 矢量 |

### R1 关键实测数据

**字体格式是第一道坎（踩坑记录）**：

| 字体 | sfnt | 结果 |
|---|---|---|
| `/System/Library/Fonts/Hiragino Sans GB.ttc` face0 | `OTTO`（CFF/OTF） | ❌ jsPDF 2.5.2 只支持 TrueType `glyf`，报 `Cannot use 'in' operator to search for '0' in undefined` @ `glyphFor` |
| `/System/Library/Fonts/STHeiti Medium.ttc` face1 (STHeitiSC-Medium) | TrueType `glyf` | ⚠️ 原始 cmap 只有 `(0,4) format12`，报 `No unicode cmap for font`；**补一张 `(3,1) format4` 后 PASS** |
| `/System/Library/Fonts/Supplemental/Arial Unicode.ttf` | TrueType `glyf`，`(3,1) format4` | ✅ 开箱即用 |

> 结论：**别用 Hiragino**（CFF）；用 STHeiti SC（补 cmap）或 Arial Unicode。

**子集体积（保留 ASCII + GB2312 一级 3755 字 + 常用全角标点 = 3884 字符）**：

| 字体 | raw TTF | gzip -9 | brotli q11 | base64 |
|---|---|---|---|---|
| Arial Unicode 子集 | 858,380 B | 634,048 B | 576,188 B | 1,144,506 B |
| STHeiti SC 子集 | 1,683,652 B | 1,139,944 B | 1,021,068 B | 2,244,869 B |

**app.js 槽位实际余量（`node src/artifacts/tools/check_slots.js src/work/beat.fat.zh src/artifacts/embedded-web`）**：

```
OVER x86_64  index.html    slot=8874    new=8885   (+11)      ← 现存超标，非本次引入
OK   x86_64  app.js        slot=526767  new=509001 (-17766)   ← 余量 17,766 B
OK   x86_64  templates.js  slot=2264    new=2264   (-0)
（arm64 同上）
```

→ **46 KB 余量的说法已过时，实测只剩 17,766 B**。即便按最省的 brotli(576 KB) 也算 **超 32 倍**。**内嵌 app.js = 死路。**

**PDF 体积增长（Arial Unicode 子集 → jsPDF 输出）**：

```
唯一汉字数   PDF 体积    相对纯文本基线(3,157 B)
        0      54,430     +51,273   ← 字体程序固定开销
       50      61,471     +58,314
      200      88,808     +85,651
      500     147,929    +144,772
      800     212,309    +209,152   ← 单页最多 800 字，之后饱和
```
多页验证（1000 唯一字）：1 页 212,309 B / 5 页 276,723 B / 20 页 356,854 B
→ **字体每篇只嵌一份，页数增加的只是页面内容本身。**

**字体程序内嵌量**：80 个唯一字 → `FontFile2 Length1 = 55,156 B`（边际 ≈ 190–200 B/字）。

**渲染验证**：`design/artifacts/02-r1-font-ok.png` —— 「中文测试 Chinese Test」「场景 Scene 1 — 时长 Duration 5s」「Prepared for 张伟 / 项目概览 Project overview」「内景 咖啡馆 — 夜。李明把剧本放在桌上，抬头看了一眼窗外的雨。」全部正确。

**R1 的存放点（46 KB 槽位之外的四个选项）**：

| 方案 | 可行性 | 依据 |
|---|---|---|
| ① `convertFileSrc` 读 `~/Documents/Beat Projects` 下的 .ttf | ⚠️ 半可行 | **asset 协议没开**：二进制里只有 `tauri://localhost`，无 `asset.localhost`。`convertFileSrc` 走不通 |
| ② **打进 `.app` 资源 + `$RESOURCE` 读** | ✅ **推荐** | fs scope 含 `$RESOURCE`、`$RESOURCE/*`、`$RESOURCE/**`，权限名含 `allow-resource-read-recursive`；`window.__TAURI__` 已开（`withGlobalTauri`，二进制 4 处 `__TAURI__`）；`allow-read-file` / `allow-exists` 均在 |
| ③ 放 `~/Library/Application Support/io.beat.canvas/` | ✅ 可行 | scope 含 `$APPDATA`、`$APPDATA/*`、`$APPDATA/**`，权限含 `allow-write-file` / `allow-mkdir`。适合做首启缓存 |
| ④ 首次导出发网络下载 | ❌ 不推荐 | 本应用是离线工具；断网即失败，且引入失败分支 |
| ⑤ 干脆不用字体 | ❌ | 等于放弃 PDF 中文 |

**二进制里能直接读到的 scope 片段（原样）**：
```
$HOME/Documents/Beat Projects/**$HOME/**/Beat Projects/**$TMPDIR/beat-extract/**...
scope-resource$RESOURCE$RESOURCE/*scope-resource-indexscope-resource-recursive$RESOURCE/**
scope-app$APPCONFIG$APPCONFIG/*$APPDATA/*$APPLOCALDATA$APPLOCALDATA/*$APPCACHE$APPCACHE/*
```
`tauri 2.11.2` / `wry 0.55.1`

### R2 关键实测数据

**PIL + 系统 TTC 渲中文（`ImageFont.truetype('/System/Library/Fonts/Hiragino Sans GB.ttc', px, index=0)`）**，A4 170pt 宽 × 2000 字正文：

| DPI | 像素 | RGB PNG | 灰度 PNG | **1-bit PNG** |
|---|---|---|---|---|
| 150 | 354×1489 | 409 KB | 199 KB | 36 KB |
| 300 | 708×3019 | 877 KB | 443 KB | 98 KB |
| 600 | 1417×5989 | 1,782 KB | 936 KB | 229 KB |

**塞进 jsPDF 后的 PDF 体积**：

| 输入 | PDF |
|---|---|
| 纯文本基线 | 3,157 B |
| 整页中文 150dpi | 412,649 B |
| **整页中文 300dpi** | **879,773 B** |
| 整页中文 600dpi | 1,785,545 B |
| 整页中文 300dpi 灰度 | 446,415 B |
| 整页中文 300dpi 1-bit | 101,184 B |
| **单行条 300dpi** | **17,612 B（+14.4 KB/行）** |

**px → pt 换算（唯一正确的公式）**：
```
px_per_pt = dpi / 72
放置宽度(pt) = 图片像素宽 / px_per_pt
例：300dpi、11pt 正文 → 字号像素 = round(11 × 300/72) = 46 px；46 px 高对应 11 pt
```

### R2「包一层 pdf.text」决定性回答（父代理的问题）

**成立。** 已实测通过：

```bash
node /tmp/zhpdf/r2_wrapper.js
# cjkCalls=5  asciiCalls=0  PDF bytes=18012  IMAGES present: true
```

验证点：
1. **实例级覆盖可行** —— `pdf.text = function(){...}` 直接替换实例方法有效，jsPDF 内部调用会走到覆盖后的版本；
2. **状态跟踪可行** —— 包 `setFontSize` / `setTextColor` 拿到当前字号与颜色，供 canvas 端使用；
3. **ASCII 直通 / CJK 转图** 分流生效；
4. **`addImage` + `getImageProperties` 在数据 URL 上工作正常**（PDF 内出现 `/Subtype/Image`）；
5. **对齐换算生效** —— `align:'center'` → `x - w/2`；`align:'right'` → `x - w`；
6. **基线换算生效** —— jsPDF 的 `y` 是基线，图片左上角需 `y - fontSize × 0.88`（ascent 近似）。

**唯一卡点：node 里没有 canvas。** 浏览器（WKWebView）里 `document.createElement('canvas')` + `ctx.fillText` + `toDataURL('image/png')` 完全可用，所以这条路在 App 内成立。node 侧我用 PIL 预渲染的 PNG 顶替，验证的是 jsPDF 那一半。

**代价**：每行 CJK ≈ +14.4 KB。一份 20 页、40 行/页的镜头表 → 约 **11.5 MB**。这是 R2 唯一的问题，且不可压缩（PNG 已 delate）。

### R3 关键实测数据

**现状：`app.js` 里根本没有 `window.print()`。**

```bash
grep -n "window\.print(" src/artifacts/embedded-web/app.js   # 0 命中
grep -n "\.print()"        src/artifacts/embedded-web/app.js   # 0 命中
```

**「print」在现有代码里全是误命名** —— 这些函数名里的 print 指的是用 jsPDF 生成 PDF，不是浏览器打印：

| 函数 | 行 | 实际做什么 |
|---|---|---|
| `printShotListPdf(opts)` | 27961 | jsPDF 生成 Project overview PDF |
| `printStoryboardPdf(opts)` | 30039 | jsPDF 生成 Storyboard PDF |
| `exportPrintLayoutPdf()` | 28962 | jsPDF 生成 Canvas→PDF（`PL_DIMS` 画幅） |

`index.html` 里的 `#printFrames`(269)、`#printLayoutBar`(363)、`#plExportBtn`(376)、`#printDoc`(520) 都是 **Canvas print-layout 设计器** 的 DOM，**不是打印通道**。`#printDoc` 在 `app.js` 里 0 引用，是遗留死节点。

**WKWebView 打印可用性**：
```
otool -L beat.arm64 → /System/Library/Frameworks/WebKit.framework/Versions/A/WebKit (623.1.14)
strings  beat.arm64 → printOperationWithPrintInfo
```
WebKit 已链接且二进制内出现 `printOperationWithPrintInfo`（WKWebView 的 `window.print()` 正是走 `NSPrintOperation`）→ macOS 11+ 的 WKWebView 支持 `window.print()` 弹系统打印面板。

**最小验证步骤（人工一次）**：
1. 打开任一项目 → 导出中心 → `Canvas to PDF (print layout)` → 打开设计器；
2. DevTools Console 执行：
   ```js
   const w = window.open('', '_blank');
   w.document.write('<h1 style="font:24px PingFang SC">中文打印测试 場景 鏡頭</h1>');
   w.document.close(); w.print();
   ```
3. 期望：弹出 macOS 打印面板，预览里中文正常，右下角可选「存储为 PDF」。
   - 弹面板 = PASS；无反应 = 走 fallback（见 §6 风险）。

---

## 3. 推荐路线（一句话）

**首选 R1：把子集字体作为 `.app` 资源（`Contents/Resources/resources/cn-subset.ttf`），导出前用 `window.__TAURI__.fs.readFile(resolveResource(...))` 读入并 `addFileToVFS`+`addFont`——矢量、可选文本、一键落盘、每篇 PDF 只 +51 KB 固定开销 +200 B/字；R3 作为高质量/需可选中文本的第二出口；R2 只作为子集缺字时的单行回退。**

格式 × 路线对照：

| 导出格式 | 路线 | 说明 |
|---|---|---|
| Project overview / Shot list / Treatment / Storyboard / Pitch deck / Breakdown / Gear summary / Contact sheet / Call sheet / Day sheet（全部 jsPDF） | **R1** | 统一在 PDF 创建后 `await _pdfUseCNFont(pdf)` |
| Canvas→PDF（print layout） | **R1** 为主；新版可给 **R3** 选项 | 截图页本来就是位图，字体只影响矢量重绘层 |
| docx / csv / fountain / md / zip | **无需字体** | 见 §5 |
| 子集外生僻字 / 繁体 | **R2 单行回退** | 仅在 `!_cnFontHas(ch)` 时触发 |

---

## 4. 落地形态：改哪里、包什么

### 4.1 新增一个模块级函数（建议插在 `loadScript` 定义之后，约 app.js 17400 行附近）

```js
/* ===== 导出中文支持（PDF）=============================================
 * 字体：Contents/Resources/resources/cn-subset.ttf（GB2312 一级 3755 字 + ASCII + 全角标点）
 * 读取：Tauri fs 插件，scope 已含 $RESOURCE/**
 * 用法：const ok = await _pdfUseCNFont(pdf);  // 之后混排中文自动正确
 * ==================================================================== */
let _CN_FONT_B64 = null;      // 进程内缓存，只读一次
let _CN_FONT_CMAP = null;     // 字符集，用于缺字判定

async function _pdfLoadCNFont(){
  if(_CN_FONT_B64) return true;
  try{
    let path = null;
    const T = window.__TAURI__;
    if(T && T.path && T.path.resolveResource){
      path = await T.path.resolveResource('resources/cn-subset.ttf');
    }
    if(!path) return false;
    const bytes = await T.fs.readFile(path);          // ArrayBuffer | Uint8Array
    const u8 = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
    let s = '';
    for(let i=0;i<u8.length;i+=0x8000){
      s += String.fromCharCode.apply(null, u8.subarray(i, i+0x8000));
    }
    _CN_FONT_B64 = btoa(s);
    return true;
  }catch(e){ console.warn('[pdf-cn] font load failed', e); return false; }
}

async function _pdfUseCNFont(pdf){
  if(!pdf) return false;
  const ok = await _pdfLoadCNFont();
  if(!ok) return false;
  try{
    pdf.addFileToVFS('cn.ttf', _CN_FONT_B64);
    pdf.addFont('cn.ttf', 'cn', 'normal');
    pdf.setFont('cn');
    return true;
  }catch(e){ console.warn('[pdf-cn] addFont failed', e); return false; }
}
```

### 4.2 接入点：每个 `new jsPDF(...)` 之后一行

`grep -n 'new jsPDF' src/artifacts/embedded-web/app.js` 的全部位置，逐个在实例创建后插入 `await _pdfUseCNFont(pdf);`（这些函数都已是 `async`）：

| 函数 | 行 | `new jsPDF` 行 |
|---|---|---|
| `printShotListPdf` | 27961 | 27990 附近 |
| `exportTreatmentPdf` | 28386 | 28400 附近 |
| `exportPrintLayoutPdf` | 28962 | 28973 |
| `exportBreakdownPdf` | 29048 | 29060 附近 |
| `printStoryboardPdf` | 30039 | 30050 附近 |
| `exportPitchDeckPdf` | 30144 | 30165 附近 |
| `exportGearSummaryPdf` | 30282 | 30358 附近 |
| `exportContactSheetPdf` | 27885 | 27893 附近 |
| `exportCallSheetPdf` | 32004 | 32010 附近 |
| `exportOnsetDaySheet` | 32136 | 32145 附近 |

### 4.3 可选：R2 单行回退（缺字兜底）

```js
const _CJK_RE = /[\u2E80-\u9FFF\uF900-\uFAFF\u3000-\u303F\uFF00-\uFFEF]/;
function _pdfTextCN(pdf, text, x, y, opts){
  const s = Array.isArray(text) ? text.join('\n') : String(text == null ? '' : text);
  if(!_CJK_RE.test(s)) return pdf.text(text, x, y, opts);   // 纯 ASCII 直通，保留可选文本
  // 有 CJK：走 R2 位图兜底（仅在字体缺字时启用）
  const o = opts || {};
  const fs = (pdf.getFontSize && pdf.getFontSize()) || 11;
  const DPI = 300, S = DPI / 72;
  const px = Math.max(8, Math.round(fs * S));
  const c = document.createElement('canvas');
  const ctx = c.getContext('2d');
  const font = px + 'px "PingFang SC","Hiragino Sans GB",sans-serif';
  ctx.font = font;
  const w = Math.ceil(ctx.measureText(s).width) + 4;
  const h = Math.ceil(px * 1.45);
  c.width = w; c.height = h;
  ctx.font = font; ctx.textBaseline = 'alphabetic';
  ctx.fillStyle = o.color || '#000';
  ctx.fillText(s, 2, Math.round(px * 1.12));
  const url = c.toDataURL('image/png');
  const wPt = w / S, hPt = h / S;
  let px0 = x;
  if(o.align === 'center') px0 = x - wPt / 2;
  else if(o.align === 'right') px0 = x - wPt;
  pdf.addImage(url, 'PNG', px0, y - fs * 0.88, wPt, hPt, undefined, 'FAST');
  return pdf;
}
```

### 4.4 语言包接入：`T()` 取法

导出文案**复用现有 i18n 字典**，不新建一套：

```js
// 顶层加一次即可（app.js 已有 window.BeatI18n，见 31671 / 31723 / 33107）
const T = (s) => (window.BeatI18n && window.BeatI18n.t) ? (window.BeatI18n.t(s) || s) : s;
```

- `t()` 实现：`src/i18n/i18n.js:551`，`lookup()` 先精确匹配，再做连续空白归一化后重试；
- 字典文件：`~/Documents/Beat Projects/.beat-lang/zh-CN.json`，格式 `{"English": "中文"}`，**用户可直接编辑，不用重签**；
- 构建时兜底：`window.__BEAT_I18N_CORE__`；
- 现有词条 **2,353** 条（`src/lang/zh-CN.json`，213 KB）。

**包装示例**：
```js
doc.text(T('Shot list'), 40, 20);
doc.text(T('Project') + ' · ' + proj.name, 40, 34);   // 标签翻译，用户内容原样
```

> 关键：**只包固定标签，绝不包用户内容**（项目名、场景描述、备注、演员名）。用户内容永远原样输出。

### 4.5 构建侧改动（`build-all.sh` 之后追加）

```bash
# 1) 生成子集字体（一次性，已产出 design/artifacts/cn-subset-gb2312-L1.ttf）
# 2) 拷进 app 资源
cp design/artifacts/cn-subset-gb2312-L1.ttf \
   "$APP/Contents/Resources/resources/cn-subset.ttf"
# 3) 重签（现有 rebuild-menuzh.sh 已含 codesign --force --deep --sign -）
codesign --force --deep --sign - "$APP"
```

字体子集生成命令（已验证）：
```bash
/tmp/zhpdf/venv/bin/python - <<'PY'
from fontTools.ttLib import TTCollection, TTFont
from fontTools.ttLib.tables._c_m_a_p import CmapSubtable
from fontTools import subset
# GB2312 一级 3755 字 + ASCII + 常用全角标点
gb1=[]
for hi in range(0xB0,0xD8):
    for lo in range(0xA1,0xFF):
        try: gb1.append(bytes([hi,lo]).decode('gb2312'))
        except UnicodeDecodeError: pass
punct='，。、；：？！“”‘’（）《》【】—…·〈〉「」『』～￥％＋－×÷＝'
keep=''.join(chr(c) for c in range(0x20,0x7F))+punct+''.join(gb1)
TTCollection('/System/Library/Fonts/STHeiti Medium.ttc',lazy=False).fonts[1].save('/tmp/sc.ttf')
subset.main(['/tmp/sc.ttf','--text='+keep,'--output-file=/tmp/sc_sub.ttf',
  '--layout-features=','--no-hinting',
  '--drop-tables+=DSIG,LTSH,VDMX,hdmx,GDEF,GPOS,GSUB,mort,morx,kern,bsln,feat,meta',
  '--name-IDs=1,2,4,6','--recalc-bounds'])
# 关键：补 (3,1) format4，否则 jsPDF 报 "No unicode cmap for font"
f=TTFont('/tmp/sc_sub.ttf'); best=f['cmap'].getBestCmap()
sub=CmapSubtable.newSubtable(4); sub.platformID,sub.platEncID,sub.language=3,1,0; sub.cmap=dict(best)
f['cmap'].tables=[t for t in f['cmap'].tables if not (t.platformID==3 and t.platEncID==1)]
f['cmap'].tables.insert(0,sub); f.save('cn-subset.ttf')
PY
```

---

## 5. 本来就没问题的格式 + 固定英文标签清单

### 5.1 不需要字体方案的格式

| 格式 | 生成函数 | 行 | 为什么不用字体方案 |
|---|---|---|---|
| `.docx`（干净版/批注版） | `exportDocx(mode, include)` | 30678–31073 | 只写 OOXML，字体由 Word 决定；系统里没有中文字体时 Word 自动 fallback。**只需翻译固定标签** |
| `.csv`（单卡/全部） | `exportShotListCsv(node)` 19449、`exportAllShotListsCsv()` 19458 | — | 纯文本，加 `charset=utf-8` 即可；Excel 需考虑 BOM |
| `.fountain` | `buildFountainExport()` 29971、`exportFountainScaffold()` 30028 | — | 纯文本剧本格式 |
| `.md`（For AI chat） | `buildAiExportMarkdown(project, selectedPromptIds)` | 29485–29834 | 纯文本 |
| `.zip`（媒体打包） | `exportAllMediaZip()` | 26944–27051 | 只是打包，文件名保留原文 |
| `.png`（图片导出） | `exportImageSel(n)` 10639、`exportPlanImage()` 17793 | — | 位图 |
| 项目打包 | `exportProject(id)` 38843、`exportProjectsZip(ids)` 38865 | — | 序列化，不涉字体 |

### 5.2 固定英文标签合并清单：**200 条**

从 19 个导出函数的 352 个字符串字面量中，剔除 toast/进度/报错消息（如 `Building PDF…` / `PDF library failed to load`）与超长说明段落，去重后 **200 条固定文档标签**。

现有 `zh-CN.json` 已覆盖约一半（因为同名词条在界面上出现过），其余需新增。抽样对照：

| 英文标签 | 现状 | 建议中文 |
|---|---|---|
| `Shot list` | ✅ 已有 → 镜头表 | 镜头表 |
| `Project` | ✅ → 项目 | 项目 |
| `Duration` | ✅ → 时长 | 时长 |
| `Notes` | ✅ → 备注 | 备注 |
| `Storyboard` | ✅ → 分镜 | 分镜 |
| `Pitch deck` | ✅ → 提案演示 | 提案演示 |
| `Gear summary` | ✅ → 器材汇总 | 器材汇总 |
| `Cast` / `Location` / `Prop` | ✅ → 演员 / 地点 / 道具 | 演员 / 地点 / 道具 |
| `Address:` | ✅ → 地址： | 地址： |
| `Involves:` | ✅ → 涉及： | 涉及： |
| `Made with Beat` | ✅ → 用 Beat 制作 | 用 Beat 制作 |
| `Unassigned` | ✅ → 未分场 | 未分场 |
| `Palette` / `Checklist` / `Gallery` | ✅ → 配色 / 清单 / 图集 | 配色 / 清单 / 图集 |
| **`Scene`** | ❌ 缺 | 场景 |
| **`Prepared for`** | ❌ 缺 | 呈交 |
| **`Overview`** | ❌ 缺 | 概览 |
| **`Treatment`** | ❌ 缺 | 剧本阐述 |
| **`Breakdown`** | ❌ 缺 | 拆解表 |
| **`Section`** | ❌ 缺 | 段落 |
| **`Props`** | ❌ 缺 | 道具 |
| **`Notes:`** | ❌ 缺 | 备注： |
| **`Runtime`** | ❌ 缺 | 片长 |
| **`Shot:` / `Focus:`** | ❌ 缺 | 镜头：/ 焦点： |
| **`Call sheet`** | ❌ 缺 | 通告单 |
| **`Story document`** | ❌ 缺 | 故事文档 |
| **`Untitled`** | ❌ 缺 | 未命名 |
| **`C A L L   S H E E T`** | ❌ 缺 | 通 告 单（字距在代码里手工撑开，翻译后需同样处理） |
| **`W R A P   R E P O R T`** | ❌ 缺 | 收 工 报 告 |
| **`D A Y   S H E E T`** | ❌ 缺 | 日 程 单 |
| **`ELEMENT TALLIES`** | ❌ 缺 | 元素统计 |
| **`THOUGHT` / `NOTE` / `SKETCH` / `ALT` / `TC`** | ❌ 缺 | 思考 / 笔记 / 草图 / 备选 / 时码 |
| **`Lenses` / `Shot sizes` / `Camera moves` / `Lighting` / `Fixtures` / `Modifiers` / `Set and grip`** | ❌ 缺 | 镜头 / 景别 / 运镜 / 灯光 / 灯具 / 控光附件 / 置景与器械 |

**结构化标签表已集中在一处，优先改这个**：
```js
// app.js:28830
const PL_TYPE_LABELS = { note:'NOTE', thought:'THOUGHT', gallery:'GALLERY',
  character:'CHARACTER', location:'LOCATION', prop:'PROP', palette:'PALETTE',
  shotlist:'SHOT LIST', setplan:'SET PLAN', title:'TITLE' };
```
→ 改成 `const PL_TYPE_LABELS = { note:T('NOTE'), ... }`，一处覆盖 Canvas→PDF 与 Treatment 的全部类型标签。

完整 200 条在 `/tmp/zhpdf/labels_unique.json`（实验产物，未入库）。

---

## 6. 风险与回滚

| 风险 | 触发条件 | 处理 |
|---|---|---|
| **字体文件读不到** | `$RESOURCE` scope 与实际资源路径不符；或 codesign 后资源被拒 | `_pdfLoadCNFont()` 全部 try/catch，失败返回 `false`，导出继续用 helvetica（= 现状乱码，不崩）；日志打 `[pdf-cn] font load failed` |
| **子集缺字** | 用户输入生僻字 / 繁体 / 日文汉字 / emoji | ① 生成子集时把全集从 GB2312 一级扩到二级（6763 字，体积 1.68 MB→约 2.6 MB，PDF 体积不变，因为 jsPDF 只嵌用到的字）；② 或保留 §4.3 的 `_pdfTextCN` 单行位图兜底 |
| **Hiragino 不可用** | 若改用 Hiragino | jsPDF 不支持 CFF/OTF。**只用 glyf 字体**，且必须确保有 `(3,1)` 或 `(0,x)` unicode cmap，否则 `No unicode cmap for font` |
| **app.js 槽位不足** | 包装代码 + 接入点改动 > 17,766 B | 本次代码约 2–3 KB，安全。但 `index.html` 已 `OVER +11 B`，需先修（`check_slots.js` 会拦住构建） |
| **PDF 体积** | 大量唯一汉字 | 200 B/字，2000 字项目 ≈ +400 KB，可接受。storyboard 里图片本来就 MB 级 |
| **R3 打印无反应** | WKWebView 版本/用户手势限制 | `window.print()` 需用户手势触发（必须在 click 回调里直接调用，不能 `await` 之后）；无反应则回退 R1 |
| **翻译破坏排版** | 中文比英文长，表格列宽写死 | 需针对表格列宽（`HEAD_H`/`ROW_PAD`/`LINE` 在 20760 行）做中文列宽实测；建议中文标签≤4 字 |

### 回滚

```bash
# 前端资源回滚：从英文原件重建
bash /Users/zalo/Backups/IA/beta/build-all.sh /Applications/Beat.app.en.bak

# 只回滚字体资源（保留其他汉化）
rm -f /Applications/Beat.app/Contents/Resources/resources/cn-subset.ttf
codesign --force --deep --sign - /Applications/Beat.app

# 语言包回滚（用户可自行编辑，无需重签）
cp ~/Documents/Beat\ Projects/.beat-lang/zh-CN.json{,.bak}
```

**可重复性**：所有实验脚本在 `/tmp/zhpdf/`（`baseline.js`、`r1.js`、`r1_growth.js`、`r2.js`、`r2_wrapper.js`、`labels.js`）；字体与截图已归档 `design/artifacts/`。

---

## 附：实验产物清单

| 路径 | 内容 |
|---|---|
| `design/artifacts/01-baseline-mojibake.png` | 基线渲染：中文变 `N-e‡mK·Õ` 乱码 |
| `design/artifacts/02-r1-font-ok.png` | R1 渲染：中文完整正确 |
| `design/artifacts/cn-subset-gb2312-L1.ttf` | STHeiti SC 子集，3884 字符，1,683,652 B |
| `design/artifacts/r1-growth.json` | 体积增长测量原始数据 |
| `/tmp/zhpdf/base.pdf` `r1_stheitisc.pdf` `r2_real_300dpi.pdf` 等 | 各路线实测 PDF |
