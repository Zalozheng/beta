# Beat 电影版改造路线图（roadmap）

> 状态：方案定稿。执行环境 shell 通道临时故障（`spawn bash ENOENT`），本文件先落盘，恢复后按「阶段」逐项派活。

## 0. 现状（已核对源码）

- 后端：Rust + Tauri 2 + WKWebView；前端：`index.html`(598 行) + `app.js`(2.3MB) + `templates.js` + `style.css`。
- 已有能力：无限画布 Canvas、写作 Write、大纲 Outline、拍摄日 On set、导出中心、Elements（人物/地点/道具）面板、Vault、音频时间轴 Audio timeline、Inspector、Filter、Present。
- 数据模型（`state.nodes`）：`beat/title/note/thought`（故事）、`character/location/prop`（人物地点道具）、`gallery/sketch/image/palette`（视觉）、`shotlist/setplan/checklist`（制作）、`document/link/video`（附件）。shotlist 内含 `scenes[]` 与 `shots[]`（`sceneId/shootOrder/done/skipped/secs`）。
- 体积 84MB 构成：主二进制 39.8MB（universal arm64+x86_64 各 ~20MB）+ yt-dlp 37MB + beat-connector 5.4MB×2 份 + icns/资源。

## 1. 分镜 timeline 拖拽预览（新增，核心）

**目标**：横向时间轴，按场（scene）分组铺分镜卡；卡宽 ∝ 镜头时长；可拖动排序、拖动 scrubbing 预览、点击飞转到画布对应卡片。

**数据**：复用 shotlist 节点，不动数据结构（`shot.shootOrder` 即顺序，`shot.secs` 即时长；`scene.id` 分组）。无时长时按等宽占位，在卡上显示 `1 / 3` 序号。

**UI（新增 `#timelinePane`，复用 onsetPane 的视觉语言）**：
- 顶部工具条：缩放（时间密度）、按 Story/Shooting 排序切换、只显示未拍、导出分镜表。
- 主体：横向滚动轨道 + 竖直分场泳道（scene lane）。每个 shot = 一个卡，含缩略图（取 canvas 卡片 thumb）、镜头号、时长、完成态。
- 交互：
  - 拖拽卡 → 改 `shootOrder`（同一 scene 内重排）或跨 scene 移动（改 `sceneId`）；拖拽时实时高亮落点。
  - 按住卡左右滑 → scrubbing 预览：中间预览窗放大显示该分镜的缩略图/画布卡片快照。
  - 点击卡 → `flyToCard(id)` + 打开 Inspector。
  - 播放头（playhead）：点击轨道某处跳转；空格播放顺序翻卡（像 On set 的 take 流程）。

**入口**：顶栏加一个按钮（复用 `onsetBtn` 旁边），或把「On set」扩展出「Timeline」子视图。优先独立按钮，命名「分镜 / Timeline」。

## 2. 人物 / 场景 / 道具库（升级 Elements 面板）

**目标**：把现有 Elements（`castPanel`）从「只读列表」升级成「可管理的库」。

**新增能力**：
- 分类 tab：人物 / 场景 / 道具（已有 character/location/prop 数据，加 tab 过滤）。
- 每个元素卡片：头像/照片缩略图、名字、出现场次数、标签；点开进 profile（复用 Inspector，加「出现的场次」反向链接）。
- 操作：新建、重命名、删除、搜索、排序（按名/按出场次数）、拖到画布复用、拖到分镜卡关联。
- 「未使用」提示：库顶部显示散落在画布外、未关联任何分镜的元素。

**数据**：仍存 `state.nodes`，不迁移；库是聚合视图 + 管理 UI，零迁移风险。

## 3. 布局优化（等用户截图定位）

先列已知可改进项，等用户指认后精准改：
- Elements 面板和 Vault 共用了 `.media-tab` 结构，库升级时顺带统一。
- On set 的 story/shooting 切换与 timeline 的排序切换语义重复，timeline 落地后合并入口。
- 顶栏按钮偏多（Save/Project info/Outline/Write/On set/Export），可收进「⋯」或分组。

## 4. 翻译补全

- 继续补 `src/lang/zh-CN.json`（现 2334 条）。优先补：引导正文、错误提示、导出中心长文案、On set/timeline 新文案。
- 新功能（timeline/库）的文案**直接写双语键**（英文写死在 DOM，运行时 i18n 翻译），不新增静态中文。

## 5. 体积优化（目标 84MB → ~25MB）

