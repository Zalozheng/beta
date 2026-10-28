# 界面英文残留 · 分类与补丁清单

样本 `Beat 2.3.2`（`io.beat.canvas`，Rust + Tauri 2 + WKWebView）｜分析只读：`src/artifacts/embedded-web/`（英文基线）、`src/work/zh/`（当前产物）、`src/i18n/i18n.js`、`src/lang/zh-CN.json`
产物：本文件 + `design/i18n-residual.json`（345 条，字段 `class/en/zh/where/note`）

---

## 0. 结论先行

界面英文残留是**五条互相独立的漏点**叠在一起，其中三条改规则就能一次收回一大片。

| 类 | 含义 | 已落库 | 全量口径 | 是否可补译 |
|---|---|---|---|---|
| A | 语言包缺条 / 键形态不可达 | **205** | 见 §2 | ✅ 加键 |
| B | 有译文却被运行时规则挡住 | **46** | **292 处** | ✅ 改规则 |
| C | 拼接串（片段 + 动态值） | **53** | 157 个拼接站 | ✅ 加归一化匹配 |
| D | `innerHTML` / `confirm` / `prompt` 现场拼 | **27** | 55 个站 | ⚠️ 包 `t()` |
| E | 非 DOM 面（title / canvas / 原生对话框） | **14** | 26 处 | ⚠️ 专门通道 |

**A + B + C 可补译合计 = 304 条。**

最值钱的三个单项：

1. `i18n.js:36` 的 `SKIP_SEL` 里有 `select,option` —— **14 个下拉框的选项原样英文**，而其中 14 条译文语言包里早就有了（`Newest`→最新、`A4 landscape`→A4 横向、`Say nothing — I update by hand`→不提示·我手动更新 …）。
2. 语言包**键形态**问题：144 条键带前导/尾随空格、82 条键里留着未解转义的 `\n` `\u2014` `\'`、22 条键是整段 HTML、2 条键超 400 字符 —— 约 **250 条译文永远命中不了**（`applyTextNode` 先 `trim()` 再查表，`lookup()` 只做两级）。
3. `MAX_TEXT_LEN=400` 与 `trimmed.indexOf('\n')>=0` 两道闸**排在空白折叠兜底之前**：`index.html:581` 那段跨行欢迎语就是被这一刀切掉的，而且折叠兜底本来能救它。

外部线索对齐：主会话实测启动只翻 261 个文本节点、之后每秒 0 命中 —— 与本报告「290+ 条死键 + 157 个拼接站 + 首屏之后 DOM 不再有可命中的整串」的判断一致。

---

## 1. 机制：为什么有译文还是英文

```
MutationObserver / boot() → applyTree → applyTextNode(node)      i18n.js:279
    trimmed = raw.trim()                    ← 先 trim：带前导空格的键必死
    > MAX_TEXT_LEN (400) → return           i18n.js:284
    含 '\n' → return                        i18n.js:285   ← 在折叠兜底之前
    !inTranslatableContext(node) → return   i18n.js:286   ← SKIP_SEL 一票否决
    zh = lookup(trimmed)                    i18n.js:255   ← 只精确 + 空白折叠两级
applyAttrs(el)                              i18n.js:298   ← 同样 400 + \n 限制
applyTitle()                                i18n.js:422   ← document.title 只整串查表
```

| 根因 | 证据 | 影响面 |
|---|---|---|
| ① 键形态 ≠ 运行期文本形态 | 144 空格键 / 82 转义键 / 22 HTML 键 / 2 长键 | 约 250 条死条目 |
| ② `SKIP_SEL` 过宽 | `i18n.js:36` `select,option`；`:37` `kbd` | 下拉框 + 快捷键说明 |
| ③ 长度/换行闸早于兜底 | `i18n.js:284-285` | 跨行文案、长说明段 |
| ④ 只有整串精确匹配 | `i18n.js:255-266` | 所有 `'…' + n + '…'` 拼接串 |
| ⑤ 非 DOM 面没进链路 | `document.title`(39310/39327/40694)、`fillText`(3779/5207)、rfd 标题(639/643/25917/37503/37972/39010/41539/41608)、`confirm`×6 / `prompt`×4 | 标题、画布空态、系统对话框 |

---

## 2. A 类 · 语言包缺条（205 条）

### 2.1 构成

- **127 条**：我自己从 `app.js` / `index.html` 的 UI 出口逐条回源核出来（每条都能指到行号，§7 有 20 条抽样 + 全量 127/127 自动化回源）。
- **78 条**：以主会话给的 `/tmp/ui_candidates.json`（578 条严格 UI 形态候选，全部不在包里）为底稿，判出**确实会显示**的短标签 —— 主要是分镜表列头（`Size/Width/Height/Type/Scene/Date/Focus`）、Inspector 字段名（`Field/Length/Angle/Tone/Address/Remaining`）、实体分类名（`Characters/Locations/Props/Cameras/Lenses/Fixtures/Modifiers/Wardrobe`）、导出小节名（`Notes/References/Cast/Colours/Timecode/Author`）、成对按钮动词（`Include/Export/Import/Auto/Manual/Lock/Unlock`）。

