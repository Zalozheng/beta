# Beat 2.3.2（io.beat.canvas）汉化可行性与技术路线

样本：`/Applications/Beat.app` v2.3.2，universal (x86_64+arm64)，`beat` 39,829,072 B
SHA256(原 `Contents/MacOS/beat`) = `c40ebd10447761ef541859fe6048b188135367ab4331b4681c01955591ff33cd`
签名：Developer ID Application: JOAO LUTZ MORAES BARROS (J64NXVLUFP)，`flags=0x10000(runtime)`，notarization stapled，CDHash `999771a8…`，**无 entitlements**、无 App Sandbox。

---

## 0. 一句话结论

**能全量汉化前端（100%）**：UI 全部来自二进制内嵌的 31 个 brotli 资源（`__TEXT,__const`，0xab86a4–0xc95bf6），
不是远程加载、不是 .lproj、不是 asar。原文即可就地改写并原位回压。
**原生 macOS 菜单/弹窗只 16/40 条能等长替换**，其余 24 条要么靠运行时 dylib 改 NSMenu，要么重链。
**远程子窗口（Google 街景）内的文字不属于本 App**，只能运行时注入 JS 覆盖，且只覆盖自家注入的控件。

---

## 1. 事实核对（推翻三条已知猜测）

| 猜测 | 实测 | 证据 |
| --- | --- | --- |
| 前端可能远程加载（beatforfree.com / 127.0.0.1:1420） | **否**。release 版走内嵌资源，`tauri://localhost` 自定义协议；`http://127.0.0.1:1420/` 只是序列化 Context 里的 devUrl 残留 | 31 个资源全部解出（含 `index.html`）；`__TEXT,__const+0x1264` 处 0x995dbc 为 tauri Config 串池（`io.beat.canvas`/`index.html`/fs scope/`http://127.0.0.1:1420/`/`icons/icon.png` 连排）；`tauri://localhost` 出现于 0xaadc5d、0xaae6f3、0xab652a；`tauri-2.11.2/src/manager/webview.rs` 的 `Asset ... not found; fallback to index.html` 在 0xd4a871 |
| 没有 .lproj / Localizable.strings → 无法本地化 | 前端确实没有，但**前端 100% 内嵌**，与 .lproj 无关；原生串硬编码在 `__const` | 见 §2、§3 |
| WebView 承载 Google Flow 风格 DOM（`.widget-scene`/`#omnibox-container`/assistive-chips） | **不是主 UI**。`#omnibox-container,#assistive-chips,#minimap,.app-viewcard-strip,#titlecard,.scene-footer-container,#watermark,#image-header,.search-button,#gb` 是**注入到 Google 街景子 webview** 的 CSS 选择器，用来隐藏 Google 自己的 chrome | 注入脚本明文在 `__TEXT,__const+0x301480` 起（0xc96000 附近），Rust 侧经 `evaluateJavaScript` 注入；主 UI 里 `widget-scene/omnibox` 命中 0 次 |

---

## 2. 内嵌前端资源：位置、格式、提取

### 2.1 资源表格式（关键结论）

`__TEXT,__const` 中资源池从 **0xab86a4**（`/vendor/jspdf.umd.min.js`）到 **0xc95bf6**（`/index.html` 的流末尾），布局为连续记录：

```
<ASCII 资源键，以 '/' 开头，无 NUL>
<brotli 流（第一字节 0x1b ⇒ WBORIGIN lgwin=22），无长度前缀，到 ISLAST 自止>
```

31 条记录首尾相接、**间隙全部为 0 字节**（见 `embedded-web/manifest.json` 的 `gap_after`），
说明没有独立长度表：条目的边界只能由 brotli 流自止 + 下一条键推断。这也是「可以原位改」的技术前提。

`/index.html` 记录：键 `0xc9339c`，流 `0xc933a7`，流长 10319，原文 44278 B。
`/app.js` 记录：键 `0xad3e6a`，流 `0xad3e71`，流长 559746，原文 2,279,174 B。

### 2.2 提取（可复现）

```bash
cd work
cp /Applications/Beat.app/Contents/MacOS/beat ./beat.fat
lipo ./beat.fat -thin arm64  -output ./beat.arm64
lipo ./beat.fat -thin x86_64 -output ./beat.x86_64
node extract_assets.js ../artifacts/embedded-web > assets_manifest.json     # 依赖 node 内置 zlib.brotliDecompressSync，无需 brotli 命令
node find_assets.js                                                        # 枚举+校验（31/31 通过）
```

