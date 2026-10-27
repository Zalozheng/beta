# Beat 2.3.2 原生菜单 / 对话框汉化 —— 动态注入交付与验证

样本：`/Applications/Beat.app` v2.3.2（bundle `io.beat.canvas`）
成品：`work/Beat.zh.app`（前端汉化 + 原生菜单汉化，ad-hoc 重签，双击即可运行）
角色：`dynamic`（运行时注入 + 验证）

---

## 0. 一句话结果

**双击可用**。`BeatMenuZh.dylib` 通过 **LC_LOAD_DYLIB** 链进 universal 二进制（x86_64 + arm64 两个 slice 都注入），
不依赖 `DYLD_INSERT_LIBRARIES`、不需要用户设任何环境变量；启动后原生菜单 **37/38 条**目标命中中文，
`rfd` 原生对话框标题（NSSavePanel / NSAlert）与 About 面板标题经同一套 hook 生效（真实对象回环验证通过），
街景子窗口的自有按钮 `Capture snapshot → 截取快照` 已用 `__TEXT,__const` 原位等长补丁改掉。

| 项目 | 值 |
| --- | --- |
| 成品 app | `work/Beat.zh.app` |
| SHA256 `Contents/MacOS/beat` | `c4c37ad16935be648a34d03073259c40b37408e5cc8497244b94583d1f2c51b5` |
| SHA256 `Contents/Frameworks/BeatMenuZh.dylib` | `4009639c721e33d00717bf1a24bbef96cdab960bee4cb7585c04e0b36d3e16f4` |
| 前端汉化二进制基线 | `artifacts/beat.patched.fat`（`7732ba18…`） |
| codesign | `flags=0x2(adhoc)`，`--verify --deep --strict` → `valid on disk` / `satisfies its Designated Requirement` |
| 菜单命中 | 直接启动 **37/38**；LaunchServices(`open`) 启动 **32/38 + 4 条对话框回环** |

---

## 1. 注入方式（为什么不用 DYLD_INSERT_LIBRARIES）

原版二进制 `flags=0x10000(runtime)`（hardened runtime）且**没有**
`com.apple.security.cs.disable-library-validation` → dyld 会丢弃 `DYLD_INSERT_LIBRARIES`。
路线 A 的前端折衷补丁必然要 ad-hoc 重签，重签后 `runtime` 标志消失、库校验不再拦 ad-hoc 库，
因此在**同一次重签**里把 dylib 硬链进二进制即可，最终形态对用户是「双击就生效」。

`install_name_tool`（macOS 27 / CLT 版）实测**没有** `-add_lc_load`（只有 `-change/-rpath/-add_rpath/-id`），
所以用自写注入器 `artifacts/tools/menuzh/inject.py` 直接改 load commands：

1. 解析 fat header，逐 slice 取 `mach_header_64`；
2. 定位 `LC_CODE_SIGNATURE`，把新的 `LC_LOAD_DYLIB`（72 B）**插在它前面**，尾部命令整体后移 72 B；
3. 更新 `ncmds += 1` / `sizeofcmds += 72`；
4. 校验上界：`32 + sizeofcmds + 72 ≤ __TEXT` 首个 section 的 file offset（x86_64 余量 0x60、arm64 余量 0x70，**够用**）。

插入的 load command：

```
LC_LOAD_DYLIB  cmdsize=72  name=@executable_path/../Frameworks/BeatMenuZh.dylib
               (timestamp=0, current_version=0x10000, compat=0x10000)
```

文件大小不变、段表不动、`__LINKEDIT` 不动 —— 只是 header 里多 72 字节，随后重签覆盖旧签名。

## 2. dylib 做了什么（BeatMenuZh.mm）

`__attribute__((constructor))` 在 dyld 装载期（早于 `main` / 早于任何 AppKit 代码）跑：

| hook | 目的 |
| --- | --- |
| `-[NSMenuItem setTitle:]` | 菜单项标题写入口 |
| `-[NSMenu setTitle:]` | 子菜单 / 一级菜单标题 |
| `-[NSMenu addItemWithTitle:action:keyEquivalent:]` | muda 动态建项（Rust 侧高频） |
| `-[NSMenu insertItemWithTitle:action:keyEquivalent:atIndex:]` | 同上（带位置） |
| `-[NSMenu addItem:]` / `-[NSMenu insertItem:atIndex:]` | `[[NSMenuItem alloc] initWithTitle:]` 后挂载的路径 |
| `-[NSWindow setTitle:]` | 窗口标题 / `rfd` 的 NSSavePanel 标题 |
| `-[NSAlert setMessageText:]` / `setInformativeText:` | 原生弹窗正文 |
| `-[NSApplication orderFrontStandardAboutPanelWithOptions:]` | About 面板 |