### 2.2 前 40 条样例

| # | en | 建议 zh | where | 说明 |
|---|---|---|---|---|
| 1 | New dark theme — cool slate with a warm amber accent. | 新的深色主题 —— 冷调石板灰，配暖琥珀色点缀。 | `app.js:2816` | _markOnboardingDone 的 changelog 文案，渲染进 What's new 弹层 |
| 2 | Infinite story canvas: beats, connections, characters / locations / props, groups, templates. | 无限故事画布：节拍、连线、角色 / 地点 / 道具、分组、模板。 | `app.js:2833` | 同上 |
| 3 | Beat is free and shaped by the people who use it. | Beat 免费，由使用它的人一起塑造。 | `app.js:2692` | What's new 弹层的社区段 |
| 4 | Everyone whose suggestion or bug report ships gets credited here. | 每条被采纳的建议与 bug 报告，都会在这里署名致谢。 | `app.js:3205` | 鸣谢区空态说明 |
| 5 | Your name could be here. Beat is shaped by the people who use it — | 你的名字也可以出现在这里。Beat 由使用它的人一起塑造 —— | `app.js:3187` | 鸣谢区空态，末尾接 <a> 链接 |
| 6 | The on-canvas shot spreadsheet — scenes, columns, totals. | 画布上的分镜表 —— 场景、列、合计。 | `app.js:33307` | Tour hub 卡片简介 |
| 7 | Room size — sets the floor and the real-world scale. (You can also drag the floor’s bottom-right corner.) | 房间尺寸 —— 决定地面与真实比例。（也可以拖地面右下角来改。） | `app.js:17745` | Set Plan 尺寸浮层说明 |
| 8 | Claude is editing… | Claude 正在编辑… | `app.js:40757` | Claude 连接状态条 |
| 9 | Claude updated this project · | Claude 更新了这个项目 · | `app.js:40785` | Claude 重载提示前缀 |
| 10 | Bring to front | 移到最前 | `app.js:17707` | Set Plan 元素右键菜单 |
| 11 | Send to back | 移到最后 | `app.js:17712` | 同上 |
| 12 | Bring forward | 上移一层 | `app.js:17708` | 同上 |
| 13 | Send backward | 下移一层 | `app.js:17711` | 同上 |
| 14 | Free on canvas | 画布内自由摆放 | `app.js:26967` | 素材库条目所在位置标签 |
| 15 | Description… | 描述… | `app.js:13172` | 素材库卡片占位/按钮 |
| 16 | Custom… | 自定义… | `app.js:17538` | Set Plan 机身/镜头下拉的自定义项 |
| 17 | Spherical (1×) | 球面（1×） | `app.js:17552` | 镜头畸变下拉项 |
| 18 | Export .docx | 导出 .docx | `app.js:26488` | 导出中心按钮 |
| 19 | Basic shapes | 基础形状 | `app.js:5677` | Set Plan 素材面板分组 |
| 20 | Set & grip | 布景与器械 | `app.js:5686` | 同上 |
| 21 | Untitled section | 未命名段落 | `app.js:27412` | 写作页段落默认名 |
| 22 | Untitled shot | 未命名镜头 | `app.js:32219` | On set 分镜默认名 |
| 23 | Unnamed character | 未命名角色 | `app.js:29695` | 角色卡默认名 |
| 24 | Unnamed location | 未命名地点 | `app.js:29706` | 地点卡默认名 |
| 25 | Unnamed prop | 未命名道具 | `app.js:29722` | 道具卡默认名 |
| 26 | First time here? | 第一次来？ | `app.js:38144` | 项目面板引导入口 |
| 27 | Search by Photon · OpenStreetMap | 搜索由 Photon · OpenStreetMap 提供 | `app.js:36387` | 地点搜索框下的署名行 |
| 28 | In exports | 导出时包含 | `app.js:31472` | 导出包含项标签 |
| 29 | Not set yet | 尚未设置 | `app.js:31697` | 偏好设置素材库路径空态 |
| 30 | Move them | 移动它们 | `app.js:34830` | 存储清理对话框按钮 |
| 31 | Something went wrong | 出了点问题 | `app.js:37418` | Claude 连接错误提示 |
| 32 | Moved. | 已移动。 | `app.js:37792` | 素材库迁移结果 |
| 33 | Copied. | 已复制。 | `app.js:37792` | 同上 |
| 34 | Export failed | 导出失败 | `app.js:38847` | 导出中心 |
| 35 | Imported project | 已导入项目 | `app.js:38905` | 导入结果 |
| 36 | Importing… | 正在导入… | `app.js:41541` | 导入进度 |
| 37 | Capturing… | 正在抓取… | `app.js:37101` | 视频抽帧进度 |
| 38 | Location saved | 地点已保存 | `app.js:37188` | 地图节点 |
| 39 | Location pinned from the photo | 已按照片定位 | `app.js:14671` | 照片带 EXIF 时的提示 |
| 40 | Map style unavailable (offline?) | 地图样式不可用（离线？） | `app.js:13430` | 地图降级提示 |

