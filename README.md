# Beat 2.3.2 中英双语工程（运行时切换 + 独立语言包）

macOS 客户端 Beat（bundle id `io.beat.canvas`，v2.3.2，Rust + Tauri 2 + WKWebView）的双语化工程。

- **形态**：英文原版前端 + 运行期 DOM 翻译。源码永远是英文，界面语言是显示层，**随时切换、不用重启、不用重打包**。
- **语言包**：`~/Documents/Beat Projects/.beat-lang/zh-CN.json`（`{"English": "中文"}`，2334 条，可自己改）
- **成品**：`src/work/Beat.zh.app`；已安装 `/Applications/Beat.app`；英文原件 `/Applications/Beat.app.en.bak`
- **默认语言**：简体中文（`localStorage.beat.uiLang` 未设置时）

## 目录结构

```
beta/
├── README.md
├── build-all.sh                     # 一键：前端重建 + 菜单 dylib + 装应用
└── src/
    ├── lang/zh-CN.json              # 独立语言包（人看人改的那份，扁平 en→zh）
    ├── i18n/
    │   ├── i18n.js                  # 运行时翻译模块（TreeWalker + WeakMap + MutationObserver）
    │   └── i18n.probe.js            # 读取通道探针（仅 --probe 构建注入）
    ├── artifacts/
    │   ├── embedded-web/            # 英文原版前端（从二进制提取；本工程只在这里改源码）
    │   ├── strings.json             # 全量词表：en/zh + source + file + offset
    │   ├── tools/
    │   │   ├── make_lang_pack.py        # strings.json → src/lang/zh-CN.json（保留人工补充）
    │   │   ├── split_lang_pack.py       # 整包 → .beat-lang/parts/ 分片（运行期读这份）
    │   │   ├── build_i18n.py            # 作者抹除 + 注入核心词典与 i18n.js + 槽位预检 + 装语言包
    │   │   ├── check_slots.js           # 回压前尺寸预检（放不进原槽立刻失败）
    │   │   ├── patch_fat_inplace.js     # 新 brotli 流原位回压 + 尾部补 0（未改动）
    │   │   ├── verify_slots.js          # 两架构槽位回读验收（未改动）
    │   │   ├── extract_assets.js        # 解出内嵌资源（现在只做英文基线对照）
    │   │   ├── rebuild.sh               # 双语构建全流程
    │   │   └── menuzh/                  # 原生菜单 dylib（跟着界面语言走）
    │   └── zh/                      # 旧静态汉化产物，仅存档
    └── work/                        # 构建中间目录（beat.fat / zh/ / Beat.zh.app）
```

## 构建

依赖：macOS + Xcode CLT（`clang`/`lipo`/`codesign`）、Node.js（内置 zlib brotli）、python3（标准库）。

```bash
cd /Users/zalo/Downloads/beta
bash src/artifacts/tools/rebuild.sh /Applications/Beat.app.en.bak   # 前端
bash src/artifacts/tools/menuzh/rebuild-menuzh.sh                  # 原生菜单 dylib
```

只重切语言包（改完 `src/lang/zh-CN.json` 后）：

```bash
python3 src/artifacts/tools/split_lang_pack.py
```

## 说明书（docs/）

面向使用者的中文手册，不涉及汉化实现：`docs/使用手册.md`（源，改这份）。

```bash
PY=/Users/zalo/.dsh/dsh-runtimes/dsh-primary-runtime/dependencies/python/bin/python3
$PY docs/md2pdf.py  docs/使用手册.md docs/Beat-使用手册.pdf    # 7 页 A4，Pillow 直绘
$PY docs/md2docx.py docs/使用手册.md docs/Beat-使用手册.docx   # Word 版
```

中文排版注意事项：PDF 用 Pillow 直绘（本机 LibreOffice Kit 渲染 CJK 输出空白页，不可用）；
`⌘ ⇧ ⌫ ▶ ✕ ＋` 在 Hiragino 里缺字形，`docs/md2pdf.py` 会按字符级回退到 Menlo / Apple Symbols。

## 本次补强（v2.3.2-zh.2）

界面残留英文的三条真因，都已修掉：

1. **语言包死键**（约 250 条永远匹配不到）：键带前导/尾随空格、留着未解转义 `\n` `\u2014` `\'`、或是整段 HTML。
   `src/i18n/i18n.js` 的 `mergeInto()` 现在用 `normKey()` 统一清洗，运行期即生效。
