# تسجيل دخول Claude Code الذي يستخدمه مساعد مَسار.
# يحذف متغيرات CLAUDE_* و ANTHROPIC_* من هذه النافذة فقط (لو فُتحت من داخل تطبيق Claude)،
# حتى يُحفظ تسجيل الدخول في مكانه الطبيعي: C:\Users\<you>\.claude
Get-ChildItem Env: |
  Where-Object { $_.Name -match '^(CLAUDE|ANTHROPIC)' -and $_.Name -ne 'CLAUDE_CONFIG_DIR' } |
  ForEach-Object { Remove-Item "Env:$($_.Name)" }

$claude = Join-Path $env:APPDATA 'npm\node_modules\@anthropic-ai\claude-code\bin\claude.exe'
if (-not (Test-Path $claude)) { $claude = 'claude' }

Write-Host 'سيُفتح المتصفح: سجّل الدخول بحساب Claude الخاص بك (الاشتراك)...' -ForegroundColor Cyan
& $claude auth login
Write-Host ''
Write-Host 'حالة تسجيل الدخول:' -ForegroundColor Cyan
& $claude auth status