### 2.3 从 578 条里**判掉**的（保留英文）

| 类别 | 例子 | 理由 |
|---|---|---|
| 剧本术语缩写 | `INT` `EXT` `CU` `MCU` `EWS` `OTS` `MED` `ECU` `PRE` `POST` | 行业术语，中文剧本同样用缩写 |
| 相机/画幅库 | `ARRI ALEXA 35`、`Sony VENICE 2 (8.6K)`、`ANSI S35 3-perf`、`MFT 17.3x13.0`（40+ 条） | 品牌型号与传感器规格 |
| 人名 | `Stephen Follows`、`Casey Cross`、`Chris Walton (Steyer)`（18 条） | 鸣谢署名 |
| 键盘键名 | `Esc` `Enter` `Backspace` `ArrowUp` `Home` `Tab` | 键帽上的字，与实体键盘一致 |
| 月份缩写 | `Jan` `Feb` `Mar` `Sep` `Oct` | 日期格式化产物，应由 `toLocaleDateString('zh-CN')` 出中文 |
| 颜色值 / 单位 / HTML 标签名 | `FFFFFF` `E4DCD5` `KB` `MB` `GB` `THEAD` `BLOCKQUOTE` | 代码常量 |
| 数据结构 key | `BeatH1` `BeatH2` `BeatKicker` `CObody` `BeatTitle` | 内部字段名，不上屏 |
| 示例项目剧情正文 | `Vanilla Dream`、`Turn Me On`、`Jambu Vibes / Magnetic Cards` | 生成的示例内容，属用户数据 |

### 2.4 改法

**(1) 补键**（`src/lang/zh-CN.json`，键用运行期文本节点形态，无前导/尾随空格）：

```json
"+ Add element": "+ 添加元素",
"Could not save folders": "文件夹保存失败",
"Drag on empty canvas": "拖动空白画布",
"Preferences — your library folder, your name & credit on exports": "偏好设置 —— 素材库文件夹、你的名字与导出署名"
```

**(2) 键规范化**（在 `src/artifacts/tools/make_lang_pack.py` 生成阶段做一次，收回 144 + 82 条死键）：

```python
ESC = re.compile(r'\\(u[0-9a-fA-F]{4}|x[0-9a-fA-F]{2}|.)')
def unescape_js(s):
    def rep(m):
        g = m.group(1)
        if g[0] == 'u' and len(g) == 5: return chr(int(g[1:], 16))
        if g[0] == 'x' and len(g) == 3: return chr(int(g[1:], 16))
        return {'n': '\n', 't': '\t', 'r': '\r'}.get(g, g)
    return ESC.sub(rep, s)

def normalize_key(k):
    k = unescape_js(k)          # '\u2014 it is…' -> '— it is…'
    k = k.strip()               # 去掉 144 条的前导/尾随空格
    k = re.sub(r'\s+', ' ', k)  # 折行压成单空格
    return k

clean = {}
for k, v in pack.items():
    nk = normalize_key(k)
    if not nk or ('<' in nk and '>' in nk):   # 整段 HTML 键不进包（见 B5）
        continue
    clean.setdefault(nk, v)
```

改完 `python3 src/artifacts/tools/split_lang_pack.py` 重切分片 + 在设置里切一次语言即生效，不重建 App。

---

## 3. C 类 · 拼接串（53 个模式 / 157 个拼接站）★ 重点

`app.js` 几乎没有模板字面量（全文只有 6 处 `${`），拼接全靠 `+`，所以文本节点拿到的是**拼好的整句**：

```js
// app.js:1192
hd.textContent = 'Appears in ' + beats.length + (beats.length === 1 ? ' beat' : ' beats');
// 节点值是 "Appears in 3 beats"；包里的 'Appears in ' 片段键永远匹配不到

// app.js:38483
msg = 'Delete project "' + ((p && p.name) || 'Untitled') + '"?\nThis cannot be undone.';
// 引号 + 项目名 + 换行，精确匹配 0 命中，还额外踩 \n 闸
```