`extract_assets.js` 的做法：对每个候选资源键，从键后一位起 `brotliDecompressSync`，
再用「最小可解前缀长度」二分出压缩流长度，落盘后算 SHA256。产物见 `embedded-web/`。

### 2.3 解出的资源（31 个，全部 SHA256 记录在 `embedded-web/manifest.json`）

UI 相关：`index.html`(44,278) / `app.js`(2,279,174) / `style.css`(510,478) / `templates.js`(8,460) / `favicon.svg`(822)
第三方（不翻译）：`vendor/` 下 jspdf、gif.worker、gif、jszip、html2canvas、mammoth、pdf.min、pdf.worker.min、xlsx.full.min、leaflet(js/css/4 图)、docx.iife
字体：`fonts/` 下 8 个 woff2（bricolage / familjen / ibm-plex-mono，latin+latin-ext）

---

## 3. UI 文本来源分类

| 类别 | 位置 | 体积 | 汉化手段 |
| --- | --- | --- | --- |
| (a) 内嵌前端 | `index.html` 167 段文本 + 96 个 `title/placeholder/aria-label`；`app.js` 内 HTML 片段、`textContent`、`label:`、`confirm()`；`templates.js` 122 条模板文案 | 963 条已归类 | 直接改 `zh/`，原位回压（路线 A） |
| (b) 原生菜单/弹窗/About | `__TEXT,__const` 菜单串池 0xab7854–0xab7b70 + 子菜单标题池 0xc98928–0xc989b0 + muda 内置 0xcee688/0xcee835/0xcee84d + About 面板 0xa95ebe/0xa95ecc + rfd 对话框 0x995145/0x99516b/0x9951b6/0x9951c2 | 40 条 | 16 条等长内联；24 条需 dylib 改 NSMenu 或重链（路线 B2） |
| (c) 远程页面（Google 街景子 webview） | 由 `sv_open` 打开的无边框子 webview，页面是 Google 的 DOM；App 只注入 CSS 隐藏 + `mkBtn` 造一个 `Capture snapshot` 按钮 | 1 条自家串 + 全部 Google 串 | 自家串可改（0xc969e3）；Google 串只能运行时 JS 注入覆盖，不纳入本次范围 |

其他可见但非 UI 的串（`Beat.log` 里的诊断、`not a Beat project:` 等）在 `__cstring`/`__const`，属于日志，不影响界面。

---

## 4. 三条路线：判定 / 操作 / 风险 / 回滚

### 路线 A —— 直接改内嵌资源并原位回压（**推荐，已实测跑通**）

**判定：可行，且有余量**。实测回压尺寸（brotli q11 / lgwin22 / size_hint）：

| 资源 | 原槽位 | 回压原文（对照） | 回压中文 | 余量 |
| --- | --- | --- | --- | --- |
| `app.js` | 559,746 | 509,467 | **513,393** | −46,353 |
| `index.html` | 10,319 | 9,221 | **9,839** | −480 |
| `templates.js` | 2,663 | 2,264 | **2,618** | −45 |

（vendored 构建用的是更保守的压缩参数，所以用 q11 重压原文就能省 ~9%，正好成为汉化余量。）

**中文 UTF-8 变长怎么处理**：不需要重建资源表，也不需要改段大小——槽位长度固定，
新流 ≤ 原流长时，**尾部补 0x00 填满原槽**即可。Tauri 侧是 `brotli::Decompressor::read_to_end`，
读到 ISLAST 即 EOF、不看后续字节；macOS 自带的 brotli 解码器同样容忍（下方已用**真实进程**验证）。

**命令序列**：

```bash
cd work
python3 build_zh.py                 # 生成 zh/{index.html,app.js,templates.js,style.css}
node patch_slice.js beat.arm64  beat.arm64.zh  zh     # 记录 name_off/data_off/old_br_len
node patch_slice.js beat.x86_64 beat.x86_64.zh zh
# 注意：不要用 lipo -create 重组（会改 fat 对齐，x86_64 段整体挪位）；
# 直接在原 fat 文件里按 base+data_off 就地写，保证字节级最小改动：
node patch_fat_inplace.js beat.fat beat.fat.zh2        # base: x86_64=16384, arm64=20365312
cp beat.fat.zh2 Beat.zh.app/Contents/MacOS/beat
codesign --force --deep --sign - --timestamp=none Beat.zh.app
codesign --verify --deep --strict --verbose=2 Beat.zh.app
```

