# bundle-python.ps1
# 将完整 Python 目录打包到 src-tauri/resources/python/
# Tauri 将其打包进安装包，运行时通过 subprocess 调用 python.exe
#
# Usage:
#   $env:BUNDLE_PYTHON = "C:\Python313\python.exe"
#   .\scripts\bundle-python.ps1
#
param()

$ErrorActionPreference = "Stop"
$PYTHON = if ($env:BUNDLE_PYTHON) { $env:BUNDLE_PYTHON } else { "python" }
$OUTPUT = "src-tauri/resources/python"
$REQUIREMENTS = "scripts/requirements-bundle.txt"

function Write-Info { Write-Host "[bundle-python] $args" }

# ── 前置检查 ──
$pyVersion = & $PYTHON -c "import sys; print(f'{sys.version_info.major}.{sys.version_info.minor}')"
if ($LASTEXITCODE -ne 0) { throw "Python not found at '$PYTHON'" }
$pyPrefix = & $PYTHON -c "import sys; print(sys.prefix)"
Write-Info "Python $pyVersion at $pyPrefix"

# ── 清理 ──
if (Test-Path $OUTPUT) { Remove-Item -Recurse -Force $OUTPUT }
New-Item -ItemType Directory -Path $OUTPUT -Force | Out-Null

# ── 1. python.exe ──
Write-Info "Copying python executable..."
Copy-Item "$pyPrefix/python.exe" "$OUTPUT/python.exe"

# ── 2. DLL（排除系统 API 集） ──
Write-Info "Copying DLLs..."
Get-ChildItem "$pyPrefix/*.dll" -ErrorAction SilentlyContinue | Where-Object {
    $_.Name -notlike "api-ms-win-*"
} | ForEach-Object {
    Copy-Item $_.FullName "$OUTPUT/"
}
# Conda Library/bin/
$libBin = "$pyPrefix/Library/bin"
if (Test-Path $libBin) {
    Get-ChildItem "$libBin/*.dll" -ErrorAction SilentlyContinue | Where-Object {
        $_.Name -notlike "api-ms-win-*"
    } | ForEach-Object {
        if (-not (Test-Path "$OUTPUT/$($_.Name)")) { Copy-Item $_.FullName "$OUTPUT/" }
    }
}

# ── 3. Lib/（stdlib，用 Python 自身拷贝） ──
Write-Info "Copying stdlib..."
& $PYTHON -c @"
import shutil, sys
from pathlib import Path
src = Path(sys.prefix) / 'Lib'
dst = Path('$OUTPUT') / 'Lib'
dst.mkdir(parents=True, exist_ok=True)
skip = {'test','tests','tkinter','idlelib','turtledemo','__pycache__'}
for f in src.rglob('*.py'):
    rel = f.relative_to(src)
    if rel.parts and rel.parts[0] in skip: continue
    d = dst / rel; d.parent.mkdir(parents=True, exist_ok=True); shutil.copy2(f, d)
print('Stdlib copied')
"@
if (-not (Test-Path "$OUTPUT/Lib/encodings/__init__.py")) {
    throw "encodings not found"
}

# ── 4. pip install 预装包 ──
Write-Info "Installing pip..."
& $PYTHON -m ensurepip --upgrade --default-pip 2>&1 | ForEach-Object { Write-Info "  $_" }

Write-Info "Installing bundled packages..."
& $PYTHON -m pip install --target="$OUTPUT/Lib/site-packages" --disable-pip-version-check --no-input -r $REQUIREMENTS 2>&1 | ForEach-Object { Write-Info "  pip: $_" }
& $PYTHON -m pip install --target="$OUTPUT/Lib/site-packages" --disable-pip-version-check --no-input pip 2>&1 | ForEach-Object { Write-Info "  pip: $_" }

Write-Info "Installing pdf2md..."
& $PYTHON -m pip install --prefix="$OUTPUT" --disable-pip-version-check --no-input ../cli_tools_for_content_agent/pdf2md 2>&1 | ForEach-Object { Write-Info "  pip: $_" }

# ── 5. 预编译 .pyc ──
Write-Info "Pre-compiling .pyc..."
& $PYTHON -m compileall -q -j 0 "$OUTPUT/Lib" 2>&1 | Out-Null

# ── 6. 清理 ──
Write-Info "Cleaning caches..."
Get-ChildItem $OUTPUT -Recurse -Directory -Filter "__pycache__" -ErrorAction SilentlyContinue | Remove-Item -Recurse -Force
Get-ChildItem $OUTPUT -Recurse -Filter "*.pyc" | Where-Object { $_.FullName -match '\\test\\' } | Remove-Item -Force

# ── 7. pdf2md 默认配置模板 ──
Write-Info "Writing pdf2md config.json template..."
@"
{
  "providers": {
    "mineru": {
      "api_key": "",
      "api_base": "https://mineru.net"
    }
  }
}
"@ | Out-File -Encoding UTF8 "$OUTPUT/config.json"

# ── 8. 体积报告 ──
$size = (Get-ChildItem $OUTPUT -Recurse | Measure-Object -Property Length -Sum).Sum
$fileCount = (Get-ChildItem $OUTPUT -Recurse -File).Count
Write-Info "Bundle: $fileCount files, $([math]::Round($size / 1MB, 1)) MB"
Write-Info "Done! Bundle at: $OUTPUT"