### 3.1 20 个真实样例

| # | en | 建议 zh | where | 说明 |
|---|---|---|---|---|
| 1 | Appears in {n} beats | 出现在 {n} 个节拍中 | `app.js:1192` | 'Appears in ' + n + (n===1?' beat':' beats')，包里有 'Appears in ' 片段键但从没机会命中 |
| 2 | Delete project "{q}"?\nThis cannot be undone. | 删除项目「{q}」？\n这一步撤不回来。 | `app.js:38483` | 拼接 + 换行，双重卡死 |
| 3 | Saved to Downloads — {file} | 已保存到「下载」文件夹 —— {file} | `app.js:27662` | 'Saved to Downloads — ' + filename |
| 4 | Scene total: {dur} | 场景合计：{dur} | `app.js:22532` | textContent 拼接 |
| 5 | Jump to {name} | 跳到 {name} | `app.js:12074` | chip.title 拼接 |
| 6 | Jump to {name} · {date} · sun {deg}°, {deg}° high (local time) | 跳到 {name} · {date} · 太阳 {deg}°、高度 {deg}°（本地时间） | `app.js:14049` | 四个动态值串在一条 title 里 |
| 7 | Day {n} | 第 {n} 天 | `app.js:21579` | 'Day ' + n |
| 8 | Shot {n} | 镜头 {n} | `app.js:18827` | 'Shot ' + idx |
| 9 | Column {name} | 列 {name} | `app.js:19597` | 'Column ' + name |
| 10 | Est. {dur} | 预计 {dur} | `app.js:20936` | 'Est. ' + dur |
| 11 | Duration: {dur} | 时长：{dur} | `app.js:28292` | 'Duration: ' + v |
| 12 | Move {n} unused files to .trash | 把 {n} 个没用到的文件移到 .trash | `app.js:34826` | 'Move ' + n + ' unused file' + (n===1?'':'s') + ' to .trash' |
| 13 | Reset to {name} | 重置为 {name} | `app.js:35284` | 'Reset to ' + tplName |
| 14 | Beat {ver} is on its way to your Downloads | Beat {ver} 正在下载到「下载」文件夹 | `app.js:39278` | 'Beat ' + info.version + ' is on its way …' |
| 15 | Beat {ver} is out | Beat {ver} 已发布 | `app.js:39278` | 同上另一分支 |
| 16 | Page {n} added to Vault | 第 {n} 页已加入保险库 | `app.js:41181` | 'Page ' + p + ' added to Vault' |
| 17 | Timecode {dur} — click to open the audio timeline there | 时间码 {dur} —— 点这里打开对应的音频时间轴 | `app.js:13812` | title 拼接 |
| 18 | Wrapped {date} · {n} carried to {day} | 已收工 {date} · {n} 条带到 {day} | `app.js:32722` | 三处动态值 + 可选片段 |
| 19 | Saved {n}, skipped {n} (storage error) | 已保存 {n} 个，跳过 {n} 个（存储出错） | `app.js:15939` | 三段拼接，其中一段是括号说明 |
| 20 | Could not read "{q}" | 读取「{q}」失败 | `app.js:20516` | 'Could not read "' + name + '"' |

### 3.2 归一化 + 回填：完整实现草案（不落地）

模式键在语言包里用 `~pat:` 前缀隔离，避免与普通文案键冲突；`SLOT_RULES` 顺序敏感 —— 越具体的形态越先换。

