# Smithery Google Sheets MCP 자동 설정 스크립트
# 사용법: .\scripts\setup-smithery-google-sheets.ps1

Write-Host "========================================" -ForegroundColor Cyan
Write-Host "Smithery Google Sheets MCP 설정" -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan
Write-Host ""

# 1. Smithery CLI 버전 확인
Write-Host "[1/4] Smithery CLI 버전 확인..." -ForegroundColor Yellow
$version = npx -y smithery --version 2>&1
if ($version -match "^\d+\.\d+\.\d+") {
    Write-Host "✓ Smithery CLI 설치됨: v$version" -ForegroundColor Green
} else {
    Write-Host "✗ Smithery CLI 미설치. 다시 시도하세요." -ForegroundColor Red
    exit 1
}
Write-Host ""

# 2. Smithery 로그인 안내
Write-Host "[2/4] Smithery 계정 로그인 (수동)" -ForegroundColor Yellow
Write-Host "아래 명령을 실행하여 Smithery에 로그인하세요:" -ForegroundColor Cyan
Write-Host ""
Write-Host "  npx -y smithery login" -ForegroundColor White
Write-Host ""
Write-Host "그 후 다음 단계를 계속하세요." -ForegroundColor Yellow
Write-Host ""
$continue = Read-Host "로그인이 완료되었습니까? (y/n)"
if ($continue -ne 'y') {
    Write-Host "설정을 취소합니다." -ForegroundColor Yellow
    exit 0
}
Write-Host ""

# 3. Google Sheets MCP 추가
Write-Host "[3/4] Google Sheets MCP 추가..." -ForegroundColor Yellow
Write-Host "아래 명령을 실행하세요:" -ForegroundColor Cyan
Write-Host ""
Write-Host "  npx -y smithery mcp add googlesheets" -ForegroundColor White
Write-Host ""
Write-Host "Google OAuth 인증 창이 열립니다. 인증을 완료하세요." -ForegroundColor Yellow
Write-Host ""
$continue = Read-Host "Google Sheets MCP 추가가 완료되었습니까? (y/n)"
if ($continue -ne 'y') {
    Write-Host "설정을 취소합니다." -ForegroundColor Yellow
    exit 0
}
Write-Host ""

# 4. 설치 확인
Write-Host "[4/4] 설치 확인..." -ForegroundColor Yellow
Write-Host "아래 명령으로 설치된 도구를 확인하세요:" -ForegroundColor Cyan
Write-Host ""
Write-Host "  npx -y smithery tool list" -ForegroundColor White
Write-Host ""
Write-Host "Google Sheets 관련 도구가 표시되면 설정 완료입니다." -ForegroundColor Green
Write-Host ""

Write-Host "========================================" -ForegroundColor Cyan
Write-Host "설정 완료!" -ForegroundColor Green
Write-Host "========================================" -ForegroundColor Cyan
Write-Host ""
Write-Host "다음 단계:" -ForegroundColor Yellow
Write-Host "- Claude, GitHub Copilot에서 Google Sheets 도구 사용 가능" -ForegroundColor White
Write-Host "- Admin 앱의 기존 /admin/sheets-sync 기능은 변화 없음" -ForegroundColor White
Write-Host "- 자세한 정보는 docs/ADMIN-GOOGLE-SHEETS-MCP.md 참고" -ForegroundColor White
Write-Host ""
