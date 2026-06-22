# bundle-node.ps1
# 下载并打包 Node.js 运行时到 src-tauri/resources/node/
#
# Usage:
#   .\scripts\bundle-node.ps1
#
param()

$ErrorActionPreference = "Stop"
$nodeVersion = if ($env:BUNDLE_NODE_VERSION) { $env:BUNDLE_NODE_VERSION } else { "22.14.0" }
$OUTPUT = "src-tauri/resources/node"
$TMP_DIR = "$env:TEMP\node-bundle"

function Write-Info { Write-Host "[bundle-node] $args" }

$URL = "https://nodejs.org/dist/v${nodeVersion}/node-v${nodeVersion}-win-x64.zip"
Write-Info "Downloading Node.js v${nodeVersion}..."
Write-Info "URL: $URL"

if (Test-Path $TMP_DIR) { Remove-Item -Recurse -Force $TMP_DIR }
New-Item -ItemType Directory -Path $TMP_DIR -Force | Out-Null

# 下载
$zipPath = "$TMP_DIR/node.zip"
try {
    Invoke-WebRequest -Uri $URL -OutFile $zipPath -UseBasicParsing
} catch {
    throw "Download failed: $_"
}

# 解压
Write-Info "Extracting..."
Expand-Archive -Path $zipPath -DestinationPath "$TMP_DIR/extracted"
$extractedDir = Get-ChildItem "$TMP_DIR/extracted" -Directory | Select-Object -First 1

if (Test-Path $OUTPUT) { Remove-Item -Recurse -Force $OUTPUT }
Move-Item $extractedDir.FullName $OUTPUT

# 验证
$nodeExe = "$OUTPUT/node.exe"
if (Test-Path $nodeExe) {
    $version = & $nodeExe --version
    Write-Info "Node.js bundled successfully: $version"
} else {
    throw "Node.js binary not found"
}

Remove-Item -Recurse -Force $TMP_DIR -ErrorAction SilentlyContinue

$size = (Get-ChildItem $OUTPUT -Recurse | Measure-Object -Property Length -Sum).Sum
Write-Info "Bundle: $([math]::Round($size / 1MB, 1)) MB"
Write-Info "Done! Bundle at: $OUTPUT"