```js
/* ===== i18n.js 新增：模式匹配（草案） ===== */
var PAT_PREFIX = '~pat:';

var SLOT_RULES = [
  [/\b\d{1,3}:\d{2}(?::\d{2})?\b/g, '\u0000dur'],                          /* 1:23:45 时间码 */
  [/\b\d+(?:\.\d+)?\s?(?:min|mins|minutes|h|hr|hrs|hours|s|sec|secs|seconds)\b/gi, '\u0000dur'],
  [/-?\d+(?:\.\d+)?°/g, '\u0000deg'],                                        /* 角度 */
  [/\b\d{4}-\d{2}-\d{2}(?:T[\d:.]+Z?)?\b/g, '\u0000date'],                 /* ISO 日期 */
  [/\b\d{1,2}\s+(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*\.?(?:\s+\d{4})?\b/g, '\u0000date'],
  [/"[^"\n]{0,120}"/g, '\u0000q'],                                            /* 直引号里的名字 */
  [/[\u201c][^\u201d\n]{0,120}[\u201d]/g, '\u0000q'],                       /* 弯引号 */
  [/\u300c[^\u300d\n]{0,120}\u300d/g, '\u0000q'],                           /* 中文引号 */
  [/(?:\/[\w .-]+){2,}/g, '\u0000path'],
  [/\b[\w.-]+\.(?:beat|beattemplate|json|png|jpe?g|gif|webp|svg|mp4|mov|pdf|docx|md|zip|fountain|csv)\b/gi, '\u0000file'],
  [/\bv?\d+\.\d+(?:\.\d+)?\b/g, '\u0000ver'],                             /* 版本号 */
  [/\b\d{1,6}\b/g, '\u0000n']                                                /* 纯数字：最后 */
];
/* 用 \u0000 当槽位标记：它绝不会出现在正常文案里，天然不与「{0}」「…」「⌘」冲突 */

function normalizeWithSlots(s) {
  var slots = [], out = s;
  for (var i = 0; i < SLOT_RULES.length; i++) {
    var rx = SLOT_RULES[i][0], kind = SLOT_RULES[i][1];
    out = out.replace(rx, function (m) { slots.push({ k: kind, v: m }); return kind; });
  }
  return { pattern: out.replace(/\s+/g, ' ').trim(), slots: slots };
}

/* 回填：按种类找槽位，同名多次出现按出现顺序取 */
function fillSlots(tpl, slots) {
  var cursor = 0;
  return tpl.replace(/\u0000[a-z]+/g, function (m) {
    for (var j = cursor; j < slots.length; j++) {
      if (slots[j].k === m) { cursor = j + 1; return slots[j].v; }
    }
    return '\u0000';                              /* 找不到 → 让外层判定失败，绝不输出半个句子 */
  });
}

function lookupPattern(s) {
  var r = normalizeWithSlots(s);
  var tpl = state.dict[PAT_PREFIX + r.pattern];
  if (typeof tpl !== 'string' || !tpl) return null;
  var out = fillSlots(tpl, r.slots);
  return out.indexOf('\u0000') >= 0 ? null : out;
}

/* lookup() 加第三级：精确 → 空白折叠 → 模式 */
function lookup(s) {
  if (!s) return null;
  var v = state.dict[s];
  if (typeof v === 'string' && v && v !== s) return v;
  var collapsed = s.replace(/\s+/g, ' ');
  if (collapsed !== s) {
    v = state.dict[collapsed];
    if (typeof v === 'string' && v && v !== collapsed) return v;
  }
  return lookupPattern(collapsed);
}
/* ======================================== */
```

语言包侧（与 JSON 里 C 类一一对应）：

```json
"~pat:Appears in \u0000n beats": "出现在 \u0000n 个节拍中",
"~pat:Delete project \u0000q? This cannot be undone.": "删除项目\u0000q？这一步撤不回来。",
"~pat:Saved to Downloads — \u0000file": "已保存到「下载」文件夹 —— \u0000file",
"~pat:Jump to \u0000q · \u0000date · sun \u0000deg°, \u0000deg° high (local time)": "跳到\u0000q · \u0000date · 太阳 \u0000deg°、高度 \u0000deg°（本地时间）",
"~pat:Move \u0000n unused files to .trash": "把 \u0000n 个没用到的文件移到 .trash"
```

要点：
1. **单复数各建一条**（`unused file` / `unused files`）—— 归一化只吃数字、不猜英文复数，两条键成本极低。
2. 数字规则**最后**，日期/时长/版本号先命中，避免 `2025-01-31` 被拆成三个数字槽。
3. 引号规则吃「名字」，回填时连原引号一起塞回，产出是 `「My Project」` 而不是半角引号混排。
4. 回填不完整（残留 `\u0000`）就返回 `null`，界面保持英文 —— 宁可漏译，不输出半句中文。
5. 只在 `inTranslatableContext()` 通过后才走，用户正文容器（`.wd-body` / `.n-body` …）依旧不参与。
6. `\n` 闸必须先于 lookup 放开（见 §4），否则 `Delete project "X"?\nThis cannot be undone.` 这类多行 confirm 文案连查表机会都没有。

### 3.3 备选兜底：片段子串替换（不改语言包即可生效）

包里已有 166 条「片段键」（`'Appears in '`、`'Saved to Downloads — '`、`'"?\nThis cannot be undone.'`）。按长度降序做子串替换，能立刻救活它们：

```js
var _frag = null;
function fragTable() {
  if (_frag) return _frag;
  _frag = Object.keys(state.dict)
    .filter(function (k) { return k.length >= 5 && (k !== k.trim() || /["\u201c\u300c]/.test(k) || /["\u201d\u300d]\s*$|[.?!:]\s*$/.test(k)); })
    .sort(function (a, b) { return b.length - a.length; })
    .map(function (k) { return [k, state.dict[k]]; });
  return _frag;
}
function lookupSpliced(s) {
  var out = s, hits = 0, t = fragTable();
  for (var i = 0; i < t.length; i++) {
    if (t[i][0].length < 5 || out.indexOf(t[i][0]) < 0) continue;
    out = out.split(t[i][0]).join(t[i][1]);
    if (++hits > 4) break;
  }
  if (!hits || !/[\u4e00-\u9fff]/.test(out)) return null;
  return out;
}
```
过渡手段：替换顺序敏感、易误拼，正式方案仍走 §3.2。

