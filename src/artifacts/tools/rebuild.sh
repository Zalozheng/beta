#!/usr/bin/env bash
# Beat 2.3.2 双语构建一键复现（运行时中英切换）
#   英文原版前端 → 注入 i18n（核心词典 + 翻译模块）→ 槽位预检 → 就地回压 → ad-hoc 重签 → 回读验收
#
# 用法：bash src/artifacts/tools/rebuild.sh [/Applications/Beat.app.en.bak]
#
# 与旧流程的区别：不再用 build_zh.py 把英文源码静态替换成中文（那样子没法切回英文）。
# 现在源码保持英文，中文由 src/i18n/i18n.js 在运行期按语言包翻译 DOM，
# 完整语言包在 ~/Documents/Beat Projects/.beat-lang/zh-CN.json，用户可自行编辑。
set -euo pipefail

APP="${1:-/Applications/Beat.app.en.bak}"
HERE="$(cd "$(dirname "$0")/.." && pwd)"      # src/artifacts/
WORK="$HERE/../work"
ROOT="$(cd "$HERE/../.." && pwd)"             # beta/
mkdir -p "$WORK"; cd "$WORK"

echo "== 0. 前置检查 =="
[ -d "$APP" ] || { echo "缺少英文原件 $APP"; exit 1; }
[ -f "$ROOT/src/lang/zh-CN.json" ] || python3 "$HERE/tools/make_lang_pack.py"
[ -f "$ROOT/src/i18n/i18n.js" ] || { echo "缺少 src/i18n/i18n.js"; exit 1; }
echo "   语言包条数: $(python3 -c "import json;print(len(json.load(open('$ROOT/src/lang/zh-CN.json'))))")"

echo "== 1. 取二进制并分片 =="
cp "$APP/Contents/MacOS/beat" ./beat.fat
lipo ./beat.fat -thin arm64  -output ./beat.arm64
lipo ./beat.fat -thin x86_64 -output ./beat.x86_64
shasum -a 256 ./beat.fat

echo "== 2. 英文资源基线（只做参照，不参与构建；构建源是 embedded-web/）=="
node "$HERE/tools/extract_assets.js" "$WORK/assets-en" > ./assets_manifest.json
python3 -c "import json;print('   extracted assets:',len(json.load(open('assets_manifest.json'))))"

echo "== 3. 生成双语资源：作者抹除 + 注入 i18n + 核心词典 + 装语言包 =="
python3 "$HERE/tools/build_i18n.py" --check-slots "$APP" --install-lang
ls -la ./zh

echo "== 4. 就地补丁（不重组 fat，槽位内尾部补 0）=="
node "$HERE/tools/patch_fat_inplace.js" ./beat.fat ./beat.fat.zh "$WORK/zh"

echo "== 5. 装进副本并 ad-hoc 重签 =="
rm -rf ./Beat.zh.app
cp -R "$APP" ./Beat.zh.app
cp ./beat.fat.zh ./Beat.zh.app/Contents/MacOS/beat
chmod 755 ./Beat.zh.app/Contents/MacOS/beat
codesign --force --deep --sign - --timestamp=none ./Beat.zh.app
codesign --verify --deep --strict --verbose=2 ./Beat.zh.app

echo "== 6. 槽位回读验收（应与 zh/ 字节相同）=="
node "$HERE/tools/verify_slots.js" ./beat.fat.zh "$WORK/zh"

echo "== 7. 残留作者自检（期望 0）=="
grep -ci "lutz\|joao" ./zh/app.js ./zh/index.html ./zh/templates.js || true

echo "== 完成：$WORK/Beat.zh.app =="