- 词典以内联 `en → zh` NSDictionary 形式存在（值取自 `artifacts/strings.json` 的 `native-menu` 40 条），
  另有 13 条 AppKit 自带项（Services / Start Dictation… / Emoji & Symbols / Toggle Full Screen / Minimize / Zoom / 撤销拷贝粘贴 …）
  与 1 条街景按钮兜底。
- 兼容 AppKit 的 `"..."` 与 `"…"` 两种省略号（如实际标题是 `Share…`、词典键为 `Share`）。
- 另有两路兜底扫描 `NSApp.mainMenu`（`dispatch_after` 链 + `NSTimer` in `NSRunLoopCommonModes`），
  每 0.5 s 递归 walk 一遍、并在 ~2 s 时把整棵菜单树 dump 进日志。
- 命中逐条写 `/tmp/beat_menu_zh.log`（`title: "File" -> "文件"` / 非目标写法为 `extra:`），
  计数写 `/tmp/beat_menu_zh.summary`。
- 只看已存在标题，其余一律原样放行；不改任何业务逻辑。

> 修正过的坑：自检里创建 `NSWindow` 后直接 `close`，ARC 下 `releasedWhenClosed=YES` 会二次 release → SIGSEGV。
> 已改为 `setReleasedWhenClosed:NO` 再 `close`，两次跑满 18–20 s 无崩溃。

## 3. 重签

```bash
codesign --force --sign - --timestamp=none work/Beat.zh.app/Contents/Frameworks/BeatMenuZh.dylib
codesign --force --deep --sign - --timestamp=none work/Beat.zh.app
codesign --verify --deep --strict --verbose=2 work/Beat.zh.app
# → work/Beat.zh.app: valid on disk
# → work/Beat.zh.app: satisfies its Designated Requirement
```

`--deep` 会顺带处理 `Contents/MacOS/beat-connector` 与内嵌 dylib；两者在 verify 里都是 `--validated:`。

## 4. 验证

### 4.1 双击等价路径（LaunchServices）

```bash
open -a "$PWD/work/Beat.zh.app"
```

日志（`artifacts/logs/`）：

```
===== BeatMenuZh loaded =====  pid=10481 bundle=io.beat.canvas
swizzle ok: NSMenuItem -setTitle:   (共 10 条 swizzle 全部 ok)
title: "File" -> "文件"   title: "Save" -> "保存"   title: "New Project…" -> "新建项目…"
title: "Close Tab" -> "关闭标签页"  …（File/Edit/View/Window/Help 五个一级菜单 + 全部子项）
summary: hits=32/38   missing=[Bring All to Front | Beat —故事规划画布 | Save media as | Export media as .zip | Save as Beat template | Beat template]
```

### 4.2 直接 exec 路径（带对话框自检）

```bash
touch /tmp/beat_menuzh_selftest          # 打开自检开关（只在分析时用，成品默认关闭）
./work/Beat.zh.app/Contents/MacOS/beat
```

```
hits=37/38  applied=0  swizzled=10  dumped=1
missing=[Bring All to Front]

===== NSApp.mainMenu (live) =====
- Beat
  - 关于 Beat / 偏好设置… / 服务 / 隐藏 Beat / 隐藏其他 / 全部显示 / 退出 Beat
- 文件
  - 新建项目… / 打开项目… / 项目… / 保存 / 在访达中显示项目 / 共享… 
  - 导出 Beat 概览（PDF）/ 导出故事板（PDF）/ 导出 DOCX 章节 / 导出供 AI 对话开发用（.md）
  - 关闭标签页
- 编辑  - 撤销 / 重做 / 剪切 / 拷贝 / 粘贴 / 全选 / 查找 Beat… / 开始听写… / 表情与符号
- 视图  - 切换保险库 / 项目信息 / 地点地图 / 适应视图 / 放大 / 缩小 / 调试面板
- 窗口  - 最小化 / 缩放 / 切换全屏
- 帮助  - 键盘快捷键 / 打开 Beat.log / 更新提取器（yt-dlp）

----- selftest: 真实对象回环（不显示窗口）-----
selftest: NSSavePanel.title      = "媒体保存为"
selftest: NSAlert.messageText    = "将媒体导出为 .zip"  informativeText = "保存为 Beat 模板"
selftest: NSWindow.title         = "Beat —— 故事规划画布"
selftest: NSWindow.title         = "Beat 模板"
```

