# Deploy with Vercel MCP to Claude Desktop

Write-Host "========================================" -ForegroundColor Cyan
Write-Host "Vercel MCP Claude Desktop 배포" -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan
Write-Host ""

# Claude Desktop config file path
$claudeConfigPath = "$env:APPDATA\Claude\claude_desktop_config.json"
Write-Host "[1/4] Claude Desktop 설정 경로" -ForegroundColor Yellow
Write-Host "Path: $claudeConfigPath" -ForegroundColor White
Write-Host ""

# Create Claude directory if needed
Write-Host "[2/4] 설정 파일 준비..." -ForegroundColor Yellow
$claudeDir = "$env:APPDATA\Claude"
if (-not (Test-Path $claudeDir)) {
    New-Item -ItemType Directory -Path $claudeDir -Force | Out-Null
    Write-Host "Claude directory created" -ForegroundColor Green
}

# Read existing config
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

# Ensure mcpServers exists
if (-not $config.mcpServers) {
    $config | Add-Member -NotePropertyName "mcpServers" -NotePropertyValue @{} -Force
}

Write-Host ""
Write-Host "[3/4] MCP 서버 추가..." -ForegroundColor Yellow

# Add Google Sheets MCP
$config.mcpServers["sht-googlesheets"] = @{
    command = "npx"
    args = @("-y", "smithery", "run", "googlesheets")
    disabled = $false
}
Write-Host "Added: Google Sheets MCP" -ForegroundColor Green

# Add Vercel MCP
$config.mcpServers["vercel-mcp"] = @{
    command = "npx"
    args = @("-y", "smithery", "run", "vercel")
    disabled = $false
}
Write-Host "Added: Vercel MCP" -ForegroundColor Green

Write-Host ""

# Save config file
Write-Host "[4/4] 설정 파일 저장..." -ForegroundColor Yellow
$config | ConvertTo-Json -Depth 10 | Set-Content $claudeConfigPath -Encoding UTF8
Write-Host "Config saved successfully" -ForegroundColor Green
Write-Host ""

Write-Host "========================================" -ForegroundColor Green
Write-Host "배포 완료!" -ForegroundColor Green
Write-Host "========================================" -ForegroundColor Green
Write-Host ""

Write-Host "포함된 MCP 서버:" -ForegroundColor Yellow
Write-Host "  1. Google Sheets (sht-googlesheets)" -ForegroundColor White
Write-Host "  2. Vercel (vercel-mcp)" -ForegroundColor White
Write-Host ""

Write-Host "Next Steps:" -ForegroundColor Yellow
Write-Host "1. Close Claude Desktop completely" -ForegroundColor White
Write-Host "2. Restart Claude Desktop" -ForegroundColor White
Write-Host "3. Vercel tools will be available in Claude Chat" -ForegroundColor White
Write-Host ""

Write-Host "Vercel Commands Available:" -ForegroundColor Cyan
Write-Host "  - Check deployment status" -ForegroundColor Gray
Write-Host "  - Execute deployment" -ForegroundColor Gray
Write-Host "  - List projects" -ForegroundColor Gray
Write-Host "  - Manage environment variables" -ForegroundColor Gray
Write-Host "  - View build logs" -ForegroundColor Gray
Write-Host ""
