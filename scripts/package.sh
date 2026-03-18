#!/bin/bash

# Smart Bookmarks 打包脚本（使用系统 zip 命令）
# 适用于 Windows (Git Bash)、Linux、macOS

set -e

PROJECT_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
OUTPUT_DIR="$PROJECT_ROOT/dist"
PACKAGE_NAME="smart-bookmarks.zip"
PACKAGE_PATH="$OUTPUT_DIR/$PACKAGE_NAME"

echo "🚀 Smart Bookmarks 打包脚本"
echo ""

# 步骤 1: 构建项目
echo "1. 构建项目..."
cd "$PROJECT_ROOT"
npm run build
echo "✓ 构建完成"
echo ""

# 步骤 2: 创建输出目录
echo "2. 创建输出目录..."
mkdir -p "$OUTPUT_DIR"
echo "✓ 输出目录: $OUTPUT_DIR"
echo ""

# 步骤 3: 打包（使用系统 zip 命令）
echo "3. 正在打包..."
cd "$PROJECT_ROOT"

# 使用 zip 命令打包，排除不必要的文件
zip -r "$PACKAGE_PATH" \
  manifest.json \
  icons/ \
  src/ \
  assets/ \
  LICENSE \
  -x "*.log" \
  -x "*/.DS_Store" \
  >/dev/null

echo "✓ 打包完成: $PACKAGE_PATH"

# 显示文件大小
if command -v du >/dev/null 2>&1; then
  SIZE=$(du -h "$PACKAGE_PATH" | cut -f1)
  echo "   文件大小: $SIZE"
fi

echo ""
echo "✅ 打包完成！"
echo ""
echo "📦 包文件: $PACKAGE_PATH"
echo ""
echo "下一步:"
echo "1. 在浏览器中测试加载（解压后）"
echo "2. 上传到 Chrome Web Store Developer Dashboard"
echo "3. 填写商店信息并提交审核"
