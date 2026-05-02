param(
    [ValidateSet('pull', 'mcp-only')]
    [string]$Mode = 'pull',
    [switch]$AutoStash,
    [switch]$SkipInstall,
    [switch]$NoMcpSync
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

function Write-Step([string]$Message) {
    Write-Host "[sync] $Message" -ForegroundColor Cyan
}

function Get-RepoRoot {
    $root = (git rev-parse --show-toplevel 2>$null)
    if (-not $root) {
        throw 'Git repository root not found. Run this script at repository root.'
    }
    return $root.Trim()
}

function Sync-McpConfig {
    $templatePath = Join-Path $PSScriptRoot 'mcp-template.json'
    if (-not (Test-Path $templatePath)) {
        throw "MCP template file not found: $templatePath"
    }

    $userMcpPath = Join-Path $env:APPDATA 'Code\User\mcp.json'
    $userDir = Split-Path -Parent $userMcpPath
    if (-not (Test-Path $userDir)) {
        New-Item -ItemType Directory -Force -Path $userDir | Out-Null
    }

    $templateRaw = Get-Content -Raw -Path $templatePath
    $template = $templateRaw | ConvertFrom-Json

    $current = $null
    if (Test-Path $userMcpPath) {
        $currentRaw = Get-Content -Raw -Path $userMcpPath
        if ($currentRaw.Trim()) {
            $current = $currentRaw | ConvertFrom-Json
        }
    }

    if (-not $current) {
        $current = [pscustomobject]@{
            servers = [ordered]@{}
            inputs = @()
        }
    }

    if (-not $current.PSObject.Properties.Name.Contains('servers') -or -not $current.servers) {
        $current | Add-Member -NotePropertyName servers -NotePropertyValue ([ordered]@{}) -Force
    }
    if (-not $current.PSObject.Properties.Name.Contains('inputs') -or -not $current.inputs) {
        $current | Add-Member -NotePropertyName inputs -NotePropertyValue @() -Force
    }

    $addedOrUpdated = 0
    foreach ($prop in $template.servers.PSObject.Properties) {
        $name = $prop.Name
        $value = $prop.Value
        $existing = $current.servers.PSObject.Properties[$name]

        if (-not $existing) {
            $current.servers | Add-Member -NotePropertyName $name -NotePropertyValue $value -Force
            $addedOrUpdated++
            continue
        }

        $newJson = ($value | ConvertTo-Json -Depth 100 -Compress)
        $oldJson = ($existing.Value | ConvertTo-Json -Depth 100 -Compress)
        if ($newJson -ne $oldJson) {
            $current.servers.$name = $value
            $addedOrUpdated++
        }
    }

    if (Test-Path $userMcpPath) {
        $backupPath = "$userMcpPath.bak"
        Copy-Item -Path $userMcpPath -Destination $backupPath -Force
    }

    $jsonOut = $current | ConvertTo-Json -Depth 100
    Set-Content -Path $userMcpPath -Value $jsonOut -Encoding UTF8

    Write-Step "MCP sync complete (added/updated: $addedOrUpdated)"
    Write-Step "User MCP file: $userMcpPath"
}

function Ensure-CleanOrStash {
    $dirty = git status --porcelain
    if (-not $dirty) {
        return $false
    }

    if (-not $AutoStash) {
        throw "Working tree has changes. Commit/stash first or rerun with -AutoStash."
    }

    Write-Step 'Auto-stashing local changes.'
    git stash push -u -m 'workstation-sync auto-stash' | Out-Null
    return $true
}

function Restore-StashIfNeeded([bool]$HasStashed) {
    if (-not $HasStashed) {
        return
    }

    Write-Step 'Restoring auto-stash.'
    git stash pop
}

function Sync-Pull {
    Write-Step 'Fetching latest commits from origin.'
    git fetch origin

    $hasStashed = Ensure-CleanOrStash
    try {
        Write-Step 'Pulling main with rebase.'
        git pull --rebase origin main
    }
    finally {
        Restore-StashIfNeeded -HasStashed:$hasStashed
    }

    if (-not $SkipInstall) {
        Write-Step 'Installing dependencies from lockfile.'
        pnpm install --frozen-lockfile
    }
}

$repoRoot = Get-RepoRoot
Set-Location $repoRoot
Write-Step "Repo: $repoRoot"

if (-not $NoMcpSync) {
    Sync-McpConfig
}

if ($Mode -eq 'pull') {
    Sync-Pull
    Write-Step 'Sync completed.'
} else {
    Write-Step 'MCP-only sync completed.'
}