**实测结果**
- 补丁后 fat 与原文**同尺寸**，差异 1,141,028 B，**全部落在 6 个已声明槽位内（越界 0 B）**。
- 从补丁后的两个 slice 分别解压 `/index.html`、`/app.js`、`/templates.js`，与 `zh/` **字节相同（PASS×6）**。
- 重签后 `codesign --verify --deep --strict` → `valid on disk` / `satisfies its Designated Requirement`，
  CDHash `bd9f53346619d3924d74ee9a37e8a71a39ad9f9f`，`flags=0x2(adhoc)`。
- **运行验证**：`./Beat.zh.app/Contents/MacOS/beat` 正常启动，日志出现 `js: projects listed: 2`、`yt-dlp warm-up complete`
  → 补丁后的 brotli 槽位被 Tauri 的 Rust 解码器正常解开，`app.js` 真的执行了（见 `runtime-verify.log`）。

**风险点**
1. 破签：notarization 作废，Gatekeeper 对「修改过的原件」会拦；本地副本重签 ad-hoc 后可正常运行
   （首次如被拦：`xattr -dr com.apple.quarantine Beat.zh.app`）。
2. hardened runtime 的 `runtime` 标志在 ad-hoc 重签后消失（`flags=0x2`），这既是代价也是路线 B 的前提。
3. 槽位只能「不增长」。翻译必须控制在余量内：`app.js` 有 46 KB 余量、`index.html` 490 B、`templates.js` 45 B。
   单个资源越界时的处理：把该条文案退回英文，或改用更短的译法（脚本会打印越界项）。
4. 自动更新：App 检查 `https://beatforfree.com/update.json`，装到 `/Applications` 被更新覆盖会丢汉化；
   建议把汉化版放在独立目录、关掉自动下载更新。
5. 尾部补零依赖解码器忽略流尾垃圾：Node 解码器与实测进程都通过；若要绝对零风险，
   可把补零改成「在明文尾部加空白注释」把压缩后长度精确顶到原槽（本样本余量足够，非必需）。

**回滚**：原件从未被写；`rm -rf Beat.zh.app` 即回到未汉化状态；如需还原 `/Applications` 下的原件，直接重装/`cp` 备份。

---

### 路线 B —— 注入 dylib，运行时改 UI（菜单/弹窗必需的那一半）

**判定：可行，但必须先破签名**。当前二进制 `flags=0x10000(runtime)` 且**没有**
`com.apple.security.cs.disable-library-validation` → dyld 会丢弃 `DYLD_INSERT_LIBRARIES`。
两种解法都落到「重签」：ad-hoc 重签（`codesign --force --deep --sign -` 后 runtime 标志消失，实测已验证），
或带 `--options runtime` + entitlements 里加 `disable-library-validation`。

**B1（前端部分不需要）**：`WKUserScript` + MutationObserver 翻译 DOM——只有在不想动资源时才用；
代价是每次 DOM 变更都要跑 JS、虚拟列表/画布重绘会闪，且 `innerHTML` 拼接的卡片文本会二次覆盖。
本样本资源可原位改，B1 属于冗余方案。

**B2（原生菜单部分推荐）**：dylib 里 `+load` 后 dispatch 到主线程，遍历 `NSApp.mainMenu`
按 `title` 匹配后 `setTitle:`，或 hook `-[NSMenu addItemWithTitle:action:keyEquivalent:]` /
`-[NSMenuItem setTitle:]`；rfd 的 `NSOpenPanel/NSSavePanel` 标题同理在 `beginSheetModalForWindow:` 前改写。

```objc
// BeatMenuZh.mm —— clang -dynamiclib -framework Cocoa -o BeatMenuZh.dylib BeatMenuZh.mm
static NSDictionary *M;   // @"About Beat" -> @"关于 Beat" ...
__attribute__((constructor)) static void boot(){
  M = @{ @"About Beat":@"关于 Beat", @"Preferences…":@"偏好设置…", @"Hide Beat":@"隐藏 Beat",
         @"Quit Beat":@"退出 Beat", @"New Project…":@"新建项目…", @"Open Project…":@"打开项目…",
         @"Projects…":@"项目…", @"Save":@"保存", @"Reveal Project in Finder":@"在访达中显示项目",
         @"Share":@"共享", @"Close Tab":@"关闭标签页", @"Find Beat…":@"查找 Beat…",
         @"Toggle Vault":@"切换保险库", @"Project Info":@"项目信息", @"Locations Map":@"地点地图",
         @"Zoom In":@"放大", @"Zoom Out":@"缩小", @"Debug Panel":@"调试面板",
         @"Keyboard Shortcuts":@"键盘快捷键", @"Show Beat.log":@"打开 Beat.log",
         @"Update Extractor (yt-dlp)":@"更新提取器（yt-dlp）", @"File":@"文件", @"Edit":@"编辑",
         @"View":@"视图", @"Window":@"窗口", @"Help":@"帮助" };
  dispatch_async(dispatch_get_main_queue(), ^{
    [NSMenu setMenuBarVisible:YES];
    for (NSMenuItem *top in NSApp.mainMenu.itemArray) {
      if (M[top.title]) [top setTitle:M[top.title]];
      for (NSMenuItem *it in top.submenu.itemArray)
        if (M[it.title]) [it setTitle:M[it.title]];
    }
  });
}
```

