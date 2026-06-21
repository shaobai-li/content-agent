#!/usr/bin/env bash
# bundle-python.sh
# 打包 Python 运行时到 src-tauri/resources/python/，供 Tauri desktop 使用
# 执行时机：tauri build 之前（CI 或 local build 前置步骤）
#
# Usage:
#   export PYO3_PYTHON=/path/to/python3
#   bash scripts/bundle-python.sh
#
set -euo pipefail

PYTHON="${PYO3_PYTHON:-python3}"
OUTPUT="src-tauri/resources/python"
REQUIREMENTS="scripts/requirements-bundle.txt"

info()  { echo "[bundle-python] $*"; }
error() { echo "[bundle-python] ERROR: $*" >&2; exit 1; }

# ── 前置检查 ─────────────────────────────────────
command -v "$PYTHON" >/dev/null || error "Python not found at '$PYTHON'. Set PYO3_PYTHON env or install python3."
[ -f "$REQUIREMENTS" ] || error "requirements file not found: $REQUIREMENTS"

PY_VER=$("$PYTHON" -c "import sys; print(f'{sys.version_info.major}.{sys.version_info.minor}')")
PREFIX=$("$PYTHON" -c "import sys; print(sys.prefix)")
ARCH=$(uname)
[[ "$PY_VER" =~ ^3\.(1[1-9]|2[0-9])$ ]] || error "Python 3.11+ required, got $PY_VER"

info "Python $PY_VER at $PREFIX, target: $ARCH"

# ── 清理旧 bundle ────────────────────────────────
rm -rf "$OUTPUT"
mkdir -p "$OUTPUT/lib" "$OUTPUT/bin"

# ── 1. 复制 stdlib（精简） ─────────────────────────
info "Copying stdlib..."
mkdir -p "$OUTPUT/lib/python$PY_VER"
# rsync 语法：--include='*/' 保留目录结构，--include='*.py' 只匹配 .py 文件，
# --exclude='*' 排除其余。排除 test、tkinter 等非必需模块。
if command -v rsync &>/dev/null; then
    rsync -a --include='*.py' --include='*/' --exclude='*' \
      --exclude='test/' --exclude='tests/' \
      --exclude='tkinter/' --exclude='idlelib/' --exclude='turtledemo/' \
      --exclude='ensurepip/_bundled/' \
      "$PREFIX/lib/python$PY_VER/" "$OUTPUT/lib/python$PY_VER/"
    # 保留 ensurepip 用于安装 pip
    rsync -a "$PREFIX/lib/python$PY_VER/ensurepip/" "$OUTPUT/lib/python$PY_VER/ensurepip/"
