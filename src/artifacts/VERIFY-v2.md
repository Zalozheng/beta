# VERIFY v2 —— Beat 2.3.2 汉化「全量残留清扫」验收

样本：`Beat.app v2.3.2 (io.beat.canvas)`，universal (x86_64 + arm64)
原 `Contents/MacOS/beat` SHA256 = `c40ebd10447761ef541859fe6048b188135367ab4331b4681c01955591ff33cd`
本轮产出的二进制 SHA256 = `960a47fee3abefb9983a4d9b90c25f178adea82c2ce80bd3b360916d8cf9fd2a`（含 LC_LOAD_DYLIB 注入的菜单汉化）

---

## 1. 结论

| 项 | 结果 |
| --- | --- |
| 词表 | 1004 → **3123** 条（新增 **2119** 条，见 `strings_v2.json`） |
| 截图 6 类英文残留 | **全部 0 命中**（app.js / index.html 双向 grep + 已安装 app 回解资源复核） |
| `node --check` | `app.js` **PASS**、`templates.js` **PASS**（work/zh 与安装后回解的资源各跑一次） |
| brotli 槽位回读 | **6 PASS / 0 FAIL**（arm64 + x86_64 × index.html/app.js/templates.js 与 `work/zh/` 字节相同） |
| 重签 | `codesign --verify --deep --strict` → `valid on disk` / `satisfies its Designated Requirement` |
| 安装 | 已装到 `/Applications/Beat.app` |
| 运行 | 进程存活 **23s+**；`/tmp/beat_menu_zh.log` 记 80 条菜单标题命中；`~/Library/Logs/Beat/beat.log` 出现 **中文** JS 控制台行 `js: 已列出项目：3`（= 补丁后的 app.js 真的在跑） |
| 残留（全量扫描口径） | 1662 条候选，其中 26 条仍为「多词英文」长尾（见 §7），其余为数据/机型/人名/CSS/SVG/键名/AI 导出 md |

---

## 2. 根因（上一轮为什么漏）

1. `build_zh.py` 的旧提取规则只覆盖 `char@` / `assign@` / `attr@` / `key:label@` 这几种形态；
   **对象属性里的 `body:` / `title:`、三元里的按钮文案、`toast(...)`/`note(...)` 的括号参数、带标签的 HTML 片段**都没进表。
2. `build_zh.py` 的 `done` 集合按 **`en` 字符串**去重：同一条英文只要有一处被 offset 精确替换，
   其余同文出现就**跳过全局替换**——所以 `Skip`/`Save`/`Edit`/`Cancel` 这类高频短词普遍只剩第一处是中文。
3. 截图那几条（引导正文、Skip/Next、`Untitled project`、`Shot`/`Duration`）正是 1 + 2 的组合：
   `body:` 属性、`'Done':'Next'` 三元、`state.name || 'Untitled project'` 兜底值、`grow('Shot', shot)` 标签。

---

## 3. 方法（可复现）

新增 5 个工具（`src/artifacts/tools/`）：

| 工具 | 作用 |
| --- | --- |
| `scan_residual_en.py` | 真词法扫描器：跳过注释、识别 `'`/`"`/模板字面量/正则，输出「字面量 + 源码 offset + 原始切片」 |
| `select_ui_strings.py` | 选出「候选 UI 文案」：innerHTML/textContent/placeholder/title/aria-label/alert/confirm/toast/label:`/title:`/`body:`/拼接位；输出 `selected.json` |
| `make_zh_lists.py` | 把唯一文案落成带序号的清单（人工填译文用），并按「去掉标签后是否还有单词」剔除 SVG/属性碎片 |
| `build_strings_v2.py` | 把「归一英文 → 中文」映射展开成逐 offset 条目；**每条都在英文原件上做 `text[off:off+len(en)] == en` 校验**（0 失配）；合并进 `strings.json`（按 file+offset 去重，原 1004 条不动） |
| `fix_residuals_v2.py` | 28 条「标签 + 文案混在一条字面量里」的定点补丁（子串唯一、命中数逐条打印、0 命中即失败退出） |

关键设计：**按 offset 逐处替换，不做无脑全局 replace**。
`build_zh.py` 的 `done` 语义因此变成「这条 en 只在我指定的那些 offset 上换」，
`WRITE_ELEMENTS_DEFAULT`、`{ k:'shot' }`、`nodeWidth()` 之类的数据枚举不会被污染
（详见 §5 的抽样复核）。`rebuild.sh` 里 `fix_residuals_v2.py` 紧跟 `fix_residuals.py` 之后调用。

---

## 4. 截图 6 类验收（命令 + 结果）

工作副本 `src/work/zh/`：

```
Every character, location and prop you have made   app.js:0  index.html:0  templates.js:0
sp-coach-skip">Skip                                app.js:0  index.html:0
Untitled project                                   app.js:0  index.html:0
>Shot</span>  / >Duration<  / "Shot" / "Duration"   app.js:0  index.html:0
```

