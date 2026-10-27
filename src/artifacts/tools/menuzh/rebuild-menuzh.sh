#!/bin/bash
# 一条命令复现「Beat 原生菜单汉化」：
#   编译 universal dylib → 装进 Beat.zh.app/Contents/Frameworks → 注入 LC_LOAD_DYLIB（两个 slice）
#   → 街景按钮 'Capture snapshot' 原位补丁 → 重签 → 校验
#
# 前置：work/Beat.zh.app 必须已存在（= 路线 A 前端汉化 + 已 ad-hoc 重签的副本）
# 用法：bash artifacts/tools/menuzh/rebuild-menuzh.sh
set -euo pipefail

HERE="$(cd "$(dirname "$0")" && pwd)"
SAMPLE="$(cd "$HERE/../../.." && pwd)"
APP="$SAMPLE/work/Beat.zh.app"
BIN="$APP/Contents/MacOS/beat"

[ -d "$APP" ] || { echo "缺少 $APP（先跑 artifacts/tools/rebuild.sh 生成前端汉化副本）"; exit 1; }

echo "== 1/5 编译 BeatMenuZh.dylib (x86_64 + arm64) =="
clang -dynamiclib -fobjc-arc -O2 \
      -arch arm64 -arch x86_64 -mmacosx-version-min=11.0 \
      -framework AppKit -framework Foundation -lc++ -lsqlite3 \
      -install_name @executable_path/../Frameworks/BeatMenuZh.dylib \
      -o "$HERE/BeatMenuZh.dylib" "$HERE/BeatMenuZh.mm"

echo "== 2/5 装入 Frameworks =="
mkdir -p "$APP/Contents/Frameworks"
cp "$HERE/BeatMenuZh.dylib" "$APP/Contents/Frameworks/BeatMenuZh.dylib"

echo "== 3/5 注入 LC_LOAD_DYLIB + 街景按钮补丁（幂等） =="
python3 "$HERE/inject.py" "$BIN"

echo "== 4/5 重签 =="
codesign --force --sign - --timestamp=none "$APP/Contents/Frameworks/BeatMenuZh.dylib"
codesign --force --deep --sign - --timestamp=none "$APP"

echo "== 5/5 校验 =="
codesign --verify --deep --strict --verbose=2 "$APP"
otool -l "$BIN" | grep -c "BeatMenuZh.dylib"
shasum -a 256 "$BIN" "$APP/Contents/Frameworks/BeatMenuZh.dylib"

cat <<'EOF'
完成。验证：
  rm -f /tmp/beat_menu_zh.log /tmp/beat_menu_zh.summary
  open -a "$APP"      # 双击等价路径
  sleep 12; cat /tmp/beat_menu_zh.summary
回滚：
  rm -rf "$APP/Contents/Frameworks/BeatMenuZh.dylib"
  cp work/menuzh/rollback/beat.pre-dylib "$APP/Contents/MacOS/beat"
  codesign --force --deep --sign - --timestamp=none "$APP"
EOF
