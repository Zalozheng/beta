#!/usr/bin/env bash
# Beat 2.3.2 汉化全流程构建
#   1) 前端：从英文原版提取 31 个内嵌 brotli 资源 → 替换中文 → 原位回压打补丁
#   2) 菜单：编译 BeatMenuZh.dylib → LC_LOAD_DYLIB 注入 → 街景按钮补丁 → 重签
#   3) 产物：src/work/Beat.zh.app
#
# 用法: bash build-all.sh [英文原件路径]
#   默认 /Applications/Beat.app.en.bak（安装汉化版时自动保留的英文原件）
set -euo pipefail

BASE="$(cd "$(dirname "$0")" && pwd)"
ORIG="${1:-/Applications/Beat.app.en.bak}"

if [ ! -d "$ORIG" ]; then
  echo "找不到英文原件目录: $ORIG"
  echo "用法: bash build-all.sh /path/to/Beat.app"
  exit 1
fi

echo "== 前端汉化 =="
bash "$BASE/src/artifacts/tools/rebuild.sh" "$ORIG"

echo "== 原生菜单汉化 + dylib 注入 =="
bash "$BASE/src/artifacts/tools/menuzh/rebuild-menuzh.sh"

echo "== 输出 =="
rm -rf "$BASE/Beat.zh.app.new"
cp -R "$BASE/src/work/Beat.zh.app" "$BASE/Beat.zh.app.new"
du -sh "$BASE/Beat.zh.app.new"
shasum -a 256 "$BASE/Beat.zh.app.new/Contents/MacOS/beat"
codesign --verify --deep --strict --verbose=2 "$BASE/Beat.zh.app.new"
echo "完成：$BASE/Beat.zh.app.new"