2. **匹配规则太窄**：`SKIP_SEL` 原来把 `select/option/kbd` 一起跳过了（14 个下拉框选项因此永远英文），
   已放开；`applyTextNode` 的闸门改成「先折空白再判长度」，换行不再一票否决，
   长文走白名单容器（`LONG_OK`，上限 2000 字符），用户正文三条硬护栏（contenteditable / `.xxx-body` / `[data-i18n-skip]`）不动。
3. **拼接串翻不出来**（`Delete project "x"?`、`12 beats · Oct 28`、`Appears in 7 beats`）：`lookup()` 变成三级
   精确 → 空白折叠 → 模式匹配，语言包支持两种特殊键：
   - `"Could not read *"` 前缀键，`{x}` 是剩余部分
   - `"Appears in {n} beats"` / `"Jump to {name}"` 槽位键，`{n}` 只吃数字，其他占位符吃任意片段
   整段锚定，回填不完整就放弃 —— 宁可留英文，不出半句中文。

另外把 `Date.prototype.toLocaleDateString/toLocaleTimeString` 的 locale 钉到界面语言，
否则系统是英文时项目卡片会出现 `12 beats · Oct 28` 这种半中半英（现在 `12 个节拍 · 10月28日`）。

语言包从 2353 条补到 2752 条（`src/lang/zh-CN.extra.json` 是人工补充包，`design/i18n-residual.json` 是静态分析产出，
两者缺则补、不覆盖已有译法）。

## 导出中文（jsPDF）

**病根**：jsPDF 只带 helvetica/times 五个拉丁字体，中文被写成 UTF-16 码位塞进 WinAnsi 8-bit 字符串
（`中`→`N-`、`文`→`e‡`），渲染成乱码且宽度翻倍、整行拉伸。Word / CSV / Markdown / Fountain / ZIP 不受影响。

**为什么不用「嵌 TTF + addFont」**：实测 Tauri 把 `fs` 与 `path` 插件都 ACL 掉了
（`plugin:path|resolve_directory not allowed by ACL`），字体文件放 `Contents/Resources/` 前端也读不到。

**现在的做法**（`src/artifacts/embedded-web/app.js` 的 `_pdfInstallCN`）：包住 jsPDF 实例的 `pdf.text()` ——
含 CJK 的整行用离屏 canvas 以系统 PingFang 渲染成 PNG 再 `addImage`；纯 ASCII 行仍走原生文本（保留可选文本）。
同一层顺带把字面量过一遍 `BeatI18n.t()`，导出的固定标题/表头/页眉跟着界面语言走，用户写的内容原样输出。
任何一步失败都回退原生 `pdf.text`，绝不产出坏 PDF。11 个 `new jsPDF(...)` 之后各接一行 `await _pdfUseCNFont(pdf)`。

代价：中文行是图片，不可选；体积每行约 +14 KB（整页 A4 中文约 +0.9 MB）。要可选中文字的长文档，用「画布 → PDF」打印版式走系统打印另存。

## 运行时切换是怎么做的

1. **源码保持英文**：`src/artifacts/embedded-web/` 是英文原版（加三处本工程改动：界面语言设置项、移除作者信息、更新链接指向 GitHub）。
2. **构建注入**：`build_i18n.py` 往 `app.js` 末尾追加两样东西 —— `window.__BEAT_I18N_CORE__`（560 条高频 UI 词）和 `src/i18n/i18n.js`。回压后仍有 38 KB 余量（槽位 559,746B）。
3. **翻译**：`i18n.js` 用 TreeWalker 走文本节点 + `placeholder/title/aria-label/alt`，**精确匹配才替换**；跳过 `script/style/canvas/textarea/select`、`contenteditable`、超 400 字符或含换行的长文，以及卡片正文容器（`.wd-body` / `.n-body` / `.nb-body` / `.card-body` …），绝不碰用户写的内容。
4. **还原**：原文存在 `WeakMap`，`setLang('en')` 逐个写回，`document.title` 一起还。
5. **动态内容**：`MutationObserver`（childList/characterData/attributes，60ms 防抖）处理异步渲染与重绘。
6. **语言状态**：`localStorage.beat.uiLang`；设置页「界面语言」下拉 `change` 即生效并落盘。
7. **插件文案（timeline / 库）**：`src/timeline/timeline.js`、`src/library/library.js` 的界面文案一律「英文源 + `L('English','中文')`」——先查语言包，包里没有就用内置中文兜底，切到英文时原样显示英文；监听 `beat:langchange` 重贴文案并重绘。自检：`node src/timeline/test_lang.js`（17 项中英断言）。
8. **原生菜单**：`BeatMenuZh.dylib` 每 0.5s 读一次 `beat.uiLang`（WKWebView 的 localStorage sqlite，只读），英文界面时把菜单标题反向还原成英文，中文界面照旧英→中。

