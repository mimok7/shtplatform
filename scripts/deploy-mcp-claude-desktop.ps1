# Claude Desktop에 Google Sheets MCP 배포
# Usage: .\scripts\deploy-mcp-claude-desktop.ps1

Write-Host "========================================" -ForegroundColor Cyan
Write-Host "Claude Desktop MCP 배포" -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan
Write-Host ""

# Claude Desktop 설정 파일 경로
$claudeConfigPath = "$env:APPDATA\Claude\claude_desktop_config.json"
Write-Host "[1/3] Claude Desktop 설정 경로" -ForegroundColor Yellow
Write-Host "Path: $claudeConfigPath" -ForegroundColor White
Write-Host ""

# 디렉토리 생성
Write-Host "[2/3] 설정 파일 준비..." -ForegroundColor Yellow
$claudeDir = "$env:APPDATA\Claude"
if (-not (Test-Path $claudeDir)) {
    New-Item -ItemType Directory -Path $claudeDir -Force | Out-Null
    Write-Host "Created Claude directory" -ForegroundColor Green
}

# 기존 설정 파일 읽기
if (Test-Path $claudeConfigPath) {
    $configContent = Get-Content $claudeConfigPath -Raw
    try {
        $config = $configContent | ConvertFrom-Json
        Write-Host "Existing config loaded" -ForegroundColor Green
    }
    catch {
        Write-Host "Config parse error, creating new" -ForegroundColor Yellow
        $config = @{ mcpServers = @{} }
    }
}
else {
    $config = @{ mcpServers = @{} }
    Write-Host "New config created" -ForegroundColor Green
}

# mcpServers 섹션 확인
if (-not $config.mcpServers) {
    $config | Add-Member -NotePropertyName "mcpServers" -NotePropertyValue @{} -Force
}

# Google Sheets MCP 추가
$config.mcpServers["sht-googlesheets"] = @{
    command = "npx"
    args = @("-y", "smithery", "run", "googlesheets")
    disabled = $false
}

Write-Host "Google Sheets MCP added to config" -ForegroundColor Green
Write-Host ""

# 설정 파일 저장
Write-Host "[3/3] 설정 파일 저장..." -ForegroundColor Yellow
$config | ConvertTo-Json -Depth 10 | Set-Content $claudeConfigPath -Encoding UTF8
Write-Host "Config saved successfully" -ForegroundColor Green
Write-Host ""

Write-Host "========================================" -ForegroundColor Green
Write-Host "배포 완료!" -ForegroundColor Green
Write-Host "========================================" -ForegroundColor Green
Write-Host ""

Write-Host "Next Steps:" -ForegroundColor Yellow
Write-Host "1. Close Claude Desktop completely" -ForegroundColor White
Write-Host "2. Restart Claude Desktop" -ForegroundColor White
Write-Host "3. Google Sheets tools will be available in Claude Chat" -ForegroundColor White
Write-Host ""
