# Push current branch to all configured deploy remotes.
# Usage: .\scripts\push-all-remotes.ps1 [-Branch main]

param(
  [string]$Branch = "main"
)

$ErrorActionPreference = "Stop"
Set-Location -Path (Resolve-Path "$PSScriptRoot\..")

$remotes = @("origin", "manager", "customer")

foreach ($r in $remotes) {
  $exists = git remote get-url $r 2>$null
  if (-not $exists) {
    Write-Host "[skip] remote '$r' not configured" -ForegroundColor Yellow
    continue
  }
  Write-Host "[push] $r $Branch" -ForegroundColor Cyan
  git push $r "${Branch}:${Branch}"
}

Write-Host "Done." -ForegroundColor Green