1. 只保留 arm64（本机 Apple Silicon）：主二进制 39.8→~20MB（`lipo -thin arm64`）。
2. yt-dlp 37MB 改「首次使用时下载」：启动时不带，点下载时从官方 GitHub release 拉到 `~/Library/Application Support/io.beat.canvas/yt-dlp`；失败时提示手动放置。
3. beat-connector 去重：`MacOS/` 与 `Resources/resources/` 各一份，确认实际引用路径后只留一份，省 5.4MB。
4. 可选：icns 压缩、去掉 DWARF/调试段（若有）。

## 6. Rust 化评估（结论，不立即做）

- 前端 UI 层无法用 Rust 直接替代 WebView，除非换 UI 框架。
- 三条路：A) Rust→WASM（Leptos/Dioxus，仍 WebView）；B) 重逻辑下沉 Rust 命令（渐进）；C) 原生 Rust GUI（egui/iced/slint，体积几 MB、拖拽最顺、但等于重做整个 app）。
- 建议：先完成 1–5 的 JS 版交付并让用户用起来；若 timeline 拖拽在 WebView 里仍不够顺，再评估 C。C 立项前先出 PoC（egui 画一个可拖拽 shot 卡时间轴），确认手感再决定全量重写。

## 7.5 已确认的数据结构与可复用 API（app.js，可直接引用）

**shotlist 节点（`node.type === 'shotlist'`）**：
- `node.id`、`node.scenes[]`（每场：`{id,name}`）、`node.shots[]`
- `node.orderMode`（`'story' | 'custom'`）、`node.locked`、`node.callTime`、`node.onsetRunning/onsetElapsed/onsetStartedAt/wrappedAt`

**shot（分镜，`node.shots[]` 元素）**：
- `shot.id`、`shot.sceneId`、`shot.shootOrder`、`shot.done`、`shot.skipped`、`shot.secs`（实拍秒）、`shot.take`、`shot.duration`（预估时长字符串）

**可直接复用的函数（app.js）**：
- `_onsetShots(node)` → 按 scene/shootOrder 排序后的 shot 数组（timeline 数据源，零改动复用）
- `_onsetNode()` → 当前 shotlist 节点
- `_shotDurationNum(duration)` → 时长字符串转秒数（timeline 卡宽用）
- `_onsetFmtH(ms)` → 秒→HH:MM:SS
- `save()`、`render()`、`renderOnset()` → 重绘入口
- `openOnset(node)` → On set 模式入口（timeline 参照它写 `openTimeline(node)`）
- 键盘处理在 app.js:31847 的全局 keydown（`onset-open` body class 门控）

**timeline 实现要点（据此写代码）**：
- 数据源 = `_onsetShots(node)`；排序切 Story/Shooting = 切 `node.orderMode`（复用 onset 的 story/custom 语义）。
- 拖拽重排写 `shot.shootOrder` + `shot.sceneId`，然后 `save(); renderTimeline();`。
- 卡宽 = `_shotDurationNum(shot.duration)` 归一化（无时长用固定占位宽）。
- 飞转画布用 `flyToCard(id)`；打开详情用 `renderInspector()`。
- 新增 `#timelinePane`（HTML 面板）+ `timeline.js`（独立模块，构建时注入 app.js 末尾，同 i18n 注入方式）。

**库（人物/场景/道具）现状 —— 已确认（app.js:25632-25851）**：
- 已存在且较完善：`renderCast()` 按 `CAST_KINDS`（character/location/prop）分组排序渲染；`renderElementProfile(node, kind)` 渲染完整 profile（照片 strip、Details 事实区、Description、`mentionBacklinks()` 提及的 beat、`_elemConnections()` 连线、`_elemSetPlans()` 站位）。
- 节点字段已确认：`n.title / n.body / n.images[] / n.role`（character）、`n.geo.address + n.sunInfo.label`（location）、`n.qty + n.checked`（prop）。
- 飞转函数：**`jumpToNode(node)`**（不是 flyToCard）。资源图用 `storage.assetSrc(ref)`。
- 结论：库的"展示 + profile + 反向链接"已齐，缺的是**管理能力**（新建/重命名/删除/搜索/排序/拖拽复用）。升级 = 在 `renderCast` 之上加管理条 + 拖拽，不动数据模型。

## 7. 阶段顺序（bash 恢复后）

1. 网络 + 建仓库 + push（开源）；
2. 体积优化（arm64-only + yt-dlp 按需 + connector 去重）→ 验证启动；
3. timeline 分镜预览（新功能，JS）→ 验证拖拽/scrub/飞转；
4. 人物/场景/道具库升级 → 验证增删改查/拖拽关联；
5. 翻译补全 + 布局修整（等用户截图）；
6. Release 打包；评估 Rust PoC。
