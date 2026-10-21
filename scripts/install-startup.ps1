# يجعل مَسار يعمل تلقائياً عند تسجيل دخولك إلى Windows (في الخلفية، بلا نافذة).
# يضيف اختصاراً في مجلد بدء التشغيل الخاص بك فقط؛ لا يحتاج صلاحيات المدير.
#   تفعيل:  powershell -ExecutionPolicy Bypass -File scripts\install-startup.ps1
#   إلغاء:  powershell -ExecutionPolicy Bypass -File scripts\install-startup.ps1 -Remove
param([switch]$Remove)

$startup = [Environment]::GetFolderPath('Startup')
$shortcut = Join-Path $startup 'Masar.lnk'

if ($Remove) {
  if (Test-Path $shortcut) { Remove-Item $shortcut; Write-Host 'أُزيل التشغيل التلقائي.' }
  else { Write-Host 'التشغيل التلقائي غير مفعّل أصلاً.' }
  return
}

$script = Join-Path $PSScriptRoot 'start-masar.ps1'
$shell = New-Object -ComObject WScript.Shell
$link = $shell.CreateShortcut($shortcut)
$link.TargetPath = (Get-Command powershell.exe).Source
$link.Arguments = "-NoProfile -WindowStyle Hidden -ExecutionPolicy Bypass -File `"$script`" -Hidden"
$link.WorkingDirectory = Split-Path -Parent $PSScriptRoot
$link.Description = 'مَسار: إدارة التطور المهني'
$link.Save()

Write-Host "تم. سيعمل مَسار تلقائياً عند تسجيل الدخول. السجلات في data\logs\masar.log" -ForegroundColor Green
Write-Host "الاختصار: $shortcut"