```bash
cp -R /Applications/Beat.app ./Beat.zh2.app
clang -dynamiclib -framework Cocoa -o BeatMenuZh.dylib BeatMenuZh.mm
codesign --force --deep --sign - ./Beat.zh2.app                     # 或加 entitlements 保留 runtime
DYLD_INSERT_LIBRARIES=$PWD/BeatMenuZh.dylib ./Beat.zh2.app/Contents/MacOS/beat
```

**风险**：菜单在启动早期构建，构造器时机不够早会导致漏改（解法：`+load` 里装 `NSApplicationDidFinishLaunching`
再扫一遍，或 hook `-[NSMenuItem setTitle:]` 全量兜住）；Tauri 若运行时重建菜单（本项目有 `update Extractor` 动态项）需重复扫。

---

### 路线 C —— 纯运行时 JS 注入、不动二进制

**判定：在本样本上不成立**，原因是签名而不是 JS 能力：
- `DYLD_INSERT_LIBRARIES` 被 hardened runtime 丢弃；
- `task_for_pid`/lldb/frida 附加需要 `get-task-allow`，当前的 notarized 构建没有；
- release 二进制里也没有可外部触发的注入开关（`devUrl` 只在 `cfg(dev)` 生效，运行时改不了）；
- App 自己唯一的注入点是 Rust 侧对内嵌页面 `evaluateJavaScript` 与街景子 webview 的注入脚本，
  外部进程无法把自己的脚本塞进这个通道而不改二进制。

⇒ 想要「运行时注入」就一定先重签，那一刻就等价于路线 B。**结论：C 不具备独立可行性，只作为 A/B 的运行时补充（街景子窗口的自家控件）。**

---

### 推荐组合

1. **路线 A 打前端**（覆盖 95% 可见文字：所有按钮/菜单项文案/设置/错误/空状态/导出流程）。
2. **路线 B2 打原生菜单**（muda 那 24 条等长放不下的：File/Edit/View/Help/Save/Close Tab…）。
3. 街景子窗口：只改自家注入的 `Capture snapshot`（`__TEXT,__const+0x301e63`），Google 自己的文字不碰。

---

## 5. 字符串清单

`strings.json`：1004 条（embedded-web 963 / native-menu 40 / remote-webview 1），字段：
`source`、`en`、`zh`、`file`、`offset`。
- `offset` 对内嵌资源是**解出文件的字符偏移**（`char@N` / `attr:title@N` / `assign@N` / `key:label@N`），
  对原生串是**arm64 slice 的文件偏移 + `__TEXT,__const+偏移`**。
- 保留占位符与符号：`{0}`、`…`、`⌘`、`▶`、`⤓`、`↗`、`·`、`✕`、`SP`、`fps`、`px` 原样。
- 4 条命中但属代码碎片（`LF //`、`b, -1 if a`、`tag carries neither…`、`on top. If the`）已剔除，不列入清单。

按类分布：按钮/工具栏 210+，设置与项目信息 120+，导出中心 60+，模板与示例项目 120+，
错误与空状态 90+，街景/日照/场景计划 80+，引导与更新日志 80+，原生菜单与对话框 41。

---

## 6. 复现与回滚

```
artifacts/
├── embedded-web/          31 个原资源 + manifest.json（file_off / br_off / br_len / raw_len / gap_after / sha256）
├── zh/                    index.html / app.js / templates.js / style.css（当前汉化版本）
├── strings.json           1004 条对照表
├── beat.patched.fat       补丁后的 universal 二进制（sha256 7f2639c2…，与原文件同尺寸）
├── runtime-verify.log     补丁版启动日志（brotli 槽位被真实解码器解开的证据）
└── tools/                 find_assets.js / extract_assets.js / patch_slice.js / build_zh.py / patch_arm.json
```

回滚：`rm -rf work/Beat.zh.app`；`/Applications/Beat.app` 全程只读未改。
重跑：`bash tools/rebuild.sh`（= extract → build_zh → patch_slice → 就地写 fat → codesign → verify）。