回读命中（证明换成了中文，不是被删掉）：

```
你创建的每个角色、地点与道具，全都归在一处。点一行，Beat 就飞到画布上那张卡片…
sp-coach-skip">跳过
brandProjectName" type="text" placeholder="未命名项目"
grow('镜头', shot)      grow('时长', dur)      (i===steps.length-1?'完成':'下一步')
```

**已安装 app 的回读复核**（不是看 work 目录，而是从 `/Applications/Beat.app` 二进制里重新解出资源）：

```
/tmp/verify_installed/web/app.js      sha256 1aeaa61df0b8ef45…  = work/zh/app.js   （字节相同）
/tmp/verify_installed/web/index.html  sha256 de9ecf27b0cfe2f5…  = work/zh/index.html
上面 6 类英文在回解资源里同样 0 命中；node --check 通过
```

### `Untitled project` 的处置说明

- `index.html:41` 的 `placeholder` 上一轮已翻成「未命名项目」（`attr:placeholder@2117`）；
  截图里顶栏显示的英文来自 **JS 兜底值**：`state.name || 'Untitled project'`（6 处），
  它会被写进 `state.name` 并以 **value** 形式显示，所以看起来像 placeholder。
- 本轮把这 6 处兜底值一并改成「未命名项目」（`fix_residuals_v2.py`），
  并确认代码里**没有任何 `state.name === 'Untitled project'` 之类的等值判断**（grep 计数 0），
  因此改它不会打断逻辑，只是新建/旧项目在界面上显示中文默认名。
- 数据枚举类（`WRITE_ELEMENTS_DEFAULT` 由 `prefs.writeElements` 覆盖、`TONE_PRESETS`、
  `{ k:'shot' }`、`nodeWidth()` 表）**有意保持英文键不动**，只翻它们的显示标签。

---

## 5. 安全替换复核（抽样）

```
WRITE_ELEMENTS_DEFAULT = ['镜头','描述','角色','道具','地点','服装','声音','视效','备注']   ← 整组统一，不留半英半中
{ k: 'shot',  label: '镜头' }                ← 键不动，标签翻
TONE_PRESETS: name: 'Dread'                  ← 配色查表靠 name，整组保持英文
'beat' 仍出现 146 处；'Done' 仅存 1 处（状态值）
```

替换后 `node --check` 两个 JS 均通过；HTML 标签序列比对：

```
index.html 标签 1191 / 1191  序列完全一致
app.js     标签 2112 / 2111  差异 1 —— 来自字符串里被翻译掉的字面量 "by <your name>"
           （它只是文本，不是标记；不是结构破坏）
```

---

## 6. 构建 / 回压 / 重签 / 安装（按顺序，全部通过）

```
bash src/artifacts/tools/rebuild.sh /Applications/Beat.app.en.bak
  build_zh: app.js offset_hits=2065  index.html=218  templates.js=144（global_extra 39/1/0）
  fix_residuals.py 3 条 + fix_residuals_v2.py 28 条（34 处命中）
  patch_fat_inplace → 同尺寸就地写，逐槽补 0
  verify_slots: 6 PASS / 0 FAIL
    index.html   len=44461  de9ecf27b0cfe2f5…
    app.js       len=2280204 1aeaa61df0b8ef45…
    templates.js len=8253  27b919d4cddfe8fe…
bash src/artifacts/tools/menuzh/rebuild-menuzh.sh        # 原生菜单 dylib 重新注入 + 重签
rm -rf /Applications/Beat.app && cp -R src/work/Beat.zh.app /Applications/Beat.app
xattr -dr com.apple.quarantine /Applications/Beat.app
codesign --verify --deep --strict --verbose=2 /Applications/Beat.app   # valid on disk
open -n -a /Applications/Beat.app
```

槽位余量（本轮结束后）：app.js 余 ~41.5 KB、index.html 余 ~440 B、templates.js 余 ~65 B。

### 运行证据

```
$ ps -o pid,etime -p $(pgrep -f '/Applications/Beat.app/Contents/MacOS/beat')
13172  00:23                     ← ≥15s 达标

$ tail -2 ~/Library/Logs/Beat/beat.log
[2026-10-27T16:28:15Z] js: 已列出项目：3     ← 中文日志，说明补丁版 app.js 在跑
[2026-10-27T16:28:15Z] js: 已列出项目：3

$ head -2 /tmp/beat_menu_zh.log
[2026-10-28T00:28:10] ===== BeatMenuZh loaded =====
[2026-10-28T00:28:10] pid=13172 bundle=io.beat.canvas
$ grep -c 'title:' /tmp/beat_menu_zh.log
80
```