---

## 4. B 类 · 有译文被规则挡住（46 条 / 全量 292 处）

| 子类 | 全量 | 代表 | 挡在哪 |
|---|---|---|---|
| B1 `select`/`option` | 14 | `Newest` `A4 landscape` `Say nothing — I update by hand` | `SKIP_SEL` 含 `select,option`（i18n.js:36） |
| B2 `kbd` | 2 | `click canvas` `drag + A` | `SKIP_SEL` 含 `kbd`（i18n.js:37） |
| B3 含 `\n` | 1 节点 + 18 字面量 | `index.html:581` 欢迎语 | `i18n.js:285` 早于折叠兜底 |
| B4 >400 字符 | 7 | `Every camera on a Set Plan now carries…`（672 字） | `i18n.js:284` |
| B5 包里是整段 HTML | 22 | 包里键 `' behind sched</b>'`，节点只有 `behind sched` | 键形态错 |
| B6 键带空格 | 144 | 包里 `' (storage error)'`，节点 `(storage error)` | `trim()` 后查表 |
| B7 键带转义 | 82 | 包里 `"Can\'t connect a beat to itself"` | 字面量没解转义 |

代表样例：

| # | en | 建议 zh | where | 说明 |
|---|---|---|---|---|
| 1 | Newest | 最新 | `index.html:142` | <option> 被 SKIP_SEL 的 select,option 整段跳过；包里已有此条 |
| 2 | By type | 按类型 | `index.html:144` | 同上 |
| 3 | A4 landscape | A4 横向 | `index.html:365` | 同上（页面尺寸下拉） |
| 4 | A4 portrait | A4 纵向 | `index.html:365` | 同上 |
| 5 | Letter landscape | Letter 横向 | `index.html:365` | 同上 |
| 6 | Letter portrait | Letter 纵向 | `index.html:365` | 同上 |
| 7 | Dragging empty canvas | 拖动空白画布 | `index.html:479` | 导航设置下拉 |
| 8 | Middle or Ctrl drag (left drag selects) | 中键或 Ctrl 拖动（左键拖动为框选） | `index.html:479` | 同上 |

### 4.1 放开规则（三条硬护栏一条都不放松）

```js
/* 改动 A：SKIP_SEL —— 只放掉 App 自己生成的控件 */
var SKIP_SEL = [
  'script','style','noscript','canvas','svg','textarea','select','option',
  'code','pre','iframe','video','audio','math','[translate="no"]',
  '[data-i18n-skip]','[contenteditable=""]','[contenteditable="true"]',
  '.wd-body','.wd-elem-note','.n-body','.nb-body','.n-note-body','.n-body-preview',
  '.card-body','.node-body','.beat-body','.shot-body',
  '.shootday-notes','.news-textarea','.info-textarea','.onset-cardpop-text',
  '.snapshot-body','.doc-viewer-sheet-body','.doc-viewer-body','.sl-custom'
].join(',');
```
- **删 `select` / `option`**：`<option>` 的文本是 App 的枚举，`<select>` 收起来时显示的也是这段文本 —— 当前最显眼的一片英文就来自这里。
- **删 `kbd`**：里面是 `click canvas`、`drag + A` 这类说明词（纯符号 `⌘ Z` 照样查不到表，无副作用）。
- `code` / `pre` / `textarea` / `contenteditable` / 所有 `.xxx-body` 一律保持跳过。

