param(
    [string[]]$Apps,
    [switch]$SummaryOnly,
    [switch]$FailOnRecommended
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

function Read-JsonFile([string]$Path) {
    if (-not (Test-Path $Path)) {
        throw "Config file not found: $Path"
    }
    return (Get-Content -Raw -Path $Path | ConvertFrom-Json)
}

function Read-EnvFile([string]$Path) {
    $map = @{}
    if (-not (Test-Path $Path)) {
        return $map
    }

    foreach ($line in Get-Content -Path $Path) {
        $trim = $line.Trim()
        if (-not $trim -or $trim.StartsWith('#')) {
            continue
        }

        $match = [regex]::Match($trim, '^(?:export\s+)?([A-Z][A-Z0-9_]*)\s*=\s*(.*)$')
        if (-not $match.Success) {
            continue
        }

        $key = $match.Groups[1].Value
        $value = $match.Groups[2].Value.Trim()

        if (($value.StartsWith('"') -and $value.EndsWith('"')) -or ($value.StartsWith("'") -and $value.EndsWith("'"))) {
            if ($value.Length -ge 2) {
                $value = $value.Substring(1, $value.Length - 2)
            }
        }

        $map[$key] = $value
    }

    return $map
}

function Is-Placeholder([string]$Value, $Patterns) {
    if (-not $Value) {
        return $false
    }
    foreach ($p in $Patterns) {
        if ($Value -match $p) {
            return $true
        }
    }
    return $false
}

$repoRoot = (git rev-parse --show-toplevel 2>$null)
if (-not $repoRoot) {
    throw 'Git repository root not found.'
}
$repoRoot = $repoRoot.Trim()

$configPath = Join-Path $PSScriptRoot 'env-required.json'
$config = Read-JsonFile -Path $configPath

$allAppDirs = Get-ChildItem -Path (Join-Path $repoRoot 'apps') -Directory | Select-Object -ExpandProperty Name
$targetApps = @()

if ($Apps -and $Apps.Count -gt 0) {
    foreach ($a in $Apps) {
        if ($allAppDirs -contains $a) {
            $targetApps += $a
        } else {
            throw "Unknown app: $a"
        }
    }
} else {
    $targetApps = $allAppDirs
}

$hasRequiredIssue = $false
$hasRecommendedIssue = $false
$summary = @()

foreach ($app in $targetApps) {
    $appPath = Join-Path (Join-Path $repoRoot 'apps') $app
    $envPath = Join-Path $appPath '.env.local'
    $kv = Read-EnvFile -Path $envPath

    $required = @($config.defaultRequired)
    $recommended = @()

    $appCfg = $config.apps.PSObject.Properties[$app]
    if ($appCfg) {
        if ($appCfg.Value.PSObject.Properties.Name -contains 'required') {
            $required += @($appCfg.Value.required)
        }
        if ($appCfg.Value.PSObject.Properties.Name -contains 'recommended') {
            $recommended += @($appCfg.Value.recommended)
        }
    }

    $required = $required | Where-Object { $_ } | Select-Object -Unique
    $recommended = $recommended | Where-Object { $_ } | Select-Object -Unique

    $missingRequired = @()
    $missingRecommended = @()
    $placeholderRequired = @()
    $placeholderRecommended = @()

    foreach ($k in $required) {
        $v = $kv[$k]
        if (-not $kv.ContainsKey($k) -or -not $v) {
            $missingRequired += $k
            continue
        }
        if (Is-Placeholder -Value $v -Patterns $config.placeholderPatterns) {
            $placeholderRequired += $k
        }
    }

    foreach ($k in $recommended) {
        $v = $kv[$k]
        if (-not $kv.ContainsKey($k) -or -not $v) {
            $missingRecommended += $k
            continue
        }
        if (Is-Placeholder -Value $v -Patterns $config.placeholderPatterns) {
            $placeholderRecommended += $k
        }
    }

    if ($missingRequired.Count -gt 0 -or $placeholderRequired.Count -gt 0) {
        $hasRequiredIssue = $true
    }
    if ($missingRecommended.Count -gt 0 -or $placeholderRecommended.Count -gt 0) {
        $hasRecommendedIssue = $true
    }

    $summary += [pscustomobject]@{
        app = $app
        envFile = if (Test-Path $envPath) { 'yes' } else { 'no' }
        requiredMissing = $missingRequired.Count
        requiredPlaceholder = $placeholderRequired.Count
        recommendedMissing = $missingRecommended.Count
        recommendedPlaceholder = $placeholderRecommended.Count
    }

    if (-not $SummaryOnly) {
        Write-Host "`n[$app]" -ForegroundColor Cyan
        Write-Host "  .env.local: $(if (Test-Path $envPath) { $envPath } else { 'missing' })"

        if ($missingRequired.Count -eq 0 -and $placeholderRequired.Count -eq 0) {
            Write-Host '  required: ok' -ForegroundColor Green
        } else {
            if ($missingRequired.Count -gt 0) {
                Write-Host "  required missing: $($missingRequired -join ', ')" -ForegroundColor Red
            }
            if ($placeholderRequired.Count -gt 0) {
                Write-Host "  required placeholder: $($placeholderRequired -join ', ')" -ForegroundColor Red
            }
        }

        if ($missingRecommended.Count -eq 0 -and $placeholderRecommended.Count -eq 0) {
            Write-Host '  recommended: ok' -ForegroundColor DarkGreen
        } else {
            if ($missingRecommended.Count -gt 0) {
                Write-Host "  recommended missing: $($missingRecommended -join ', ')" -ForegroundColor Yellow
            }
            if ($placeholderRecommended.Count -gt 0) {
                Write-Host "  recommended placeholder: $($placeholderRecommended -join ', ')" -ForegroundColor Yellow
            }
        }
    }
}

Write-Host "`nEnv check summary" -ForegroundColor Cyan
$summary | Format-Table -AutoSize

if ($hasRequiredIssue) {
    Write-Error 'Required env key issues detected.'
    exit 1
}

if ($FailOnRecommended -and $hasRecommendedIssue) {
    Write-Error 'Recommended env key issues detected and FailOnRecommended is enabled.'
    exit 2
}

Write-Host 'Env check passed.' -ForegroundColor Green
