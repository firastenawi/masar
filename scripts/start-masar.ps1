# تشغيل مَسار للاستخدام اليومي (الواجهة والخادم معاً على المنفذ 3001).
# يبني الواجهة تلقائياً إن لم تكن مبنية أو إن تغيّر كودها منذ آخر بناء.
#   powershell -ExecutionPolicy Bypass -File scripts\start-masar.ps1
param([switch]$Hidden)

$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent $PSScriptRoot
Set-Location $root

$logDir = Join-Path $root 'data\logs'
New-Item -ItemType Directory -Force $logDir | Out-Null
$log = Join-Path $logDir 'masar.log'

$dist = Join-Path $root 'apps\web\dist\index.html'
$needsBuild = -not (Test-Path $dist)
if (-not $needsBuild) {
  $builtAt = (Get-Item $dist).LastWriteTime
  $newer = Get-ChildItem -Recurse -File (Join-Path $root 'apps\web\src'), (Join-Path $root 'apps\web\public'), (Join-Path $root 'packages\shared\src') |
    Where-Object { $_.LastWriteTime -gt $builtAt } | Select-Object -First 1
  $needsBuild = $null -ne $newer
}

if ($needsBuild) {
  Write-Host 'بناء الواجهة...' -ForegroundColor Cyan
  npm run build *>> $log
  if ($LASTEXITCODE -ne 0) { throw "فشل بناء الواجهة. راجع $log" }
}

Write-Host 'مَسار يعمل على http://localhost:3001  (أغلق النافذة أو Ctrl+C للإيقاف)' -ForegroundColor Green
if ($Hidden) {
  npm start *>> $log
} else {
  npm start
}