## 语言包怎么读（实测结论，别走弯路）

Tauri capabilities 把**整个 fs 插件 ACL 掉了**：

```
plugin:fs|read_text_file → Command plugin:fs|read_text_file not allowed by ACL
plugin:fs|read_file / exists / stat → 同样被拒
```

能读到库目录文件的只有 `read_doc_text`，而它有 **50000 字符硬上限**（超出静默截断，120KB 文件只回 50000 字符）。所以：

- 整包放 `.beat-lang/zh-CN.json`（人改这份，2334 条约 211 KB）；
- 运行期读 `.beat-lang/parts/zh-CN.N.json`（每片 ≤ 45000 字符，4 片）后合并；
- `parts/manifest.json` 存片数与「前 50000 字符 FNV 指纹」，指纹不一致会打日志提醒重切；
- 整包若小于 50000 字符（自定义小包），直接读整包，不需要分片；
- 以上全失败时用构建内嵌的 560 条核心词典 —— 界面不会变成空白。

## 验证

```bash
# 构建期
node --check src/work/zh/app.js
node src/artifacts/tools/verify_slots.js src/work/beat.fat.zh src/work/zh   # 期望 6 PASS / 0 FAIL
grep -ci 'lutz\|joao' src/work/zh/app.js src/work/zh/index.html             # 期望 0
node src/timeline/test_lang.js                                             # 插件文案中英自检，期望 all pass

# 运行期（beat.log 里的 js: 行）
grep '\[i18n\]' ~/Library/Logs/Beat/beat.log | tail
# [i18n] boot lang=zh-CN stored=null dict=2353 src=file+parts path=…/zh-CN.json
# [i18n] lang=zh-CN translated=277 dict=2334 src=file+parts sample=[Preferences → 偏好设置 | …]
```

切换语言：设置（⌘,）→ 最上方「Language / 界面语言」→ English / 简体中文，立即生效。
命令行等价做法（关掉 App 后改 localStorage，再启动）：

```bash
DB=$(find ~/Library/WebKit/io.beat.canvas -name localstorage.sqlite3 | head -1)
sqlite3 "$DB" "insert or replace into ItemTable(key,value) values('beat.uiLang', x'65006E00');"   # 'en'
sqlite3 "$DB" "insert or replace into ItemTable(key,value) values('beat.uiLang', x'7A68002D0043004E00');"  # 'zh-CN'
```

## 回滚

```bash
# 恢复英文原件
rm -rf /Applications/Beat.app && cp -R /Applications/Beat.app.en.bak /Applications/Beat.app
xattr -dr com.apple.quarantine /Applications/Beat.app

# 或只关掉中文（保留构建）：设 beat.uiLang = en，或在设置里切 English
```

## 注意

- 汉化版与原版 **bundle id 相同**，不能同时装两份；安装前先备份原件。
- 本构建 **不再联网检查更新**：设置页 Update 按钮直接打开 `https://github.com/Zalozheng/beta`。
- 作者署名已从界面、鸣谢、About、Info.plist、README 清除；`build_i18n.py` 会在每次构建时再抹一遍（64 处注释/文案）。
- 上游换版后：前端资源需重新 `extract_assets.js` 定位，`strings.json` 的 offset 要重新生成；`i18n.js` 与语言包不受影响。

## 发布（打 tag 自动出 Release）

成品已经压好放在 `dist/Beat-zh.app.zip`（55 MB，GitHub 单文件限制 100 MB 以内），打 tag 即自动创建 Release 并上传这个 zip：

```bash
bash release.sh v2.3.2-zh.1
```

等价于：

```bash
git tag -a v2.3.2-zh.1 -m "Beat 中文版 v2.3.2-zh.1"
git push origin HEAD
git push origin v2.3.2-zh.1
```

workflow 在 `.github/workflows/release.yml`：tag 触发 → 校验 zip → 生成 `SHA256SUMS.txt` → `softprops/action-gh-release` 发布。上传的是**本地验证过的成品**，不在 CI 里重新构建，所以发布内容与 `/Applications/Beat.app` 完全一致。

重新打包成品（改完源码、重建并安装后）：

```bash
rm -rf dist/Beat-zh.app dist/Beat-zh.app.zip
cp -R /Applications/Beat.app dist/Beat-zh.app
ditto -c -k --keepParent dist/Beat-zh.app dist/Beat-zh.app.zip
rm -rf dist/Beat-zh.app
```

首次 push 前配置远端：

```bash
git remote add origin https://github.com/Zalozheng/beta.git
git push -u origin main
```

如果仓库默认分支不是 `main`，把最后一句改成实际分支名；tag 推送与分支无关。