else
    info "rsync not available, using cp fallback (stdlib may be larger)"
    cp -r "$PREFIX/lib/python$PY_VER"/*.py "$OUTPUT/lib/python$PY_VER/" 2>/dev/null || true
    # 至少复制必要模块
    for mod in os sys json re math datetime pathlib io collections functools itertools copy textwrap string enum abc typing inspect pprint hashlib base64 binascii struct pickle warnings contextlib logging configparser csv fractions decimal random statistics uuid xml zipfile tarfile tempfile shutil fileinput fnmatch glob linecache bisect heapq array weakref types numbers operator traceback pdb platform subprocess signal select socket ssl urllib http email html xmlrpc mimetypes webbrowser difflib pkgutil importlib ast tokenize keyword token unicodedata re reprlib codecs codeop threading multiprocessing concurrent queue selectors socketserver ctypes ctypes._endian ctypes.util distutils ensurepip; do
        [ -d "$PREFIX/lib/python$PY_VER/$mod" ] && cp -r "$PREFIX/lib/python$PY_VER/$mod" "$OUTPUT/lib/python$PY_VER/" 2>/dev/null || true
        [ -f "$PREFIX/lib/python$PY_VER/$mod.py" ] && cp "$PREFIX/lib/python$PY_VER/$mod.py" "$OUTPUT/lib/python$PY_VER/" 2>/dev/null || true
    done
fi

# ── 2. 复制 Python 可执行文件 ──────────────────────
case "$ARCH" in
  Linux)
    [ -f "$PREFIX/bin/python$PY_VER" ] && cp "$PREFIX/bin/python$PY_VER" "$OUTPUT/bin/"
    ;;
  Darwin)
    [ -f "$PREFIX/bin/python$PY_VER" ] && cp "$PREFIX/bin/python$PY_VER" "$OUTPUT/bin/"
    ;;
  MINGW*|MSYS*|CYGWIN*)
    cp "$PREFIX/python.exe" "$OUTPUT/bin/python$PY_VER.exe" 2>/dev/null \
      || cp "$PREFIX/bin/python.exe" "$OUTPUT/bin/python$PY_VER.exe" 2>/dev/null \
      || error "Cannot find python.exe"
    cp "$PREFIX/python3.dll" "$OUTPUT/" 2>/dev/null || true
    cp "$PREFIX/python${PY_VER//.}.dll" "$OUTPUT/" 2>/dev/null || true
    cp "$PREFIX/vcruntime140.dll" "$OUTPUT/" 2>/dev/null || true
    ;;
  *)
    error "Unsupported platform: $ARCH"
    ;;
esac

# ── 3. 复制 libpython 共享库（PyO3 链接用） ────────
info "Copying libpython..."
case "$ARCH" in
  Linux)
    LIB=$(find "$PREFIX/lib" -maxdepth 1 -name "libpython$PY_VER*.so*" | head -1)
    [ -n "$LIB" ] && cp "$LIB" "$OUTPUT/lib/" || info "libpython not found (may be statically linked)"
    ;;
  Darwin)
    LIB=$(find "$PREFIX/lib" -maxdepth 1 -name "libpython$PY_VER*.dylib" | head -1)
    [ -n "$LIB" ] && cp "$LIB" "$OUTPUT/lib/" || info "libpython not found (may be statically linked)"
    # 修正 dylib 的 install_name，使 dyld 能通过 rpath 找到
    if [ -n "$LIB" ]; then
        LIB_NAME=$(basename "$LIB")
        install_name_tool -id "@rpath/$LIB_NAME" "$OUTPUT/lib/$LIB_NAME" 2>/dev/null || true
    fi
    ;;
  MINGW*|MSYS*|CYGWIN*)
    # Windows DLL 已在步骤 2 中处理
    ;;
esac

# ── 4. pip install 预装包 + pip 本身 ───────────────
info "Installing pip..."
"$PYTHON" -m ensurepip --upgrade --default-pip 2>&1 | while IFS= read -r line; do info "  $line"; done || true

info "Installing bundled packages..."
"$PYTHON" -m pip install \
    --target="$OUTPUT/lib/python$PY_VER/site-packages" \
    --disable-pip-version-check \
    --no-input \
    -r "$REQUIREMENTS" \
    2>&1 | while IFS= read -r line; do info "  pip: $line"; done

# 确保 pip 本身也在 site-packages 中（供 PyO3 内 import pip 使用）
"$PYTHON" -m pip install \
    --target="$OUTPUT/lib/python$PY_VER/site-packages" \
    --disable-pip-version-check \
    --no-input \
    pip \
    2>&1 | while IFS= read -r line; do info "  pip: $line"; done

# ── 5. 清理 __pycache__ / .pyc ────────────────────
info "Cleaning caches..."
find "$OUTPUT" -name '__pycache__' -exec rm -rf {} + 2>/dev/null || true
find "$OUTPUT" -name '*.pyc' -delete
find "$OUTPUT" -name '*.opt-1.pyc' -delete 2>/dev/null || true
find "$OUTPUT" -name '*.opt-2.pyc' -delete 2>/dev/null || true

# ── 6. 体积报告 ───────────────────────────────────
info "Bundle size: $(du -sh "$OUTPUT" | cut -f1)"
info "Done! Bundle at: $OUTPUT"