自检走的是**真实 AppKit 对象**（`NSSavePanel` / `NSAlert` / `NSWindow` 实例），只回环读回标题、不弹窗，
证明 4 条「运行期没被触发的对话框文案」确实被 hook 改写。

### 4.3 前端 & 稳定性

```
js: projects listed: 2      ← Tauri 解码 zh brotli 资源成功（两次运行都出现）
yt-dlp warm-up complete
进程存活 18–20 s 无崩溃（LaunchServices / 直接 exec 各 2 次）
```

### 4.4 街景按钮

```python
# arm64: 0xc969e3 / 0xc96c43   x86_64: 0xe14d0b / 0xe14f6b（各两处：初始文案 + 复位文案）
tent='截取快照    ';b.st…      # 16B 等长，补 4 空格；老串剩余 0 处
```

### 4.5 拿不到的取证（已换路径）

- `osascript -e 'tell application "System Events" …'` → `osascript is not allowed assistive access. (-1719)`
- `screencapture -x` → `could not create image from display`（Screen Recording 权限）
  ⇒ 以 **dylib 内部 dump 的真实 NSMenu 树 + 逐条替换日志 + 进程存活** 作为等效证据。

## 5. 未覆盖 / 已知限制

1. **`Bring All to Front`**（词典里有）在本 App 的「窗口」菜单中**根本不存在** —— muda 自建窗口菜单只有
   Minimize / Zoom / Toggle Full Screen，所以这条永远是 0 命中，不是漏翻。
2. **Google 街景页面自身的文字**（搜索框、Google 自己的按钮/图例）不属于本 App，运行时不可本地化；只改了 App 自己注入的
   `Capture snapshot`。
3. **LaunchServices 启动时 0.5 s 扫描链会停摆**：`open` 启动的进程里 `dispatch_after` 与 `NSTimer(commonModes)` 都只跑到第 1–2 tick
   就不再触发（日志与 summary 时间戳停在同一秒），直接 exec 启动则正常跑满。
   **不影响汉化效果**——因为 dylib 早于任何 AppKit 代码装载，所有标题写入都被 swizzle 当场改写（`open` 启动那次同样 32 条命中中文）；
   扫描链只是冗余兜底。若要在这个路径上也能 dump 树，需改用别的驱动（如 `NSApplicationDidFinishLaunching` + 每次 swizzle 触发惰性 walk）。
4. 破签：notarization 作废；本地 ad-hoc 副本可跑，拷到别的机器首次如被 Gatekeeper 拦：
   `xattr -dr com.apple.quarantine Beat.zh.app`。
5. App 有自动更新（`https://beatforfree.com/update.json`），装回 `/Applications` 会被覆盖丢汉化。

## 6. 回滚

```bash
# 1) 只退原生菜单汉化（保留前端汉化）
rm -rf work/Beat.zh.app/Contents/Frameworks/BeatMenuZh.dylib
cp work/menuzh/rollback/beat.pre-dylib work/Beat.zh.app/Contents/MacOS/beat   # 注入前成品二进制（39,681,472 B）
codesign --force --deep --sign - --timestamp=none work/Beat.zh.app
codesign --verify --deep --strict --verbose=2 work/Beat.zh.app

# 2) 全退（回到未汉化）
rm -rf work/Beat.zh.app
# /Applications/Beat.app 全程只读未改
```

`work/menuzh/rollback/beat.pre-dylib` = 注入/JS 补丁**之前**的成品二进制（含前端汉化、不含 LC_LOAD_DYLIB 与
`截取快照` 补丁）。若要从零重建：`bash artifacts/tools/menuzh/rebuild-menuzh.sh`。

## 7. 产物清单

```
artifacts/tools/menuzh/BeatMenuZh.mm        注入库源码（词典 + 10 个 swizzle + 双驱动扫描 + 自检）
artifacts/tools/menuzh/BeatMenuZh.dylib     编译产物（universal x86_64+arm64）
artifacts/tools/menuzh/inject.py            Mach-O LC_LOAD_DYLIB 注入器 + 街景按钮原位补丁
artifacts/tools/menuzh/rebuild-menuzh.sh    一条命令复现
artifacts/logs/beat_menu_zh.direct-exec.log 逐条替换日志 + 菜单树 dump + selftest
artifacts/logs/beat_menu_zh.summary         命中统计
artifacts/logs/beat_app.direct-exec.log     App 自身日志（js: projects listed / yt-dlp warm-up）
```