```js
/* 改动 B：闸门顺序 —— 先折叠空白再判长度；换行不再一票否决 */
function applyTextNode(node) {
  if (state.lang === 'en') return 0;
  var raw = node.nodeValue; if (!raw) return 0;
  var trimmed = raw.trim(); if (!trimmed) return 0;
  var flat = trimmed.replace(/\s+/g, ' ');          /* 折行只是源码排版 */
  if (!inTranslatableContext(node)) return 0;
  if (flat.length > (longTextAllowed(node) ? 2000 : MAX_TEXT_LEN)) return 0;
  var zh = lookup(flat); if (!zh) return 0;
  var at = raw.indexOf(trimmed); if (at < 0) return 0;
  if (!origText.has(node)) origText.set(node, raw);
  setText(node, raw.slice(0, at) + zh + raw.slice(at + trimmed.length));
  return 1;
}

/* 长文白名单：只认 App 自己的说明容器，白名单之外仍按 400 字砍 */
var LONG_OK = '.whatsnew-intro,.whatsnew-list,.whatsnew-item,.credits-note,.credits-footer,'
            + '.tourhub-sub,.tourhub-blurb,.onboard-body,.onboard-title,.ui-confirm-msg,'
            + '.lc-lead,.lc-step-body,.welcome-body,.proj-empty-hint,.snapshot-title,'
            + '.debug-panel,[data-i18n="long"]';
function longTextAllowed(node) {
  var el = node.nodeType === 1 ? node : node.parentElement;
  if (!el || !el.closest) return false;
  if (el.closest('[contenteditable=""],[contenteditable="true"]')) return false;
  return !!el.closest(LONG_OK);
}
```
- 三条护栏不动：`contenteditable`、`.xxx-body` 正文容器、`[data-i18n-skip]`。
- 长文只放白名单容器 → 即使白名单配错，命中的也只是 App 自带说明段（用户正文永远在 `.wd-body` / `.n-body` 里，仍被 `SKIP_SEL` 拦死）。
- 白名单里的长文还必须在 `zh-CN.json` 里有整条译文才会被换 —— 加不进去就不动，天然安全。

---

## 5. D 类 · 动态写入（27 条 / 55 站）

`app.js` 全文：`innerHTML` 245 处（其中拼接 60、带英文 45）、`textContent` 711 处（拼接 141）、`.title` 拼接 42、`confirm(` 6、`prompt(` 4、`alert(` 0、`insertAdjacentHTML` 1。

| # | en | 建议 zh | where | 说明 |
|---|---|---|---|---|
| 1 | Runtime <b>{dur}</b> | 时长 <b>{dur}</b> | `app.js:14330` | innerHTML = 'Runtime <b>' + … + '</b>'；<b> 内的数字可翻，外壳英文残留 |
| 2 | You have <b>{n} blank beats</b> in this project. Consider including <i>"Fill the blank beats"</i> below. | 这个项目里有 <b>{n} 个空白节拍</b>，可以考虑把下面的<i>「补齐空白节拍」</i>也勾上。 | `app.js:29862` | innerHTML 拼三段；只翻文本节点会留下英文骨架 |
| 3 | <b>{done}</b> of {total} | 已完成 <b>{done}</b> / {total} | `app.js:32487` | On set 进度条 innerHTML |
| 4 | <b>{n}/{total}</b> | <b>{n}/{total}</b> | `app.js:33081` | 只含数字，无需译，但要保证不被误改成中文标点 |
| 5 | <b>{day}</b> | <b>{day}</b> | `app.js:32563` | 日期数字 |

- **`textContent` / `.title` 拼接站（157 站）不用单独处理** —— 产出纯文本，走 §3.2 模式匹配即可命中，已并入 C 类。
- **`innerHTML` 拼接（45 站）要单独看**：文本被标签切碎（`Runtime <b>1:23</b>`），DOM 翻译只能命中碎片。做法是把标签外壳里的英文词也做成独立短键（`Runtime`→时长、`Lens`→镜头、`Wrap`→收工、`of`→/），让 TreeWalker 在碎片上命中。
- **`confirm()` / `prompt()` 10 处必须包 `t()`**（原生对话框不进 DOM）：

```js
// app.js:14164
if(!confirm(BeatI18n.t('Mark this beat as an alternative? It will use the slate "Alt" badge and stay off the main path until you "Make main path" it again.'))) return;
// app.js:12174
const nm = prompt(BeatI18n.t('Group name:'), g.name || '');
```
参数是拼接串时（15194 / 35339 / 38192 / 38643）先把整串拼好再交给 `t()`，让模式匹配去吃。

---

## 6. E 类 · 非 DOM 面（14 条 / 26 处）

| 面 | 站 | 样例 | 处理 |
|---|---|---|---|
| `document.title` | 4（39310/39327/40694） | `Beat — {name}`、`{name} — Beat (read-only)` | `applyTitle()` 接模式匹配 + `~pat:` 键 |
| canvas `fillText` | 4（3779/5207/10777/11523） | `Empty board`、`No beats yet` | 改 `BeatI18n.t(...)`；另两处画的是用户标题/批注，保持原样 |
| rfd 原生对话框 | 9（639/643/25917/37503/37972/39010/41539/41608） | `Pick a folder`、`Add to Vault`、`Pick a Beat template` | `pickFolder/pickFile` 里对 title 走 `t()` |
| 拖拽 ghost | 9 处 `setData` | `'beat-img:'+id`、`'onset-shot:'+id` | **实测无可见文本**：影像是元素快照，payload 只是内部 id，本类不产生残留 |

```js
async pickFolder(title){
  if(HAS_TAURI) return await _ti('pick_folder', { title: BeatI18n.t(title || 'Pick a folder') });
  return null;
}
```

