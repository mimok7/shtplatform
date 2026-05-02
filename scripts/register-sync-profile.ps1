param(
    [string]$RepoRoot,
  [switch]$InstallNow,
  [switch]$ResetProfile
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

if (-not $RepoRoot) {
    $RepoRoot = (git rev-parse --show-toplevel 2>$null)
    if (-not $RepoRoot) {
        throw 'Git repository root not found.'
    }
    $RepoRoot = $RepoRoot.Trim()
}

$profilePath = $PROFILE
$profileDir = Split-Path -Parent $profilePath
if (-not (Test-Path $profileDir)) {
    New-Item -ItemType Directory -Force -Path $profileDir | Out-Null
}
if (-not (Test-Path $profilePath)) {
    New-Item -ItemType File -Path $profilePath -Force | Out-Null
}

$start = '# >>> SHT_PLATFORM_BOOT_SYNC >>>'
$end = '# <<< SHT_PLATFORM_BOOT_SYNC <<<'

$repoPathEscaped = $RepoRoot.Replace("'", "''")

$template = @'
__START__
$ShtRepo = '__REPO__'
$ShtSyncScript = Join-Path $ShtRepo 'scripts/workstation-sync.ps1'
$ShtEnvCheckScript = Join-Path $ShtRepo 'scripts/check-env-local.ps1'

if (Test-Path $ShtSyncScript) {
  try {
    $bootUtc = (Get-CimInstance Win32_OperatingSystem).LastBootUpTime.ToUniversalTime().ToString('o')
    $stateDir = Join-Path $env:LOCALAPPDATA 'sht-platform'
    $stateFile = Join-Path $stateDir 'boot-sync-stamp.txt'
    if (-not (Test-Path $stateDir)) { New-Item -ItemType Directory -Force -Path $stateDir | Out-Null }

    $lastBootUtc = ''
    if (Test-Path $stateFile) {
      $lastBootUtc = (Get-Content -Raw -Path $stateFile).Trim()
    }

    if ($lastBootUtc -ne $bootUtc) {
      & powershell -NoProfile -ExecutionPolicy Bypass -File $ShtSyncScript -Mode mcp-only | Out-Null
      if (Test-Path $ShtEnvCheckScript) {
        & powershell -NoProfile -ExecutionPolicy Bypass -File $ShtEnvCheckScript -SummaryOnly | Out-Null
      }
      Set-Content -Path $stateFile -Value $bootUtc -Encoding UTF8
      Write-Host '[startup] sht-platform boot sync done (mcp + env check).' -ForegroundColor DarkCyan

      if ($env:SHT_AUTO_PULL_ON_BOOT -eq '1') {
        & powershell -NoProfile -ExecutionPolicy Bypass -File $ShtSyncScript -Mode pull -AutoStash
      } else {
        Write-Host '[startup] run pnpm run sync:pull for code/dependency sync.' -ForegroundColor DarkGray
      }
    }
  } catch {
    Write-Host ('[startup] boot sync skipped: ' + $_.Exception.Message) -ForegroundColor DarkYellow
  }
}
__END__
'@

$block = $template.Replace('__START__', $start).Replace('__END__', $end).Replace('__REPO__', $repoPathEscaped)

$current = Get-Content -Raw -Path $profilePath
$pattern = [regex]::Escape($start) + '[\s\S]*?' + [regex]::Escape($end)
if ($ResetProfile) {
  $updated = $block + "`r`n"
} else {
  while ($current -match $pattern) {
    $current = [regex]::Replace($current, $pattern, '', 1)
  }

  if ($current -and -not $current.EndsWith("`n")) {
    $current += "`r`n"
    }
  $updated = $current + "`r`n" + $block + "`r`n"
}

$backupPath = "$profilePath.bak"
Copy-Item -Path $profilePath -Destination $backupPath -Force
Set-Content -Path $profilePath -Value $updated -Encoding UTF8

Write-Host "Profile updated: $profilePath" -ForegroundColor Green
Write-Host "Backup created: $backupPath" -ForegroundColor DarkGreen

if ($InstallNow) {
    . $profilePath
    Write-Host 'Profile reloaded in current session.' -ForegroundColor Green
}
