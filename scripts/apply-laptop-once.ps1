param(
    [switch]$EnableAutoPullOnBoot,
    [switch]$SkipPull,
    [switch]$SkipEnvCheck,
    [bool]$InstallNow = $true
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

function Write-Step([string]$Message) {
    Write-Host "[laptop-setup] $Message" -ForegroundColor Cyan
}

function Invoke-PSFile([string]$FilePath, [string[]]$Arguments, [switch]$AllowFailure) {
    if (-not (Test-Path $FilePath)) {
        throw "Script not found: $FilePath"
    }

    & powershell -NoProfile -ExecutionPolicy Bypass -File $FilePath @Arguments
    $code = $LASTEXITCODE
    if (-not $AllowFailure -and $code -ne 0) {
        throw "Command failed: $FilePath $($Arguments -join ' ') (exit=$code)"
    }
    return $code
}

$repoRoot = (git rev-parse --show-toplevel 2>$null)
if (-not $repoRoot) {
    throw 'Git repository root not found.'
}
$repoRoot = $repoRoot.Trim()
Set-Location $repoRoot

$syncScript = Join-Path $repoRoot 'scripts/workstation-sync.ps1'
$profileScript = Join-Path $repoRoot 'scripts/register-sync-profile.ps1'
$envScript = Join-Path $repoRoot 'scripts/check-env-local.ps1'

Write-Step "Repo: $repoRoot"
Write-Step 'Syncing MCP config.'
Invoke-PSFile -FilePath $syncScript -Arguments @('-Mode', 'mcp-only') | Out-Null

if ($InstallNow) {
    Write-Step 'Registering PowerShell profile and applying now.'
    Invoke-PSFile -FilePath $profileScript -Arguments @('-RepoRoot', $repoRoot, '-InstallNow') | Out-Null
} else {
    Write-Step 'Registering PowerShell profile.'
    Invoke-PSFile -FilePath $profileScript -Arguments @('-RepoRoot', $repoRoot) | Out-Null
}

if (-not $SkipEnvCheck) {
    Write-Step 'Running env summary check.'
    $envExit = Invoke-PSFile -FilePath $envScript -Arguments @('-SummaryOnly') -AllowFailure
    if ($envExit -ne 0) {
        Write-Host '[laptop-setup] env required keys are missing. Fill .env.local files and rerun pnpm run sync:env.' -ForegroundColor Yellow
    }
}

if ($EnableAutoPullOnBoot) {
    Write-Step 'Enabling auto pull on boot.'
    setx SHT_AUTO_PULL_ON_BOOT 1 | Out-Null
    Write-Host '[laptop-setup] SHT_AUTO_PULL_ON_BOOT=1 saved for next sessions.' -ForegroundColor DarkGreen
}

if (-not $SkipPull) {
    Write-Step 'Running code/dependency sync pull.'
    Invoke-PSFile -FilePath $syncScript -Arguments @('-Mode', 'pull', '-AutoStash') | Out-Null
} else {
    Write-Host '[laptop-setup] pull step skipped. Run pnpm run sync:pull when ready.' -ForegroundColor DarkYellow
}

Write-Host '[laptop-setup] completed.' -ForegroundColor Green