---

## 7. 抽样核对结论（A 类 20 条，逐条回源）

方法：按 `where` 打开对应文件 ±3 行，确认英文原文在该处、且处在 UI 出口（`textContent` / `innerHTML` / toast / `label:` / HTML 可见文字）。

| # | where | en | 结果 |
|---|---|---|---|
| 1 | `app.js:2816` | New dark theme — cool slate with a warm amber accent. | ✅ changelog 项，渲染进 What's new |
| 2 | `app.js:17745` | Room size — sets the floor and the real-world scale. | ✅ Set Plan 尺寸浮层 |
| 3 | `app.js:17711` | Send backward | ✅ 右键菜单项 |
| 4 | `app.js:5677` | Basic shapes | ✅ 素材面板分组标题 |
| 5 | `app.js:29722` | Unnamed prop | ✅ 道具卡默认名 |
| 6 | `app.js:37418` | Something went wrong | ✅ Claude 连接错误 toast |
| 7 | `app.js:37101` | Capturing… | ✅ 抽帧进度 |
| 8 | `app.js:15158` | Paste a YouTube or Vimeo URL | ✅ 视频嵌入弹窗占位 |
| 9 | `app.js:30751` | INTERNAL — ANNOTATED | ✅ 导出封面副标题 |
| 10 | `app.js:11838` | Could not save image | ✅ 保存 toast |
| 11 | `app.js:25910` | Could not add those files | ✅ 素材导入 toast |
| 12 | `app.js:41489` | Could not reveal log folder | ✅ 调试面板 toast |
| 13 | `app.js:14372` | Could not save | ✅ 通用保存失败 |
| 14 | `app.js:38910` | Import failed: | ✅ 导入前缀 |
| 15 | `app.js:673` | library path not configured | ✅ 文件选择前置检查 |
| 16 | `app.js:10283` | Drag from Finder onto a beat | ✅ 教练标注 tips |
| 17 | `app.js:10294` | Hover an edge endpoint | ✅ 同上 |
| 18 | `app.js:10267` | Shift + drag, then A | ✅ 同上 |
| 19 | `app.js:10322` | Click any thumbnail | ✅ 同上 |
| 20 | `app.js:34231` | Nothing to write yet — | ✅ 写作页空态 |

**20/20 命中，0 误报。** 全量 127 条按同样方法做自动化回源（最长无占位子串比对 ±4 行窗口）：**127/127 在该行命中**（含 9 条 `index.html` 静态骨架、1 条 `title` tooltip）。追加的 78 条短标签属于同一个词表族（分镜表列头 / 实体分类 / 导出小节），未逐条给行号，按「多处的同名词」处理。

---

## 8. 落地顺序

| 步 | 改哪 | 收回 | 风险 |
|---|---|---|---|
| 1 | `zh-CN.json` + `make_lang_pack.py` 键清洗 | A 的 205 条 + 死键 226 条 | 低（纯数据） |
| 2 | `i18n.js` 从 `SKIP_SEL` 删 `select/option/kbd` | B1+B2 共 16 条 | 低 |
| 3 | `i18n.js` 闸门顺序 + 长文白名单 | B3+B4 共 19 处 | 中（须保留内容护栏） |
| 4 | `i18n.js` 加 `lookupPattern()` + 语言包 `~pat:` 段 | C 的 53 个模式 / 157 站 | 中（回填不完整要能放弃） |
| 5 | `applyTitle()` 接模式匹配；10 处 `confirm/prompt` 包 `t()` | D+E 的标题与原生确认框 | 低 |
| 6 | `pickFolder/pickFile` 的 9 条 title 走 `t()` | E 的 9 条原生标题 | 低（要重建前端） |

第 1–5 步只动语言包与 `i18n.js`（运行期注入）→ 重切分片 + 切一次语言即生效；只有第 6 步要重建前端。

---

## 9. 未穷尽说明

- **A**：127 条已逐条回源；78 条来自 578 条候选的判定（保留项已在 §2.3 列表说明）。剩余估计 **150–250 条**，主要在「导出 / AI 提示词 vs 界面」的边界上，需按 `b()`、`lines.push()`、`exportShotListCsv`、`docxHouseStyles` 几个函数族分桶后再判。
- **B**：292 处已按子类给到规则级（键清洗 / SKIP_SEL / 闸门顺序），144 条空格键与 82 条转义键不逐条列 —— 由第 1 步的清洗脚本一次性覆盖。
- **C**：157 个拼接站归并为 53 个模式；剩余是纯标点拼接站（`' · '`、`': '`），不需要模式。
- **D / E**：已给站点级清单与总数，未逐站写 diff（按收敛要求各给 5 条样例 + 结论）。
