#!/usr/bin/env bash
# 打 tag → push → GitHub Actions 自动发 Release
# 用法: bash release.sh v2.3.2-zh.1
set -euo pipefail

VERSION="${1:-}"
if [ -z "$VERSION" ]; then
  echo "用法: bash release.sh v2.3.2-zh.1"
  exit 1
fi

cd "$(dirname "$0")"

if [ ! -f dist/Beat-zh.app.zip ]; then
  echo "缺少 dist/Beat-zh.app.zip，先重新打包："
  echo "  rm -rf dist/Beat-zh.app dist/Beat-zh.app.zip"
  echo "  cp -R /Applications/Beat.app dist/Beat-zh.app"
  echo "  ditto -c -k --keepParent dist/Beat-zh.app dist/Beat-zh.app.zip"
  echo "  rm -rf dist/Beat-zh.app"
  exit 1
fi

shasum -a 256 dist/Beat-zh.app.zip > dist/SHA256SUMS.txt
cat dist/SHA256SUMS.txt

git add -A
git commit -m "release $VERSION" || true
git tag -a "$VERSION" -m "Beat 中文版 $VERSION"
git push origin HEAD
git push origin "$VERSION"

echo "已推送 tag $VERSION，Actions 会自动创建 Release。"
echo "进度: https://github.com/Zalozheng/beta/actions"
