#!/usr/bin/env bash
# bundle-python.sh
# 将完整 Python 目录打包到 src-tauri/resources/python/
# Tauri 将其打包进安装包，运行时通过 subprocess 调用 python.exe
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

# ── 前置检查 ──
command -v "$PYTHON" >/dev/null || error "Python not found at '$PYTHON'"
[ -f "$REQUIREMENTS" ] || error "requirements file not found: $REQUIREMENTS"

PY_VER=$("$PYTHON" -c "import sys; print(f'{sys.version_info.major}.{sys.version_info.minor}')")
PREFIX=$("$PYTHON" -c "import sys; print(sys.prefix)")
ARCH=$(uname)
[[ "$PY_VER" =~ ^3\.(1[1-9]|2[0-9])$ ]] || error "Python 3.11+ required, got $PY_VER"
info "Python $PY_VER at $PREFIX, target: $ARCH"

# ── 清理 ──
[ -d "$OUTPUT" ] && rm -rf "$OUTPUT"
mkdir -p "$OUTPUT"

# ── 1. 复制 python.exe ──
info "Copying python executable..."
case "$ARCH" in
  MINGW*|MSYS*|CYGWIN*)
    cp "$PREFIX/python.exe" "$OUTPUT/python.exe" 2>/dev/null \
      || cp "$PREFIX/bin/python.exe" "$OUTPUT/python.exe" 2>/dev/null \
      || error "Cannot find python.exe"
    ;;
  Linux|Darwin)
    cp "$PREFIX/bin/python$PY_VER" "$OUTPUT/python$PY_VER" 2>/dev/null \
      || cp "$(command -v python3)" "$OUTPUT/python3" 2>/dev/null \
      || error "Cannot find python binary"
    ;;
esac

# ── 2. 复制 DLL（Windows：排除系统 API 集） ──
info "Copying DLLs..."
case "$ARCH" in
  MINGW*|MSYS*|CYGWIN*)
    for dll in "$PREFIX"/*.dll; do
      [ -f "$dll" ] || continue
      base=$(basename "$dll")
      [[ "$base" == api-ms-win-* ]] && continue
      cp "$dll" "$OUTPUT/"
    done
    # Conda：DLL 也在 Library/bin/
    if [ -d "$PREFIX/Library/bin" ]; then
      for dll in "$PREFIX/Library/bin"/*.dll; do
        [ -f "$dll" ] || continue
        base=$(basename "$dll")
        [[ "$base" == api-ms-win-* ]] && continue
        [ -f "$OUTPUT/$base" ] && continue
        cp "$dll" "$OUTPUT/"
      done
    fi
    ;;
esac

# ── 3. 复制 Lib/（stdlib） ──
info "Copying stdlib..."
case "$ARCH" in
  MINGW*|MSYS*|CYGWIN*)
    "$PYTHON" -c "
import shutil, sys
from pathlib import Path
src = Path(sys.prefix) / 'Lib'
dst = Path('$OUTPUT/Lib')
dst.mkdir(parents=True, exist_ok=True)
skip_dirs = {'test','tests','tkinter','idlelib','turtledemo','__pycache__'}
for f in src.rglob('*.py'):
    rel = f.relative_to(src)
    if rel.parts and rel.parts[0] in skip_dirs:
        continue
    dest = dst / rel
    dest.parent.mkdir(parents=True, exist_ok=True)
    shutil.copy2(f, dest)
print('Stdlib copied')
"
    if [ ! -f "$OUTPUT/Lib/encodings/__init__.py" ]; then
      error "encodings not found at $OUTPUT/Lib/encodings/__init__.py"
    fi
    ;;
  Linux|Darwin)
    mkdir -p "$OUTPUT/lib/python$PY_VER"
    if command -v rsync &>/dev/null; then
      rsync -a --include='*.py' --include='*/' --exclude='*' \
        --exclude='test/' --exclude='tests/' --exclude='tkinter/' \
        --exclude='idlelib/' --exclude='turtledemo/' \
        "$PREFIX/lib/python$PY_VER/" "$OUTPUT/lib/python$PY_VER/"
    else
      cp "$PREFIX/lib/python$PY_VER"/*.py "$OUTPUT/lib/python$PY_VER/" 2>/dev/null || true
      for dir in "$PREFIX/lib/python$PY_VER"/*/; do
        base=$(basename "$dir")
        case "$base" in test|tests|tkinter|idlelib|turtledemo|__pycache__) continue ;; esac
        cp -r "$dir" "$OUTPUT/lib/python$PY_VER/" 2>/dev/null || true
      done
    fi
    ;;
esac

# ── 4. pip install 预装包 ──
info "Installing pip..."
"$PYTHON" -m ensurepip --upgrade --default-pip 2>&1 | while IFS= read -r line; do info "  $line"; done || true

case "$ARCH" in
  MINGW*|MSYS*|CYGWIN*)  PIP_TARGET="$OUTPUT/Lib/site-packages"  ;;
  *)                     PIP_TARGET="$OUTPUT/lib/python$PY_VER/site-packages" ;;
esac

info "Installing bundled packages..."
"$PYTHON" -m pip install --target="$PIP_TARGET" --disable-pip-version-check --no-input -r "$REQUIREMENTS" \
  2>&1 | while IFS= read -r line; do info "  pip: $line"; done

"$PYTHON" -m pip install --target="$PIP_TARGET" --disable-pip-version-check --no-input pip \
  2>&1 | while IFS= read -r line; do info "  pip: $line"; done

# ── 5. 预编译 .pyc ──
info "Pre-compiling .pyc..."
case "$ARCH" in
  MINGW*|MSYS*|CYGWIN*)  STDLIB_DST="$OUTPUT/Lib"  ;;
  *)                     STDLIB_DST="$OUTPUT/lib/python$PY_VER" ;;
esac
"$PYTHON" -m compileall -q -j 0 "$STDLIB_DST" 2>/dev/null || true

# ── 6. 清理 ──
info "Cleaning caches..."
find "$OUTPUT" -name '__pycache__' -exec rm -rf {} + 2>/dev/null || true
find "$OUTPUT" -name '*.pyc' -path '*/test/*' -delete 2>/dev/null || true

# ── 7. 体积报告 ──
info "Bundle size: $(du -sh "$OUTPUT" | cut -f1)"
FILE_COUNT=$(find "$OUTPUT" -type f 2>/dev/null | wc -l)
info "Bundle: $FILE_COUNT files"
info "Done! Bundle at: $OUTPUT"