注：`open -a`（不带 `-n`）时有概率复用已注册实例而**不加载注入的 dylib**（菜单日志不出现）；
`open -n -a` 或直接跑 `Contents/MacOS/beat` 都能稳定加载。装完第一次启动建议用 `open -n -a`。

---

## 7. 残留盘点（1662 条候选的分类）

按「去掉标签后的可见文字」统计，全部候选被分成 6 类：

| 类别 | 条数 | 说明 |
| --- | --- | --- |
| 单词级 | 880 | 机型（ARRI/Canon/RED/Sony…）、画幅（Super 35…）、人名（鸣谢）、缩写（CU/MS/ECU…）、基调预设、字体名、剧本场景条（`INT. … — NIGHT`）——**有意保留** |
| CSS / SVG | 675 | 选择器、`stroke-width`、`viewBox`、属性拼接碎片 |
| AI 导出 md | 45 | 「用于 AI 对话开发」导出文件里的正文（`## Your task`、`- **Beat** — …`）：那是给 LLM 读的产物，不是界面 |
| 键名 / 内联样式 | 36 | `bts:project:`、`onset-shot:`、`px;`、`style=` |
| 日志 | 10 | `unhandled rejection:`、`listProjects failed for` 等诊断串 |
| **待翻（多词英文长尾）** | **26** | 见下 |

26 条待翻明细（下轮可直接补）：

- `Screenplay import no longer loses your work. …`（一条长更新说明，未收表）
- `Every camera on a Set Plan now carries its own body…`、`Set Plan coverage cones are true to your camera…`（同属更新说明）
- `Key concepts you will see:`、`When in doubt about the writer's intent…`、`). The diagram image is embedded in the PDF and Word exports._`、`attached (embedded in the PDF / Word exports)._`、`in this gallery (embedded in the PDF / Word exports)._`（AI 导出 md 的残句）
- `4.6K 3:2 Open Gate` / `LF Open Gate 4.5K` / `Open Gate 3.4K`（画幅型号，建议保留）
- `Search by Photon · OpenStreetMap`（地图署名，建议保留）
- `Shot list`（默认卡片名，代码里有 `nm !== 'Shot list'` 等值判断，动它会打断逻辑，**故意保留**）
- `>Undo<` / `>Redo<` 已在本轮补掉（速查表行），`Clean (print) … As on screen (experimental)` 属 index.html 里跨标签的排版行，需按列重排才能安全替换，留待下轮

---

## 8. 改动文件清单

```
src/artifacts/strings.json              1004 → 3123 条（1fd1aa69d649c79d…）
src/artifacts/strings_v2.json           本轮新增 2119 条（16711f2610808c08…）
                                    app.js 2002 / index.html 91 / templates.js 26
src/artifacts/strings.v1.1004.json.bak  改动前原件备份
src/work/strings.json                   同 strings.json（build_zh.py 读它）
src/work/zh/app.js                      2280204 B  1aeaa61df0b8ef45…
src/work/zh/index.html                  44461 B    de9ecf27b0cfe2f5…
src/work/zh/templates.js                8253 B     27b919d4cddfe8fe…
src/artifacts/tools/scan_residual_en.py         新增：词法扫描
src/artifacts/tools/select_ui_strings.py        新增：UI 文案选择器
src/artifacts/tools/make_zh_lists.py            新增：清单生成
src/artifacts/tools/build_strings_v2.py         新增：按 offset 展开 + 合并 + 校验
src/artifacts/tools/fix_residuals_v2.py         新增：28 条定点补丁
src/artifacts/tools/zh_v2_map*.txt              译文表（754 + 3 批 599 + 235 条 / 17 条手工 offset 条目）
src/artifacts/tools/rebuild.sh                  改：追加 fix_residuals_v2 调用
/Applications/Beat.app                          安装（960a47fee3abefb9…）
```

---

## 9. 复现与回滚

```bash
# 复现（从英文原件重新走一遍）
cd /Users/zalo/Downloads/beta
pkill -f '/Applications/Beat.app/Contents/MacOS/beat'
bash src/artifacts/tools/rebuild.sh /Applications/Beat.app.en.bak
bash src/artifacts/tools/menuzh/rebuild-menuzh.sh
rm -rf /Applications/Beat.app && cp -R src/work/Beat.zh.app /Applications/Beat.app
xattr -dr com.apple.quarantine /Applications/Beat.app
codesign --verify --deep --strict --verbose=2 /Applications/Beat.app
open -n -a /Applications/Beat.app

# 只重跑词表 → 资源（不碰二进制）
cd src/work && python3 ../artifacts/tools/build_zh.py && node --check zh/app.js && node --check zh/templates.js

# 回滚到未汉化
rm -rf /Applications/Beat.app && cp -R /Applications/Beat.app.en.bak /Applications/Beat.app
# 或回滚词表
cp src/artifacts/strings.v1.1004.json.bak src/artifacts/strings.json
```
