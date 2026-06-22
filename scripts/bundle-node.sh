#!/usr/bin/env bash
# bundle-node.sh
# 下载并打包 Node.js 运行时到 src-tauri/resources/node/
# Tauri 将其打包进安装包，运行时通过 subprocess 调用 node.exe
#
# Usage:
#   export BUNDLE_NODE_VERSION=22.14.0  # 可选，默认 LTS
#   bash scripts/bundle-node.sh
#
set -euo pipefail

NODE_VERSION="${BUNDLE_NODE_VERSION:-22.14.0}"
OUTPUT="src-tauri/resources/node"
TMP_DIR="/tmp/node-bundle"

info()  { echo "[bundle-node] $*"; }
error() { echo "[bundle-node] ERROR: $*" >&2; exit 1; }

ARCH=$(uname)

# ── 确定平台和下载 URL ──
case "$ARCH" in
  MINGW*|MSYS*|CYGWIN*)
    PLATFORM="win-x64"
    EXT=".zip"
    ;;
  Linux)
    PLATFORM="linux-x64"
    EXT=".tar.xz"
    ;;
  Darwin)
    PLATFORM="darwin-x64"
    EXT=".tar.gz"
    ;;
  *)
    error "Unsupported platform: $ARCH"
    ;;
esac

URL="https://nodejs.org/dist/v${NODE_VERSION}/node-v${NODE_VERSION}-${PLATFORM}${EXT}"
info "Downloading Node.js v${NODE_VERSION} for ${PLATFORM}..."
info "URL: $URL"

# ── 下载 ──
command -v curl >/dev/null || error "curl is required"
[ -d "$TMP_DIR" ] && rm -rf "$TMP_DIR"
mkdir -p "$TMP_DIR"

curl -fsSL "$URL" -o "${TMP_DIR}/node${EXT}" || error "Download failed"

# ── 解压到 OUTPUT ──
info "Extracting..."
[ -d "$OUTPUT" ] && rm -rf "$OUTPUT"
mkdir -p "$OUTPUT"

case "$EXT" in
  .zip)
    unzip -q "${TMP_DIR}/node${EXT}" -d "$TMP_DIR/extracted"
    mv "$TMP_DIR/extracted"/*/* "$OUTPUT/"  # strip top-level dir
    ;;
  .tar.xz|.tar.gz)
    tar -xf "${TMP_DIR}/node${EXT}" -C "$TMP_DIR"
    mv "$TMP_DIR/node-v${NODE_VERSION}-${PLATFORM}"/* "$OUTPUT/"
    ;;
esac

# ── 验证 ──
if [ -f "$OUTPUT/bin/node" ] || [ -f "$OUTPUT/node.exe" ]; then
  info "Node.js bundled successfully"
  if [ -f "$OUTPUT/bin/node" ]; then
    "$OUTPUT/bin/node" --version
  else
    "$OUTPUT/node.exe" --version
  fi
else
  error "Node.js binary not found in output"
fi

# ── 清理临时文件 ──
rm -rf "$TMP_DIR"

# ── 体积报告 ──
info "Bundle size: $(du -sh "$OUTPUT" | cut -f1)"
info "Done! Bundle at: $OUTPUT"
